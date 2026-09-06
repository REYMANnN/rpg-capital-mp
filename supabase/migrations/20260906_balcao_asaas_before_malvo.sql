-- BALCÃO billing gate: a bank consent can only be created after Asaas billing is configured.
-- Card data never enters this table; only Asaas identifiers and billing dates are persisted.

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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.balcao_billing_accounts enable row level security;
revoke all on public.balcao_billing_accounts from public, anon, authenticated;
grant select on public.balcao_billing_accounts to authenticated;

drop policy if exists balcao_billing_accounts_member_read on public.balcao_billing_accounts;
create policy balcao_billing_accounts_member_read
  on public.balcao_billing_accounts for select to authenticated
  using ((select private.balcao_is_business_member(business_id)));

create or replace function public.balcao_configure_billing(
  p_store_id uuid,
  p_asaas_customer_id text,
  p_asaas_initial_subscription_id text,
  p_asaas_recurring_subscription_id text,
  p_first_due_date date,
  p_next_due_date date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_id uuid;
  v_role text;
begin
  select s.business_id, m.role
    into v_business_id, v_role
  from public.inventory_v1_stores s
  join public.balcao_business_members m
    on m.business_id = s.business_id
   and m.user_id = auth.uid()
   and m.active
  where s.id = p_store_id
    and s.active
  limit 1;

  if v_business_id is null or v_role not in ('owner', 'admin') then
    raise exception 'BALCAO_BILLING_FORBIDDEN';
  end if;

  if nullif(trim(p_asaas_customer_id), '') is null
     or nullif(trim(p_asaas_recurring_subscription_id), '') is null then
    raise exception 'BALCAO_BILLING_PROVIDER_IDS_REQUIRED';
  end if;

  insert into public.balcao_billing_accounts (
    business_id, provider, plan_code, monthly_amount_cents, billing_anchor_day,
    status, asaas_customer_id, asaas_initial_subscription_id,
    asaas_recurring_subscription_id, first_due_date, next_due_date, updated_at
  ) values (
    v_business_id, 'asaas', 'balcao_599', 599, 1,
    'configured', trim(p_asaas_customer_id), nullif(trim(p_asaas_initial_subscription_id), ''),
    trim(p_asaas_recurring_subscription_id), p_first_due_date, p_next_due_date, now()
  )
  on conflict (business_id) do update set
    status = 'configured',
    asaas_customer_id = excluded.asaas_customer_id,
    asaas_initial_subscription_id = excluded.asaas_initial_subscription_id,
    asaas_recurring_subscription_id = excluded.asaas_recurring_subscription_id,
    first_due_date = excluded.first_due_date,
    next_due_date = excluded.next_due_date,
    updated_at = now();

  return jsonb_build_object('ok', true, 'businessId', v_business_id, 'status', 'configured');
end;
$$;

revoke all on function public.balcao_configure_billing(uuid, text, text, text, date, date) from public, anon;
grant execute on function public.balcao_configure_billing(uuid, text, text, text, date, date) to authenticated;

create or replace function public.balcao_billing_allows_bank_connection(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.inventory_v1_stores s
    join public.balcao_business_members m
      on m.business_id = s.business_id
     and m.user_id = auth.uid()
     and m.active
    join public.balcao_billing_accounts b
      on b.business_id = s.business_id
     and b.status in ('configured', 'active')
    where s.id = p_store_id
      and s.active
  );
$$;

revoke all on function public.balcao_billing_allows_bank_connection(uuid) from public, anon;
grant execute on function public.balcao_billing_allows_bank_connection(uuid) to authenticated;

create or replace function public.balcao_complete_open_finance_onboarding(p_store_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_business_id uuid;
  v_role text;
begin
  if v_user_id is null then
    raise exception 'BALCAO_NOT_AUTHENTICATED';
  end if;

  select s.business_id, m.role
    into v_business_id, v_role
  from public.inventory_v1_stores s
  join public.balcao_business_members m
    on m.business_id = s.business_id
   and m.user_id = v_user_id
   and m.active
  where s.id = p_store_id
    and s.active
  limit 1;

  if v_business_id is null or v_role not in ('owner', 'admin', 'manager') then
    raise exception 'BALCAO_OPEN_FINANCE_FORBIDDEN';
  end if;

  if not exists (
    select 1
    from public.balcao_billing_accounts b
    where b.business_id = v_business_id
      and b.status in ('configured', 'active')
  ) then
    raise exception 'BALCAO_BILLING_REQUIRED';
  end if;

  if not exists (
    select 1
    from public.balcao_finance_connections c
    where c.business_id = v_business_id
      and c.store_id = p_store_id
      and c.provider = 'malvo'
      and c.status in ('pending', 'active', 'updating')
  ) then
    raise exception 'BALCAO_OPEN_FINANCE_REQUIRED';
  end if;

  update public.balcao_profiles
  set onboarding_completed = true,
      updated_at = now()
  where user_id = v_user_id;

  insert into public.balcao_audit_events (
    business_id, store_id, actor_user_id, action, entity_type, entity_id, metadata, created_at
  ) values (
    v_business_id, p_store_id, v_user_id, 'onboarding.open_finance_completed',
    'store', p_store_id::text, '{}'::jsonb, now()
  );
end;
$$;

revoke all on function public.balcao_complete_open_finance_onboarding(uuid) from public, anon;
grant execute on function public.balcao_complete_open_finance_onboarding(uuid) to authenticated;
