-- BALCÃO finance connection management without a Vercel service-role secret.
-- Tables remain inaccessible directly; SECURITY DEFINER RPCs enforce Balcão authorization.

create or replace function public.balcao_list_finance_connections(
  p_store_id uuid default null,
  p_installation_id uuid default null,
  p_terminal_id uuid default null,
  p_terminal_hash text default null,
  p_session_id uuid default null,
  p_session_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict error
declare
  v_user_id uuid := auth.uid();
  v_store_id uuid;
  v_business_id uuid;
  v_role text;
  v_operational record;
  v_can_manage boolean := false;
  v_allowed boolean := false;
  v_connections jsonb := '[]'::jsonb;
begin
  if v_user_id is not null and p_store_id is not null then
    select s.id, s.business_id, m.role
      into v_store_id, v_business_id, v_role
    from public.inventory_v1_stores as s
    join public.balcao_business_members as m
      on m.business_id = s.business_id
     and m.user_id = v_user_id
     and m.active
    where s.id = p_store_id
      and s.active
    limit 1;

    if v_store_id is not null then
      v_allowed := true;
      v_can_manage := v_role in ('owner', 'admin', 'manager');
    end if;
  end if;

  if not v_allowed
     and p_terminal_id is not null
     and p_terminal_hash is not null
     and p_session_id is not null
     and p_session_hash is not null then
    select * into v_operational
    from public.balcao_operational_context(
      p_terminal_id,
      p_terminal_hash,
      p_session_id,
      p_session_hash
    )
    limit 1;

    if v_operational.current_staff_id is not null
       and v_operational.current_session_id is not null
       and (
         v_operational.current_staff_role in ('finance', 'manager')
         or (
           v_operational.current_staff_role = 'custom'
           and coalesce(v_operational.current_custom_permissions, '[]'::jsonb) ? 'analysis.financial'
         )
       ) then
      v_store_id := v_operational.store_id;
      v_business_id := v_operational.business_id;
      v_allowed := true;
      v_can_manage := false;
    end if;
  end if;

  if not v_allowed or v_store_id is null or v_business_id is null then
    raise exception 'BALCAO_FINANCE_FORBIDDEN';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'provider', c.provider,
    'itemId', c.provider_item_id,
    'institutionName', c.institution_name,
    'institutionLogoUrl', c.institution_logo_url,
    'status', c.status,
    'executionStatus', c.execution_status,
    'consentExpiresAt', c.consent_expires_at,
    'lastSyncedAt', c.last_synced_at,
    'errorCode', c.last_error_code,
    'errorMessage', c.last_error_message,
    'createdAt', c.created_at,
    'updatedAt', c.updated_at
  ) order by c.updated_at desc), '[]'::jsonb)
    into v_connections
  from public.balcao_finance_connections as c
  where c.business_id = v_business_id
    and c.store_id = v_store_id;

  return jsonb_build_object(
    'businessId', v_business_id,
    'storeId', v_store_id,
    'canManage', v_can_manage,
    'connections', v_connections
  );
end;
$$;

revoke all on function public.balcao_list_finance_connections(uuid, uuid, uuid, text, uuid, text) from public;
grant execute on function public.balcao_list_finance_connections(uuid, uuid, uuid, text, uuid, text) to anon, authenticated, service_role;

create or replace function public.balcao_get_finance_connection_for_management(p_connection_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict error
declare
  v_user_id uuid := auth.uid();
  v_connection public.balcao_finance_connections%rowtype;
  v_role text;
begin
  if v_user_id is null then raise exception 'BALCAO_NOT_AUTHENTICATED'; end if;

  select c.* into v_connection
  from public.balcao_finance_connections as c
  where c.id = p_connection_id;

  if v_connection.id is null then raise exception 'BALCAO_FINANCE_CONNECTION_NOT_FOUND'; end if;

  select m.role into v_role
  from public.balcao_business_members as m
  where m.business_id = v_connection.business_id
    and m.user_id = v_user_id
    and m.active;

  if v_role is null or v_role not in ('owner', 'admin', 'manager') then
    raise exception 'BALCAO_FINANCE_FORBIDDEN';
  end if;

  return jsonb_build_object(
    'id', v_connection.id,
    'businessId', v_connection.business_id,
    'storeId', v_connection.store_id,
    'provider', v_connection.provider,
    'itemId', v_connection.provider_item_id,
    'status', v_connection.status
  );
end;
$$;

revoke all on function public.balcao_get_finance_connection_for_management(uuid) from public, anon;
grant execute on function public.balcao_get_finance_connection_for_management(uuid) to authenticated, service_role;

create or replace function public.balcao_disconnect_finance_connection(p_connection_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict error
declare
  v_user_id uuid := auth.uid();
  v_connection public.balcao_finance_connections%rowtype;
  v_role text;
  v_now timestamptz := now();
begin
  if v_user_id is null then raise exception 'BALCAO_NOT_AUTHENTICATED'; end if;

  select c.* into v_connection
  from public.balcao_finance_connections as c
  where c.id = p_connection_id
  for update;

  if v_connection.id is null then raise exception 'BALCAO_FINANCE_CONNECTION_NOT_FOUND'; end if;

  select m.role into v_role
  from public.balcao_business_members as m
  where m.business_id = v_connection.business_id
    and m.user_id = v_user_id
    and m.active;

  if v_role is null or v_role not in ('owner', 'admin', 'manager') then
    raise exception 'BALCAO_FINANCE_FORBIDDEN';
  end if;

  update public.balcao_finance_connections
  set status = 'disconnected', updated_at = v_now
  where id = p_connection_id;

  update public.balcao_finance_accounts
  set status = 'disconnected', updated_at = v_now
  where business_id = v_connection.business_id
    and store_id = v_connection.store_id
    and provider = v_connection.provider;

  insert into public.balcao_audit_events (
    business_id, store_id, actor_user_id, action, entity_type, entity_id, metadata, created_at
  ) values (
    v_connection.business_id,
    v_connection.store_id,
    v_user_id,
    'finance.connection_disconnected',
    'finance_connection',
    p_connection_id::text,
    jsonb_build_object('provider', v_connection.provider, 'providerItemId', v_connection.provider_item_id),
    v_now
  );

  return true;
end;
$$;

revoke all on function public.balcao_disconnect_finance_connection(uuid) from public, anon;
grant execute on function public.balcao_disconnect_finance_connection(uuid) to authenticated, service_role;

create or replace function public.balcao_apply_malvo_snapshot(
  p_store_id uuid,
  p_item_id text,
  p_client_user_id text,
  p_institution_name text,
  p_institution_logo_url text,
  p_status text,
  p_execution_status text,
  p_consent_expires_at timestamptz,
  p_last_synced_at timestamptz,
  p_accounts jsonb,
  p_transactions jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict error
declare
  v_user_id uuid := auth.uid();
  v_business_id uuid;
  v_role text;
  v_account jsonb;
  v_transaction jsonb;
  v_account_id uuid;
  v_now timestamptz := now();
  v_account_count integer := 0;
  v_transaction_count integer := 0;
begin
  if v_user_id is null then raise exception 'BALCAO_NOT_AUTHENTICATED'; end if;
  if nullif(btrim(coalesce(p_item_id, '')), '') is null then raise exception 'BALCAO_INVALID_FINANCE_SNAPSHOT'; end if;
  if p_status not in ('pending', 'active', 'updating', 'attention', 'error', 'disconnected') then
    raise exception 'BALCAO_INVALID_FINANCE_SNAPSHOT';
  end if;
  if jsonb_typeof(coalesce(p_accounts, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_transactions, '[]'::jsonb)) <> 'array' then
    raise exception 'BALCAO_INVALID_FINANCE_SNAPSHOT';
  end if;

  select s.business_id, m.role
    into v_business_id, v_role
  from public.inventory_v1_stores as s
  join public.balcao_business_members as m
    on m.business_id = s.business_id
   and m.user_id = v_user_id
   and m.active
  where s.id = p_store_id
    and s.active
  limit 1;

  if v_business_id is null or v_role not in ('owner', 'admin', 'manager') then
    raise exception 'BALCAO_FINANCE_FORBIDDEN';
  end if;

  insert into public.balcao_finance_connections (
    business_id, store_id, provider, provider_item_id, client_user_id,
    institution_name, institution_logo_url, status, execution_status,
    consent_expires_at, last_synced_at, last_error_code, last_error_message,
    created_at, updated_at
  ) values (
    v_business_id, p_store_id, 'malvo', p_item_id, p_client_user_id,
    nullif(p_institution_name, ''), nullif(p_institution_logo_url, ''), p_status,
    nullif(p_execution_status, ''), p_consent_expires_at, p_last_synced_at,
    null, null, v_now, v_now
  )
  on conflict (provider, provider_item_id) do update
  set business_id = excluded.business_id,
      store_id = excluded.store_id,
      client_user_id = excluded.client_user_id,
      institution_name = excluded.institution_name,
      institution_logo_url = excluded.institution_logo_url,
      status = excluded.status,
      execution_status = excluded.execution_status,
      consent_expires_at = excluded.consent_expires_at,
      last_synced_at = excluded.last_synced_at,
      last_error_code = null,
      last_error_message = null,
      updated_at = v_now;

  for v_account in
    select value from jsonb_array_elements(coalesce(p_accounts, '[]'::jsonb))
  loop
    if nullif(v_account ->> 'externalId', '') is null then continue; end if;

    insert into public.balcao_finance_accounts (
      business_id, store_id, provider, external_id, institution_name,
      account_name, account_type, masked_number, balance_cents, currency,
      status, source, last_synced_at, created_at, updated_at
    ) values (
      v_business_id,
      p_store_id,
      'malvo',
      v_account ->> 'externalId',
      coalesce(nullif(p_institution_name, ''), 'Instituição financeira'),
      nullif(v_account ->> 'accountName', ''),
      nullif(v_account ->> 'accountType', ''),
      nullif(v_account ->> 'maskedNumber', ''),
      coalesce((v_account ->> 'balanceCents')::bigint, 0),
      coalesce(nullif(v_account ->> 'currency', ''), 'BRL'),
      'active',
      'malvo',
      nullif(v_account ->> 'lastSyncedAt', '')::timestamptz,
      v_now,
      v_now
    )
    on conflict (business_id, provider, external_id) do update
    set store_id = excluded.store_id,
        institution_name = excluded.institution_name,
        account_name = excluded.account_name,
        account_type = excluded.account_type,
        masked_number = excluded.masked_number,
        balance_cents = excluded.balance_cents,
        currency = excluded.currency,
        status = 'active',
        source = 'malvo',
        last_synced_at = excluded.last_synced_at,
        updated_at = v_now;

    v_account_count := v_account_count + 1;
  end loop;

  update public.balcao_finance_accounts as a
  set status = 'disconnected', updated_at = v_now
  where a.business_id = v_business_id
    and a.store_id = p_store_id
    and a.provider = 'malvo'
    and not exists (
      select 1
      from jsonb_array_elements(coalesce(p_accounts, '[]'::jsonb)) as incoming(value)
      where incoming.value ->> 'externalId' = a.external_id
    );

  for v_transaction in
    select value from jsonb_array_elements(coalesce(p_transactions, '[]'::jsonb))
  loop
    if nullif(v_transaction ->> 'externalId', '') is null
       or nullif(v_transaction ->> 'accountExternalId', '') is null
       or nullif(v_transaction ->> 'postedAt', '') is null
       or coalesce((v_transaction ->> 'amountCents')::bigint, 0) = 0 then
      continue;
    end if;

    select a.id into v_account_id
    from public.balcao_finance_accounts as a
    where a.business_id = v_business_id
      and a.store_id = p_store_id
      and a.provider = 'malvo'
      and a.external_id = v_transaction ->> 'accountExternalId'
    limit 1;

    if v_account_id is null then continue; end if;

    insert into public.balcao_finance_transactions (
      business_id, store_id, account_id, external_id, posted_at, amount_cents,
      description, counterparty_name, counterparty_tax_id, category,
      category_confidence, transaction_type, is_internal_transfer, source, created_at
    ) values (
      v_business_id,
      p_store_id,
      v_account_id,
      v_transaction ->> 'externalId',
      (v_transaction ->> 'postedAt')::timestamptz,
      (v_transaction ->> 'amountCents')::bigint,
      coalesce(nullif(v_transaction ->> 'description', ''), 'Movimentação'),
      nullif(v_transaction ->> 'counterpartyName', ''),
      nullif(v_transaction ->> 'counterpartyTaxId', ''),
      coalesce(nullif(v_transaction ->> 'category', ''), 'Outros'),
      null,
      nullif(v_transaction ->> 'transactionType', ''),
      coalesce((v_transaction ->> 'isInternalTransfer')::boolean, false),
      'malvo',
      v_now
    )
    on conflict (account_id, external_id) do update
    set posted_at = excluded.posted_at,
        amount_cents = excluded.amount_cents,
        description = excluded.description,
        counterparty_name = excluded.counterparty_name,
        counterparty_tax_id = excluded.counterparty_tax_id,
        category = excluded.category,
        transaction_type = excluded.transaction_type,
        is_internal_transfer = excluded.is_internal_transfer,
        source = 'malvo';

    v_transaction_count := v_transaction_count + 1;
  end loop;

  return jsonb_build_object(
    'itemId', p_item_id,
    'accountCount', v_account_count,
    'transactionCount', v_transaction_count
  );
end;
$$;

revoke all on function public.balcao_apply_malvo_snapshot(uuid, text, text, text, text, text, text, timestamptz, timestamptz, jsonb, jsonb) from public, anon;
grant execute on function public.balcao_apply_malvo_snapshot(uuid, text, text, text, text, text, text, timestamptz, timestamptz, jsonb, jsonb) to authenticated, service_role;
