-- Preço do BALCÃO: R$ 9,99 por mês (antes R$ 5,99). Vale para todas as contas.

alter table public.balcao_billing_accounts drop constraint if exists balcao_billing_accounts_monthly_amount_cents_check;

update public.balcao_billing_accounts
   set monthly_amount_cents = 999, plan_code = 'balcao_999', updated_at = now()
 where monthly_amount_cents <> 999 or plan_code <> 'balcao_999';

alter table public.balcao_billing_accounts
  alter column monthly_amount_cents set default 999,
  alter column plan_code set default 'balcao_999',
  add constraint balcao_billing_accounts_monthly_amount_cents_check check (monthly_amount_cents = 999);

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
set search_path to ''
as $function$
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
    v_business_id, 'asaas', 'balcao_999', 999, 1,
    'configured', trim(p_asaas_customer_id), nullif(trim(p_asaas_initial_subscription_id), ''),
    trim(p_asaas_recurring_subscription_id), p_first_due_date, p_next_due_date, now()
  )
  on conflict (business_id) do update set
    status = 'configured',
    plan_code = 'balcao_999',
    monthly_amount_cents = 999,
    asaas_customer_id = excluded.asaas_customer_id,
    asaas_initial_subscription_id = excluded.asaas_initial_subscription_id,
    asaas_recurring_subscription_id = excluded.asaas_recurring_subscription_id,
    first_due_date = excluded.first_due_date,
    next_due_date = excluded.next_due_date,
    updated_at = now();

  return jsonb_build_object('ok', true, 'businessId', v_business_id, 'status', 'configured');
end;
$function$;
