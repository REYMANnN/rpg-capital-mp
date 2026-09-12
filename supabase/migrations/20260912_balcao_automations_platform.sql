-- BALCÃO v11.0 — Automations, public API and webhook platform.
-- Software-only scope: no Pix Out, payments, transfers or bank-write capability.

alter table public.balcao_staff_store_access
  drop constraint if exists balcao_staff_store_access_role_check;
alter table public.balcao_staff_store_access
  add constraint balcao_staff_store_access_role_check
  check (role in ('stock','cashier','finance','it','manager','custom'));

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
        'inventory.view','inventory.write','products.lookup','products.manage',
        'checkout.sell','sales.view','analysis.financial',
        'automations.view','automations.manage','integrations.view','integrations.manage',
        'api_keys.manage','webhooks.manage'
      )
    );
$$;
revoke all on function private.balcao_operational_permissions_valid(jsonb) from public, anon, authenticated;
grant execute on function private.balcao_operational_permissions_valid(jsonb) to service_role;

create table if not exists public.balcao_api_keys (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.balcao_businesses(id) on delete cascade,
  store_id uuid references public.inventory_v1_stores(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  prefix text not null unique,
  secret_hash text not null,
  scopes text[] not null default '{}',
  status text not null default 'active' check (status in ('active','revoked','expired')),
  approval_status text not null default 'approved' check (approval_status in ('pending','approved','rejected')),
  expires_at timestamptz,
  last_used_at timestamptz,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_by_staff_id uuid references public.balcao_staff_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.balcao_integration_connections (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.balcao_businesses(id) on delete cascade,
  store_id uuid references public.inventory_v1_stores(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  kind text not null check (kind in ('erp','pos','ecommerce','bi','custom')),
  direction text not null default 'bidirectional' check (direction in ('inbound','outbound','bidirectional')),
  authority jsonb not null default '{"products":"balcao","inventory":"balcao","sales":"balcao","pricing":"balcao","finance":"balcao"}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active','paused','error')),
  last_sync_at timestamptz,
  last_error text,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_by_staff_id uuid references public.balcao_staff_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.balcao_integration_entity_mappings (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null references public.balcao_integration_connections(id) on delete cascade,
  business_id uuid not null references public.balcao_businesses(id) on delete cascade,
  store_id uuid references public.inventory_v1_stores(id) on delete cascade,
  entity_type text not null check (entity_type in ('product','sale','inventory_movement')),
  external_id text not null,
  internal_id text not null,
  provenance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (integration_id, entity_type, external_id),
  unique (integration_id, entity_type, internal_id)
);

create table if not exists public.balcao_webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.balcao_businesses(id) on delete cascade,
  store_id uuid references public.inventory_v1_stores(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  url text not null,
  event_types text[] not null default '{}',
  secret_ciphertext text not null,
  status text not null default 'active' check (status in ('active','paused','error')),
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  last_success_at timestamptz,
  last_failure_at timestamptz,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_by_staff_id uuid references public.balcao_staff_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.balcao_event_outbox (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.balcao_businesses(id) on delete cascade,
  store_id uuid references public.inventory_v1_stores(id) on delete cascade,
  event_type text not null,
  aggregate_type text,
  aggregate_id text,
  data jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  published_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.balcao_webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  endpoint_id uuid not null references public.balcao_webhook_endpoints(id) on delete cascade,
  event_id uuid not null references public.balcao_event_outbox(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','retrying','delivered','failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_retry_at timestamptz,
  response_status integer,
  duration_ms integer,
  last_error text,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (endpoint_id, event_id)
);

create table if not exists public.balcao_idempotency_records (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.balcao_businesses(id) on delete cascade,
  store_id uuid references public.inventory_v1_stores(id) on delete cascade,
  api_key_id uuid references public.balcao_api_keys(id) on delete cascade,
  key_hash text not null,
  request_hash text not null,
  response_status integer not null,
  response_body jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (business_id, key_hash)
);

create index if not exists balcao_api_keys_business_idx on public.balcao_api_keys(business_id, created_at desc);
create index if not exists balcao_api_keys_store_idx on public.balcao_api_keys(store_id, created_at desc) where store_id is not null;
create index if not exists balcao_integrations_business_idx on public.balcao_integration_connections(business_id, created_at desc);
create index if not exists balcao_integrations_store_idx on public.balcao_integration_connections(store_id, created_at desc) where store_id is not null;
create index if not exists balcao_mappings_lookup_idx on public.balcao_integration_entity_mappings(integration_id, entity_type, external_id);
create index if not exists balcao_webhooks_business_idx on public.balcao_webhook_endpoints(business_id, created_at desc);
create index if not exists balcao_webhooks_store_idx on public.balcao_webhook_endpoints(store_id, created_at desc) where store_id is not null;
create index if not exists balcao_outbox_unpublished_idx on public.balcao_event_outbox(created_at) where published_at is null;
create index if not exists balcao_deliveries_due_idx on public.balcao_webhook_deliveries(next_retry_at) where status in ('pending','retrying');
create index if not exists balcao_idempotency_expiry_idx on public.balcao_idempotency_records(expires_at);

alter table public.balcao_api_keys enable row level security;
alter table public.balcao_integration_connections enable row level security;
alter table public.balcao_integration_entity_mappings enable row level security;
alter table public.balcao_webhook_endpoints enable row level security;
alter table public.balcao_event_outbox enable row level security;
alter table public.balcao_webhook_deliveries enable row level security;
alter table public.balcao_idempotency_records enable row level security;

revoke all on table public.balcao_api_keys from public, anon, authenticated;
revoke all on table public.balcao_integration_connections from public, anon, authenticated;
revoke all on table public.balcao_integration_entity_mappings from public, anon, authenticated;
revoke all on table public.balcao_webhook_endpoints from public, anon, authenticated;
revoke all on table public.balcao_event_outbox from public, anon, authenticated;
revoke all on table public.balcao_webhook_deliveries from public, anon, authenticated;
revoke all on table public.balcao_idempotency_records from public, anon, authenticated;

grant all on table public.balcao_api_keys to service_role;
grant all on table public.balcao_integration_connections to service_role;
grant all on table public.balcao_integration_entity_mappings to service_role;
grant all on table public.balcao_webhook_endpoints to service_role;
grant all on table public.balcao_event_outbox to service_role;
grant all on table public.balcao_webhook_deliveries to service_role;
grant all on table public.balcao_idempotency_records to service_role;

-- Staff creation/update must understand the new IT role and custom automation permissions.
create or replace function public.balcao_create_staff(
  p_store_id uuid,
  p_display_name text,
  p_role text,
  p_pin_hash text,
  p_custom_permissions jsonb default '[]'::jsonb
)
returns table (staff_id uuid, display_name text, staff_role text, is_active boolean)
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
  if v_user_id is null then raise exception 'BALCAO_NOT_AUTHENTICATED'; end if;
  if length(btrim(coalesce(p_display_name,''))) < 2
     or length(btrim(coalesce(p_display_name,''))) > 80
     or p_role not in ('stock','cashier','finance','it','manager','custom')
     or length(coalesce(p_pin_hash,'')) < 20
     or not private.balcao_operational_permissions_valid(v_permissions)
     or (p_role = 'custom' and jsonb_array_length(v_permissions) = 0)
     or (p_role <> 'custom' and jsonb_array_length(v_permissions) <> 0)
  then raise exception 'BALCAO_INVALID_STAFF'; end if;

  select s.business_id into v_business_id
  from public.inventory_v1_stores s where s.id = p_store_id and s.active;
  if v_business_id is null then raise exception 'BALCAO_STORE_NOT_FOUND'; end if;

  select m.role into v_manager_role
  from public.balcao_business_members m
  where m.business_id = v_business_id and m.user_id = v_user_id and m.active;
  if v_manager_role is null or v_manager_role not in ('owner','admin','manager') then
    raise exception 'BALCAO_STAFF_FORBIDDEN';
  end if;

  insert into public.balcao_staff_profiles(business_id,display_name,pin_hash,active,failed_pin_attempts,created_by,created_at,updated_at)
  values(v_business_id,btrim(p_display_name),p_pin_hash,true,0,v_user_id,v_now,v_now)
  returning id into v_staff_id;

  insert into public.balcao_staff_store_access(staff_id,store_id,role,custom_permissions,active,created_at,updated_at)
  values(v_staff_id,p_store_id,p_role,case when p_role='custom' then v_permissions else '[]'::jsonb end,true,v_now,v_now);

  insert into public.balcao_audit_events(business_id,store_id,actor_user_id,action,entity_type,entity_id,metadata,created_at)
  values(v_business_id,p_store_id,v_user_id,'staff.created','staff',v_staff_id::text,
    jsonb_build_object('role',p_role,'customPermissions',case when p_role='custom' then v_permissions else '[]'::jsonb end),v_now);

  return query select v_staff_id,btrim(p_display_name),p_role,true;
end;
$$;
revoke all on function public.balcao_create_staff(uuid,text,text,text,jsonb) from public, anon;
grant execute on function public.balcao_create_staff(uuid,text,text,text,jsonb) to authenticated, service_role;

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
  v_current_role text;
  v_current_permissions jsonb;
  v_next_role text;
  v_next_permissions jsonb;
begin
  if v_user_id is null then raise exception 'BALCAO_NOT_AUTHENTICATED'; end if;
  if p_display_name is not null and (length(btrim(p_display_name)) < 2 or length(btrim(p_display_name)) > 80) then raise exception 'BALCAO_INVALID_STAFF'; end if;
  if p_role is not null and p_role not in ('stock','cashier','finance','it','manager','custom') then raise exception 'BALCAO_INVALID_STAFF'; end if;
  if p_custom_permissions is not null and not private.balcao_operational_permissions_valid(p_custom_permissions) then raise exception 'BALCAO_INVALID_STAFF'; end if;

  select s.business_id into v_business_id from public.inventory_v1_stores s where s.id=p_store_id and s.active;
  if v_business_id is null then raise exception 'BALCAO_STORE_NOT_FOUND'; end if;
  select m.role into v_manager_role from public.balcao_business_members m where m.business_id=v_business_id and m.user_id=v_user_id and m.active;
  if v_manager_role is null or v_manager_role not in ('owner','admin','manager') then raise exception 'BALCAO_STAFF_FORBIDDEN'; end if;

  select a.role,a.custom_permissions into v_current_role,v_current_permissions
  from public.balcao_staff_profiles p join public.balcao_staff_store_access a on a.staff_id=p.id
  where p.id=p_staff_id and p.business_id=v_business_id and a.store_id=p_store_id;
  if v_current_role is null then raise exception 'BALCAO_STAFF_NOT_FOUND'; end if;

  v_next_role := coalesce(p_role,v_current_role);
  v_next_permissions := case when v_next_role='custom' then coalesce(p_custom_permissions,v_current_permissions,'[]'::jsonb) else '[]'::jsonb end;
  if not private.balcao_operational_permissions_valid(v_next_permissions)
     or (v_next_role='custom' and jsonb_array_length(v_next_permissions)=0)
     or (v_next_role<>'custom' and jsonb_array_length(v_next_permissions)<>0)
  then raise exception 'BALCAO_INVALID_STAFF'; end if;

  update public.balcao_staff_profiles p
  set display_name=coalesce(btrim(p_display_name),p.display_name), active=coalesce(p_active,p.active), updated_at=v_now
  where p.id=p_staff_id and p.business_id=v_business_id;

  update public.balcao_staff_store_access a
  set role=v_next_role,custom_permissions=v_next_permissions,active=coalesce(p_active,a.active),updated_at=v_now
  where a.staff_id=p_staff_id and a.store_id=p_store_id;

  if p_active is false then
    update public.balcao_staff_sessions set revoked_at=v_now where staff_id=p_staff_id and revoked_at is null;
  end if;

  insert into public.balcao_audit_events(business_id,store_id,actor_user_id,action,entity_type,entity_id,metadata,created_at)
  values(v_business_id,p_store_id,v_user_id,case when p_active is false then 'staff.deactivated' else 'staff.updated' end,
    'staff',p_staff_id::text,jsonb_build_object('role',v_next_role,'customPermissions',v_next_permissions),v_now);
  return true;
end;
$$;
revoke all on function public.balcao_update_staff(uuid,uuid,text,text,jsonb,boolean) from public, anon;
grant execute on function public.balcao_update_staff(uuid,uuid,text,text,jsonb,boolean) to authenticated, service_role;
