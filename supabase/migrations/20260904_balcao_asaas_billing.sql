-- BALCÃO billing / Asaas.
-- One billing account per business, paid bank entitlements (slots), idempotent operations and webhook journal.

create table if not exists public.balcao_billing_accounts (
  business_id uuid primary key references public.balcao_businesses(id) on delete cascade,
  provider text not null default 'asaas' check (provider = 'asaas'),
  asaas_customer_id text unique,
  asaas_subscription_id text unique,
  credit_card_token text,
  card_brand text,
  card_last4 text,
  card_expiry_month text,
  card_expiry_year text,
  status text not null default 'pending_setup' check (status in ('pending_setup','pending_payment','active','past_due','blocked','canceled')),
  price_per_bank_cents integer not null default 599 check (price_per_bank_cents > 0),
  current_bank_count integer not null default 0 check (current_bank_count >= 0),
  next_bank_count integer not null default 0 check (next_bank_count >= 0),
  current_amount_cents integer not null default 0 check (current_amount_cents >= 0),
  next_amount_cents integer not null default 0 check (next_amount_cents >= 0),
  current_period_start date,
  current_period_end date,
  paid_until date,
  provider_sync_error text,
  past_due_at timestamptz,
  blocked_at timestamptz,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.balcao_billing_operations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.balcao_businesses(id) on delete cascade,
  operation_type text not null check (operation_type in ('initial_subscription','add_bank','monthly_renewal','retry','refund')),
  quantity_delta integer not null default 0,
  amount_cents integer not null default 0 check (amount_cents >= 0),
  status text not null default 'created' check (status in ('created','processing','confirmed','failed','refunded')),
  provider_payment_id text unique,
  provider_subscription_id text,
  idempotency_key text not null unique,
  error_code text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  applied_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.balcao_billing_slots (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.balcao_businesses(id) on delete cascade,
  operation_id uuid references public.balcao_billing_operations(id) on delete set null,
  finance_connection_id uuid unique references public.balcao_finance_connections(id) on delete set null,
  status text not null default 'available' check (status in ('available','reserved','connected','retired')),
  paid_amount_cents integer not null default 599 check (paid_amount_cents >= 0),
  billing_period_start date,
  billing_period_end date,
  reserved_at timestamptz,
  reservation_expires_at timestamptz,
  connected_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.balcao_billing_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'asaas' check (provider = 'asaas'),
  event_id text not null unique,
  event_type text not null,
  provider_payment_id text,
  provider_subscription_id text,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_error text
);

create index if not exists balcao_billing_slots_business_status_idx
  on public.balcao_billing_slots(business_id, status, created_at);
create index if not exists balcao_billing_operations_business_idx
  on public.balcao_billing_operations(business_id, created_at desc);
create index if not exists balcao_billing_webhook_payment_idx
  on public.balcao_billing_webhook_events(provider_payment_id, received_at desc);

alter table public.balcao_billing_accounts enable row level security;
alter table public.balcao_billing_operations enable row level security;
alter table public.balcao_billing_slots enable row level security;
alter table public.balcao_billing_webhook_events enable row level security;

revoke all on table public.balcao_billing_accounts from public, anon, authenticated;
revoke all on table public.balcao_billing_operations from public, anon, authenticated;
revoke all on table public.balcao_billing_slots from public, anon, authenticated;
revoke all on table public.balcao_billing_webhook_events from public, anon, authenticated;

grant all on table public.balcao_billing_accounts to service_role;
grant all on table public.balcao_billing_operations to service_role;
grant all on table public.balcao_billing_slots to service_role;
grant all on table public.balcao_billing_webhook_events to service_role;

-- Atomically reserve one paid entitlement. Expired reservations are released first.
create or replace function public.balcao_reserve_billing_slot(p_business_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slot_id uuid;
begin
  update public.balcao_billing_slots
     set status = 'available', reserved_at = null, reservation_expires_at = null, updated_at = now()
   where business_id = p_business_id
     and status = 'reserved'
     and reservation_expires_at < now();

  select id into v_slot_id
    from public.balcao_billing_slots
   where business_id = p_business_id
     and status = 'available'
   order by created_at asc
   for update skip locked
   limit 1;

  if v_slot_id is null then return null; end if;

  update public.balcao_billing_slots
     set status = 'reserved', reserved_at = now(), reservation_expires_at = now() + interval '30 minutes', updated_at = now()
   where id = v_slot_id;

  return v_slot_id;
end;
$$;

create or replace function public.balcao_attach_reserved_billing_slot(p_business_id uuid, p_finance_connection_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slot_id uuid;
begin
  select id into v_slot_id
    from public.balcao_billing_slots
   where business_id = p_business_id
     and status = 'reserved'
     and reservation_expires_at >= now()
   order by reserved_at asc
   for update skip locked
   limit 1;

  if v_slot_id is null then return null; end if;

  update public.balcao_billing_slots
     set status = 'connected', finance_connection_id = p_finance_connection_id,
         connected_at = now(), reservation_expires_at = null, updated_at = now()
   where id = v_slot_id;
  return v_slot_id;
end;
$$;

create or replace function public.balcao_release_billing_slot_reservation(p_slot_id uuid, p_business_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.balcao_billing_slots
     set status = 'available', reserved_at = null, reservation_expires_at = null, updated_at = now()
   where id = p_slot_id and business_id = p_business_id and status = 'reserved';
  return found;
end;
$$;

create or replace function public.balcao_retire_billing_slot(p_finance_connection_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slot_id uuid;
begin
  update public.balcao_billing_slots
     set status = 'retired', retired_at = now(), updated_at = now()
   where finance_connection_id = p_finance_connection_id and status in ('connected','reserved')
   returning id into v_slot_id;
  return v_slot_id;
end;
$$;

revoke all on function public.balcao_reserve_billing_slot(uuid) from public, anon, authenticated;
revoke all on function public.balcao_attach_reserved_billing_slot(uuid, uuid) from public, anon, authenticated;
revoke all on function public.balcao_release_billing_slot_reservation(uuid, uuid) from public, anon, authenticated;
revoke all on function public.balcao_retire_billing_slot(uuid) from public, anon, authenticated;
grant execute on function public.balcao_reserve_billing_slot(uuid) to service_role;
grant execute on function public.balcao_attach_reserved_billing_slot(uuid, uuid) to service_role;
grant execute on function public.balcao_release_billing_slot_reservation(uuid, uuid) to service_role;
grant execute on function public.balcao_retire_billing_slot(uuid) to service_role;
