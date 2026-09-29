-- Vendas passam a guardar forma de pagamento, custo e lucro (antes se perdiam ao sincronizar,
-- e o relatório mostrava "pagamento não informado" e lucro R$ 0,00). Aditivo e retrocompatível.
alter table public.inventory_v1_sales
  add column if not exists payment_method text check (payment_method in ('pix', 'card', 'cash')),
  add column if not exists payment_confirmed_at timestamptz,
  add column if not exists cogs_cents bigint,
  add column if not exists gross_profit_cents bigint;
alter table public.inventory_v1_sale_items
  add column if not exists unit_cost_cents bigint,
  add column if not exists line_cost_cents bigint;

create or replace function public.inventory_v1_get_state(p_installation_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  with target_store as (
    select id from public.inventory_v1_stores where installation_id = p_installation_id limit 1
  ),
  product_rows as (
    select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id', p.id, 'barcode', p.barcode, 'name', p.name, 'unit', p.unit,
      'priceCents', p.price_cents, 'averageCostCents', p.average_cost_cents,
      'stockMilli', p.stock_milli, 'minStockMilli', p.min_stock_milli,
      'catalogSource', p.catalog_source, 'catalogBrand', p.catalog_brand,
      'catalogImageUrl', p.catalog_image_url, 'deletedAt', p.deleted_at
    )) order by p.created_at), '[]'::jsonb) as products
    from public.inventory_v1_products p join target_store s on s.id=p.store_id
  ),
  sale_rows as (
    select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id', s.id, 'createdAt', s.sold_at, 'totalCents', s.total_cents,
      'cogsCents', s.cogs_cents, 'grossProfitCents', s.gross_profit_cents,
      'payment', case when s.payment_method is not null then jsonb_build_object('method', s.payment_method, 'confirmedAt', coalesce(s.payment_confirmed_at, s.sold_at)) end,
      'items', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'productId', i.product_id, 'quantityMilli', i.quantity_milli,
        'unitPriceCents', i.unit_price_cents, 'lineTotalCents', i.line_total_cents,
        'unitCostCents', i.unit_cost_cents, 'lineCostCents', i.line_cost_cents
      ))) from public.inventory_v1_sale_items i where i.sale_id=s.id), '[]'::jsonb)
    )) order by s.sold_at desc), '[]'::jsonb) as sales
    from public.inventory_v1_sales s join target_store t on t.id=s.store_id
  ),
  movement_rows as (
    select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id', m.id, 'productId', m.product_id, 'type', m.movement_type,
      'quantityMilli', m.quantity_milli, 'createdAt', m.moved_at, 'note', m.note,
      'supplierDocument', m.supplier_document, 'supplierName', m.supplier_name,
      'invoiceKey', m.invoice_key, 'invoiceNumber', m.invoice_number
    )) order by m.moved_at), '[]'::jsonb) as movements
    from public.inventory_v1_movements m join target_store s on s.id=m.store_id
  ),
  setting_row as (
    select coalesce(st.scale_rule, '{}'::jsonb) as scale_rule
    from public.inventory_v1_settings st join target_store s on s.id=st.store_id
    limit 1
  )
  select case when exists(select 1 from target_store) then jsonb_build_object(
    'found', true,
    'version', 'v10.5',
    'state', jsonb_build_object(
      'products', (select products from product_rows),
      'sales', (select sales from sale_rows),
      'movements', (select movements from movement_rows),
      'scaleRule', coalesce((select scale_rule from setting_row),'{}'::jsonb)
    )
  ) else jsonb_build_object('found', false, 'version', 'v10.5') end;
$$;

create or replace function public.inventory_v1_sync_state(p_installation_id uuid, p_state jsonb, p_app_version text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_store_id uuid;
  v_product jsonb;
  v_sale jsonb;
  v_item jsonb;
  v_move jsonb;
  v_rule jsonb;
  v_method text;
begin
  if p_installation_id is null then raise exception 'installation id required'; end if;
  if jsonb_typeof(coalesce(p_state->'products','[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_state->'sales','[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_state->'movements','[]'::jsonb)) <> 'array' then
    raise exception 'invalid state';
  end if;

  insert into public.inventory_v1_stores (installation_id, updated_at)
  values (p_installation_id, now())
  on conflict (installation_id) do update set updated_at = excluded.updated_at
  returning id into v_store_id;

  delete from public.inventory_v1_sale_items where sale_id in (select id from public.inventory_v1_sales where store_id = v_store_id);
  delete from public.inventory_v1_sales where store_id = v_store_id;
  delete from public.inventory_v1_movements where store_id = v_store_id;
  delete from public.inventory_v1_products where store_id = v_store_id;

  for v_product in select value from jsonb_array_elements(coalesce(p_state->'products','[]'::jsonb)) loop
    insert into public.inventory_v1_products (
      id, store_id, barcode, name, unit, price_cents, average_cost_cents, stock_milli,
      min_stock_milli, catalog_source, catalog_brand, catalog_image_url, deleted_at, updated_at
    ) values (
      (v_product->>'id')::uuid,
      v_store_id,
      coalesce(v_product->>'barcode',''),
      coalesce(v_product->>'name',''),
      case when v_product->>'unit' = 'KG' then 'KG' else 'UN' end,
      coalesce((v_product->>'priceCents')::bigint,0),
      coalesce((v_product->>'averageCostCents')::bigint,0),
      coalesce((v_product->>'stockMilli')::bigint,0),
      coalesce((v_product->>'minStockMilli')::bigint,0),
      nullif(v_product->>'catalogSource',''),
      nullif(v_product->>'catalogBrand',''),
      nullif(v_product->>'catalogImageUrl',''),
      nullif(v_product->>'deletedAt','')::timestamptz,
      now()
    );
  end loop;

  for v_sale in select value from jsonb_array_elements(coalesce(p_state->'sales','[]'::jsonb)) loop
    v_method := v_sale->'payment'->>'method';
    if v_method not in ('pix', 'card', 'cash') then v_method := null; end if;
    insert into public.inventory_v1_sales (id, store_id, total_cents, sold_at, payment_method, payment_confirmed_at, cogs_cents, gross_profit_cents)
    values (
      (v_sale->>'id')::uuid, v_store_id, coalesce((v_sale->>'totalCents')::bigint,0), coalesce((v_sale->>'createdAt')::timestamptz, now()),
      v_method,
      case when v_method is not null then nullif(v_sale->'payment'->>'confirmedAt','')::timestamptz end,
      (v_sale->>'cogsCents')::bigint,
      (v_sale->>'grossProfitCents')::bigint
    );

    for v_item in select value from jsonb_array_elements(coalesce(v_sale->'items','[]'::jsonb)) loop
      insert into public.inventory_v1_sale_items (sale_id, product_id, quantity_milli, unit_price_cents, line_total_cents, unit_cost_cents, line_cost_cents)
      values ((v_sale->>'id')::uuid, (v_item->>'productId')::uuid, (v_item->>'quantityMilli')::bigint, (v_item->>'unitPriceCents')::bigint, (v_item->>'lineTotalCents')::bigint,
        (v_item->>'unitCostCents')::bigint, (v_item->>'lineCostCents')::bigint);
    end loop;
  end loop;

  for v_move in select value from jsonb_array_elements(coalesce(p_state->'movements','[]'::jsonb)) loop
    insert into public.inventory_v1_movements (
      id, store_id, product_id, movement_type, quantity_milli, note, moved_at,
      supplier_document, supplier_name, invoice_key, invoice_number
    ) values (
      (v_move->>'id')::uuid,
      v_store_id,
      (v_move->>'productId')::uuid,
      v_move->>'type',
      (v_move->>'quantityMilli')::bigint,
      coalesce(v_move->>'note',''),
      coalesce((v_move->>'createdAt')::timestamptz, now()),
      nullif(v_move->>'supplierDocument',''),
      nullif(v_move->>'supplierName',''),
      nullif(v_move->>'invoiceKey',''),
      nullif(v_move->>'invoiceNumber','')
    );
  end loop;

  v_rule := coalesce(p_state->'scaleRule','{}'::jsonb);
  insert into public.inventory_v1_settings (store_id, scale_rule, app_version, updated_at)
  values (v_store_id, v_rule, p_app_version, now())
  on conflict (store_id) do update set scale_rule = excluded.scale_rule, app_version = excluded.app_version, updated_at = now();

  return v_store_id;
end;
$$;
