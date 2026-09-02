-- BALCÃO Financeiro v2: return two periods of source data so the application
-- can compare the selected period with the immediately preceding one.
-- Authorization remains identical to the hardened v1 RPC.

create or replace function public.balcao_finance_dashboard_source(
  p_installation_id uuid default null,
  p_terminal_id uuid default null,
  p_terminal_hash text default null,
  p_session_id uuid default null,
  p_session_hash text default null,
  p_days integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict error
declare
  v_user_id uuid := auth.uid();
  v_days integer := case when p_days in (7, 30, 90) then p_days else 30 end;
  v_lookback_days integer := v_days * 2;
  v_store_id uuid;
  v_business_id uuid;
  v_installation_id uuid;
  v_google_role text;
  v_staff_role text;
  v_custom_permissions jsonb := '[]'::jsonb;
  v_current_staff_id uuid;
  v_current_session_id uuid;
  v_authorized boolean := false;
  v_start timestamptz := date_trunc('day', now()) - make_interval(days => (v_lookback_days - 1));
  v_start_date date := (date_trunc('day', now()) - make_interval(days => (v_lookback_days - 1)))::date;
  v_accounts jsonb := '[]'::jsonb;
  v_transactions jsonb := '[]'::jsonb;
  v_metrics jsonb := '[]'::jsonb;
  v_inventory_envelope jsonb := '{}'::jsonb;
  v_inventory_state jsonb := jsonb_build_object('products', '[]'::jsonb, 'sales', '[]'::jsonb);
  v_operational record;
begin
  if v_user_id is not null and p_installation_id is not null then
    select s.id, s.business_id, s.installation_id, m.role
      into v_store_id, v_business_id, v_installation_id, v_google_role
    from public.inventory_v1_stores as s
    join public.balcao_business_members as m
      on m.business_id = s.business_id
     and m.user_id = v_user_id
     and m.active
    where s.installation_id = p_installation_id
      and s.active
      and m.role in ('owner', 'admin', 'manager')
    limit 1;

    if v_store_id is not null then
      v_authorized := true;
    end if;
  end if;

  if not v_authorized
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
       and v_operational.current_session_id is not null then
      v_staff_role := v_operational.current_staff_role;
      v_custom_permissions := coalesce(v_operational.current_custom_permissions, '[]'::jsonb);

      if v_staff_role in ('finance', 'manager')
         or (v_staff_role = 'custom' and v_custom_permissions ? 'analysis.financial') then
        v_store_id := v_operational.store_id;
        v_business_id := v_operational.business_id;
        v_installation_id := v_operational.installation_id;
        v_current_staff_id := v_operational.current_staff_id;
        v_current_session_id := v_operational.current_session_id;
        v_authorized := true;
      end if;
    end if;
  end if;

  if not v_authorized or v_store_id is null or v_business_id is null or v_installation_id is null then
    raise exception 'BALCAO_FINANCE_FORBIDDEN';
  end if;

  select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at asc), '[]'::jsonb)
    into v_accounts
  from (
    select
      fa.id,
      fa.institution_name,
      fa.account_name,
      fa.account_type,
      fa.masked_number,
      fa.balance_cents,
      fa.currency,
      fa.status,
      fa.source,
      fa.last_synced_at,
      fa.created_at
    from public.balcao_finance_accounts as fa
    where fa.business_id = v_business_id
      and fa.store_id = v_store_id
  ) as a;

  select coalesce(jsonb_agg(to_jsonb(t) order by t.posted_at desc), '[]'::jsonb)
    into v_transactions
  from (
    select
      ft.id,
      ft.account_id,
      ft.posted_at,
      ft.amount_cents,
      ft.description,
      ft.counterparty_name,
      ft.counterparty_tax_id,
      ft.category,
      ft.category_confidence,
      ft.transaction_type,
      ft.is_internal_transfer,
      ft.source
    from public.balcao_finance_transactions as ft
    where ft.business_id = v_business_id
      and ft.store_id = v_store_id
      and ft.posted_at >= v_start
      and ft.posted_at <= now()
    order by ft.posted_at desc
    limit 10000
  ) as t;

  select coalesce(jsonb_agg(to_jsonb(m) order by m.metric_date asc), '[]'::jsonb)
    into v_metrics
  from (
    select
      fm.metric_date,
      fm.sales_cents,
      fm.cogs_cents,
      fm.units_sold_milli,
      fm.source
    from public.balcao_finance_daily_metrics as fm
    where fm.business_id = v_business_id
      and fm.store_id = v_store_id
      and fm.metric_date >= v_start_date
      and fm.metric_date <= current_date
    order by fm.metric_date asc
  ) as m;

  v_inventory_envelope := public.inventory_v1_get_state(v_installation_id);
  if coalesce((v_inventory_envelope ->> 'found')::boolean, false) then
    v_inventory_state := coalesce(v_inventory_envelope -> 'state', v_inventory_state);
  end if;

  return jsonb_build_object(
    'days', v_days,
    'lookbackDays', v_lookback_days,
    'accounts', v_accounts,
    'transactions', v_transactions,
    'dailyMetrics', v_metrics,
    'inventoryState', v_inventory_state,
    'authorization', case when v_current_staff_id is null then 'google' else 'staff' end
  );
end;
$$;

revoke all on function public.balcao_finance_dashboard_source(uuid, uuid, text, uuid, text, integer) from public;
grant execute on function public.balcao_finance_dashboard_source(uuid, uuid, text, uuid, text, integer) to anon, authenticated, service_role;
