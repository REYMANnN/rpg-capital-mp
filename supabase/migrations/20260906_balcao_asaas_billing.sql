-- BALCÃO / Asaas SaaS billing.
-- Card PAN/CVV are never stored here; only provider identifiers and billing state.

create table if not exists public.balcao_billing_accounts (
  business_id uuid primary key references public.balcao_businesses(id) on delete cascade,
  provider text not null default 'asaas' check (provider = 'asaas'),
  plan_code text not null default 'balcao_599',
  monthly_amount_cents integer not null default 599 check (monthly_amount_cents = 599),
  billing_anchor_day smallint not null default 1 check (billing_anchor_day = 1),
  status text not null default 'pending_payment_method'
    check (status in ('pending_payment_method', 'configured', 'active', 'past_due', 'cancelled')),
  asaas_customer_id text unique,
  asaas_initial_subscription_id text unique,
  asaas_recurring_subscription_id text unique,
  first_due_date date,
  next_due_date date,
  overdue_payment_id text,
  overdue_invoice_url text,
  reconnect_required boolean not null default false,
  access_until date,
  started_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.balcao_billing_payments (
  asaas_payment_id text primary key,
  business_id uuid not null references public.balcao_businesses(id) on delete cascade,
  asaas_subscription_id text,
  amount_cents integer not null check (amount_cents >= 0),
  due_date date,
  status text not null,
  billing_kind text not null default 'unknown' check (billing_kind in ('initial', 'recurring', 'unknown')),
  invoice_url text,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.balcao_billing_webhook_events (
  asaas_event_id text primary key,
  event_type text not null,
  resource_id text,
  attempts integer not null default 0 check (attempts >= 0),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists balcao_billing_accounts_status_idx
  on public.balcao_billing_accounts(status, updated_at desc);
create index if not exists balcao_billing_payments_business_idx
  on public.balcao_billing_payments(business_id, due_date desc);
create index if not exists balcao_billing_payments_subscription_idx
  on public.balcao_billing_payments(asaas_subscription_id, due_date desc);

alter table public.balcao_billing_accounts enable row level security;
alter table public.balcao_billing_payments enable row level security;
alter table public.balcao_billing_webhook_events enable row level security;

revoke all on public.balcao_billing_accounts from public, anon, authenticated;
revoke all on public.balcao_billing_payments from public, anon, authenticated;
revoke all on public.balcao_billing_webhook_events from public, anon, authenticated;

grant select on public.balcao_billing_accounts to authenticated;
grant select on public.balcao_billing_payments to authenticated;
grant all on public.balcao_billing_accounts to service_role;
grant all on public.balcao_billing_payments to service_role;
grant all on public.balcao_billing_webhook_events to service_role;

drop policy if exists balcao_billing_accounts_member_read on public.balcao_billing_accounts;
create policy balcao_billing_accounts_member_read
  on public.balcao_billing_accounts for select to authenticated
  using ((select private.balcao_is_business_member(business_id)));

drop policy if exists balcao_billing_payments_member_read on public.balcao_billing_payments;
create policy balcao_billing_payments_member_read
  on public.balcao_billing_payments for select to authenticated
  using ((select private.balcao_is_business_member(business_id)));
