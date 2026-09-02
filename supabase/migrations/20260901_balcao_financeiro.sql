-- BALCÃO Financeiro
-- Provider-neutral financial storage for mock data now and Malvo later.

alter table public.balcao_staff_store_access
  drop constraint if exists balcao_staff_store_access_role_check;

alter table public.balcao_staff_store_access
  add constraint balcao_staff_store_access_role_check
  check (role in ('stock', 'cashier', 'finance', 'manager', 'custom'));

create table if not exists public.balcao_finance_accounts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.balcao_businesses(id) on delete cascade,
  store_id uuid not null references public.inventory_v1_stores(id) on delete cascade,
  provider text not null default 'mock',
  external_id text not null,
  institution_name text not null,
  account_name text,
  account_type text,
  masked_number text,
  balance_cents bigint not null default 0,
  currency text not null default 'BRL',
  status text not null default 'active' check (status in ('active', 'disconnected', 'error')),
  source text not null default 'mock' check (source in ('mock', 'malvo', 'manual')),
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, provider, external_id)
);

create table if not exists public.balcao_finance_transactions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.balcao_businesses(id) on delete cascade,
  store_id uuid not null references public.inventory_v1_stores(id) on delete cascade,
  account_id uuid not null references public.balcao_finance_accounts(id) on delete cascade,
  external_id text not null,
  posted_at timestamptz not null,
  amount_cents bigint not null check (amount_cents <> 0),
  description text not null,
  counterparty_name text,
  counterparty_tax_id text,
  category text not null default 'Outros',
  category_confidence numeric(5,4) check (category_confidence is null or (category_confidence >= 0 and category_confidence <= 1)),
  transaction_type text,
  is_internal_transfer boolean not null default false,
  source text not null default 'mock' check (source in ('mock', 'malvo', 'manual')),
  created_at timestamptz not null default now(),
  unique (account_id, external_id)
);

create table if not exists public.balcao_finance_daily_metrics (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.balcao_businesses(id) on delete cascade,
  store_id uuid not null references public.inventory_v1_stores(id) on delete cascade,
  metric_date date not null,
  sales_cents bigint not null default 0 check (sales_cents >= 0),
  cogs_cents bigint not null default 0 check (cogs_cents >= 0),
  units_sold_milli bigint not null default 0 check (units_sold_milli >= 0),
  source text not null default 'mock' check (source in ('mock', 'derived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, metric_date, source)
);

create index if not exists balcao_finance_accounts_store_idx
  on public.balcao_finance_accounts(store_id, status);
create index if not exists balcao_finance_transactions_store_date_idx
  on public.balcao_finance_transactions(store_id, posted_at desc);
create index if not exists balcao_finance_transactions_business_date_idx
  on public.balcao_finance_transactions(business_id, posted_at desc);
create index if not exists balcao_finance_daily_metrics_store_date_idx
  on public.balcao_finance_daily_metrics(store_id, metric_date desc);

alter table public.balcao_finance_accounts enable row level security;
alter table public.balcao_finance_transactions enable row level security;
alter table public.balcao_finance_daily_metrics enable row level security;

-- Finance rows are intentionally server-only. The browser must use the
-- authenticated Next.js finance endpoint, which applies Balcão authorization.
revoke all on table public.balcao_finance_accounts from public, anon, authenticated;
revoke all on table public.balcao_finance_transactions from public, anon, authenticated;
revoke all on table public.balcao_finance_daily_metrics from public, anon, authenticated;

grant all on table public.balcao_finance_accounts to service_role;
grant all on table public.balcao_finance_transactions to service_role;
grant all on table public.balcao_finance_daily_metrics to service_role;

-- allowed_custom_permissions:
-- inventory.view, inventory.write, products.lookup, products.manage,
-- checkout.sell, sales.view, analysis.financial
create or replace function private.balcao_operational_permissions_valid(p_permissions jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    jsonb_typeof(coalesce(p_permissions, '[]'::jsonb)) = 'array'
    and not exists (
      select 1
      from jsonb_array_elements_text(coalesce(p_permissions, '[]'::jsonb)) as permission(value)
      where permission.value not in (
        'inventory.view',
        'inventory.write',
        'products.lookup',
        'products.manage',
        'checkout.sell',
        'sales.view',
        'analysis.financial'
      )
    );
$$;

revoke all on function private.balcao_operational_permissions_valid(jsonb) from public, anon, authenticated;
grant execute on function private.balcao_operational_permissions_valid(jsonb) to service_role;

-- Return custom permissions with staff so the management screen can describe
-- a personalized access accurately.
drop function if exists public.balcao_list_staff(uuid);
create function public.balcao_list_staff(p_store_id uuid)
returns table (
  staff_id uuid,
  display_name text,
  staff_role text,
  custom_permissions jsonb,
  is_active boolean,
  google_linked boolean
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict error
declare
  v_user_id uuid := auth.uid();
  v_business_id uuid;
  v_manager_role text;
begin
  if v_user_id is null then
    raise exception 'BALCAO_NOT_AUTHENTICATED';
  end if;

  select s.business_id
    into v_business_id
  from public.inventory_v1_stores as s
  where s.id = p_store_id
    and s.active;

  if v_business_id is null then
    raise exception 'BALCAO_STORE_NOT_FOUND';
  end if;

  select m.role
    into v_manager_role
  from public.balcao_business_members as m
  where m.business_id = v_business_id
    and m.user_id = v_user_id
    and m.active;

  if v_manager_role is null or v_manager_role not in ('owner', 'admin', 'manager') then
    raise exception 'BALCAO_STAFF_FORBIDDEN';
  end if;

  return query
  select
    p.id,
    p.display_name,
    a.role,
    a.custom_permissions,
    (p.active and a.active),
    (p.google_user_id is not null)
  from public.balcao_staff_store_access as a
  join public.balcao_staff_profiles as p on p.id = a.staff_id
  where a.store_id = p_store_id
    and p.business_id = v_business_id
  order by p.created_at asc;
end;
$$;

revoke all on function public.balcao_list_staff(uuid) from public, anon;
grant execute on function public.balcao_list_staff(uuid) to authenticated, service_role;

create or replace function public.balcao_create_staff(
  p_store_id uuid,
  p_display_name text,
  p_role text,
  p_pin_hash text,
  p_custom_permissions jsonb default '[]'::jsonb
)
returns table (
  staff_id uuid,
  display_name text,
  staff_role text,
  is_active boolean
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict error
declare
  v_user_id uuid := auth.uid();
  v_business_id uuid;
  v_manager_role text;
  v_staff_id uuid;
  v_permissions jsonb := coalesce(p_custom_permissions, '[]'::jsonb);
  v_now timestamptz := now();
begin
  if v_user_id is null then
    raise exception 'BALCAO_NOT_AUTHENTICATED';
  end if;

  if length(btrim(coalesce(p_display_name, ''))) < 2
     or length(btrim(coalesce(p_display_name, ''))) > 80
     or p_role not in ('stock', 'cashier', 'finance', 'manager', 'custom')
     or length(coalesce(p_pin_hash, '')) < 20
     or not private.balcao_operational_permissions_valid(v_permissions)
     or (p_role = 'custom' and jsonb_array_length(v_permissions) = 0)
     or (p_role <> 'custom' and jsonb_array_length(v_permissions) <> 0) then
    raise exception 'BALCAO_INVALID_STAFF';
  end if;

  select s.business_id
    into v_business_id
  from public.inventory_v1_stores as s
  where s.id = p_store_id
    and s.active;

  if v_business_id is null then
    raise exception 'BALCAO_STORE_NOT_FOUND';
  end if;

  select m.role
    into v_manager_role
  from public.balcao_business_members as m
  where m.business_id = v_business_id
    and m.user_id = v_user_id
    and m.active;

  if v_manager_role is null or v_manager_role not in ('owner', 'admin', 'manager') then
    raise exception 'BALCAO_STAFF_FORBIDDEN';
  end if;

  insert into public.balcao_staff_profiles (
    business_id,
    display_name,
    pin_hash,
    active,
    failed_pin_attempts,
    created_by,
    created_at,
    updated_at
  ) values (
    v_business_id,
    btrim(p_display_name),
    p_pin_hash,
    true,
    0,
    v_user_id,
    v_now,
    v_now
  )
  returning id into v_staff_id;

  insert into public.balcao_staff_store_access (
    staff_id,
    store_id,
    role,
    custom_permissions,
    active,
    created_at,
    updated_at
  ) values (
    v_staff_id,
    p_store_id,
    p_role,
    case when p_role = 'custom' then v_permissions else '[]'::jsonb end,
    true,
    v_now,
    v_now
  );

  insert into public.balcao_audit_events (
    business_id,
    store_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata,
    created_at
  ) values (
    v_business_id,
    p_store_id,
    v_user_id,
    'staff.created',
    'staff',
    v_staff_id::text,
    jsonb_build_object('role', p_role, 'customPermissions', case when p_role = 'custom' then v_permissions else '[]'::jsonb end),
    v_now
  );

  return query
  select v_staff_id, btrim(p_display_name), p_role, true;
end;
$$;

revoke all on function public.balcao_create_staff(uuid, text, text, text, jsonb) from public, anon;
grant execute on function public.balcao_create_staff(uuid, text, text, text, jsonb) to authenticated, service_role;

create or replace function public.balcao_update_staff(
  p_store_id uuid,
  p_staff_id uuid,
  p_display_name text default null,
  p_role text default null,
  p_custom_permissions jsonb default null,
  p_active boolean default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict error
declare
  v_user_id uuid := auth.uid();
  v_business_id uuid;
  v_manager_role text;
  v_now timestamptz := now();
  v_staff_exists boolean := false;
  v_current_role text;
  v_current_permissions jsonb;
  v_next_role text;
  v_next_permissions jsonb;
begin
  if v_user_id is null then
    raise exception 'BALCAO_NOT_AUTHENTICATED';
  end if;

  if p_display_name is not null and (length(btrim(p_display_name)) < 2 or length(btrim(p_display_name)) > 80) then
    raise exception 'BALCAO_INVALID_STAFF';
  end if;
  if p_role is not null and p_role not in ('stock', 'cashier', 'finance', 'manager', 'custom') then
    raise exception 'BALCAO_INVALID_STAFF';
  end if;
  if p_custom_permissions is not null and not private.balcao_operational_permissions_valid(p_custom_permissions) then
    raise exception 'BALCAO_INVALID_STAFF';
  end if;

  select s.business_id
    into v_business_id
  from public.inventory_v1_stores as s
  where s.id = p_store_id
    and s.active;

  if v_business_id is null then
    raise exception 'BALCAO_STORE_NOT_FOUND';
  end if;

  select m.role
    into v_manager_role
  from public.balcao_business_members as m
  where m.business_id = v_business_id
    and m.user_id = v_user_id
    and m.active;

  if v_manager_role is null or v_manager_role not in ('owner', 'admin', 'manager') then
    raise exception 'BALCAO_STAFF_FORBIDDEN';
  end if;

  select a.role, a.custom_permissions
    into v_current_role, v_current_permissions
  from public.balcao_staff_profiles as p
  join public.balcao_staff_store_access as a on a.staff_id = p.id
  where p.id = p_staff_id
    and p.business_id = v_business_id
    and a.store_id = p_store_id;

  v_staff_exists := v_current_role is not null;
  if not v_staff_exists then
    raise exception 'BALCAO_STAFF_NOT_FOUND';
  end if;

  v_next_role := coalesce(p_role, v_current_role);
  v_next_permissions := case
    when v_next_role = 'custom' then coalesce(p_custom_permissions, v_current_permissions, '[]'::jsonb)
    else '[]'::jsonb
  end;

  if not private.balcao_operational_permissions_valid(v_next_permissions)
     or (v_next_role = 'custom' and jsonb_array_length(v_next_permissions) = 0)
     or (v_next_role <> 'custom' and jsonb_array_length(v_next_permissions) <> 0) then
    raise exception 'BALCAO_INVALID_STAFF';
  end if;

  if p_display_name is not null or p_active is not null then
    update public.balcao_staff_profiles as p
    set display_name = coalesce(btrim(p_display_name), p.display_name),
        active = coalesce(p_active, p.active),
        updated_at = v_now
    where p.id = p_staff_id
      and p.business_id = v_business_id;
  end if;

  if p_role is not null or p_custom_permissions is not null or p_active is not null then
    update public.balcao_staff_store_access as a
    set role = v_next_role,
        custom_permissions = v_next_permissions,
        active = coalesce(p_active, a.active),
        updated_at = v_now
    where a.staff_id = p_staff_id
      and a.store_id = p_store_id;
  end if;

  if p_active is false then
    update public.balcao_staff_sessions as ss
    set revoked_at = v_now
    where ss.staff_id = p_staff_id
      and ss.revoked_at is null;
  end if;

  insert into public.balcao_audit_events (
    business_id, store_id, actor_user_id, action, entity_type, entity_id, metadata, created_at
  ) values (
    v_business_id,
    p_store_id,
    v_user_id,
    case when p_active is false then 'staff.deactivated' else 'staff.updated' end,
    'staff',
    p_staff_id::text,
    jsonb_build_object('role', v_next_role, 'customPermissions', v_next_permissions),
    v_now
  );

  return true;
end;
$$;

revoke all on function public.balcao_update_staff(uuid, uuid, text, text, jsonb, boolean) from public, anon;
grant execute on function public.balcao_update_staff(uuid, uuid, text, text, jsonb, boolean) to authenticated, service_role;
