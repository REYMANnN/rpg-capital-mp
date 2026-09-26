-- Painel de admin da RPG: cupons de cortesia (uso único, sem prazo) e login por senha.

-- 1) Conta de cobrança aceita cortesia.
alter table public.balcao_billing_accounts drop constraint if exists balcao_billing_accounts_status_check;
alter table public.balcao_billing_accounts
  add constraint balcao_billing_accounts_status_check
  check (status in ('pending_payment_method', 'configured', 'active', 'past_due', 'cancelled', 'courtesy', 'courtesy_ending'));

alter table public.balcao_billing_accounts
  add column if not exists coupon_code text,
  add column if not exists courtesy_started_at timestamptz,
  add column if not exists courtesy_end_requested_at timestamptz,
  add column if not exists courtesy_ends_at timestamptz;

-- 2) Cupons.
create table if not exists public.balcao_coupons (
  code text primary key check (code ~ '^RPG-[A-Z0-9]{6}$'),
  note text not null default '',
  status text not null default 'available' check (status in ('available', 'redeemed', 'cancelled')),
  redeemed_business_id uuid references public.balcao_businesses(id) on delete set null,
  redeemed_by uuid,
  redeemed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.balcao_coupons enable row level security;
revoke all on table public.balcao_coupons from public, anon, authenticated;
grant select, insert, update, delete on table public.balcao_coupons to service_role;

-- 3) Admin: senha (hash scrypt) e tentativas de login.
create table if not exists public.rpg_admin_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table public.rpg_admin_settings enable row level security;
revoke all on table public.rpg_admin_settings from public, anon, authenticated;
grant select, insert, update, delete on table public.rpg_admin_settings to service_role;

create table if not exists public.rpg_admin_login_attempts (
  id bigserial primary key,
  ip text not null,
  ok boolean not null,
  created_at timestamptz not null default now()
);
create index if not exists rpg_admin_login_attempts_recent on public.rpg_admin_login_attempts (created_at desc);
alter table public.rpg_admin_login_attempts enable row level security;
revoke all on table public.rpg_admin_login_attempts from public, anon, authenticated;
grant select, insert, delete on table public.rpg_admin_login_attempts to service_role;
grant usage, select on sequence public.rpg_admin_login_attempts_id_seq to service_role;

-- 4) Resgate do cupom pelo dono, numa única operação (o cupom não pode ser usado duas vezes).
create or replace function public.balcao_redeem_coupon(p_store_id uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_business_id uuid;
  v_role text;
  v_code text := upper(trim(coalesce(p_code, '')));
  v_coupon public.balcao_coupons%rowtype;
  v_status text;
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
    raise exception 'BALCAO_COUPON_FORBIDDEN';
  end if;

  select status into v_status from public.balcao_billing_accounts where business_id = v_business_id;
  if v_status in ('configured', 'active', 'courtesy', 'courtesy_ending') then
    raise exception 'BALCAO_COUPON_ALREADY_BILLED';
  end if;

  select * into v_coupon from public.balcao_coupons where code = v_code for update;
  if not found or v_coupon.status <> 'available' then
    raise exception 'BALCAO_COUPON_INVALID';
  end if;

  update public.balcao_coupons
     set status = 'redeemed', redeemed_business_id = v_business_id, redeemed_by = auth.uid(),
         redeemed_at = now(), updated_at = now()
   where code = v_code;

  insert into public.balcao_billing_accounts (business_id, provider, status, coupon_code, courtesy_started_at, updated_at)
  values (v_business_id, 'asaas', 'courtesy', v_code, now(), now())
  on conflict (business_id) do update set
    status = 'courtesy',
    coupon_code = excluded.coupon_code,
    courtesy_started_at = now(),
    courtesy_end_requested_at = null,
    courtesy_ends_at = null,
    updated_at = now();

  insert into public.balcao_audit_events (business_id, store_id, actor_user_id, action, entity_type, entity_id, metadata, created_at)
  values (v_business_id, p_store_id, auth.uid(), 'billing.coupon_redeemed', 'coupon', v_code, '{}'::jsonb, now());

  return jsonb_build_object('ok', true, 'status', 'courtesy');
end;
$function$;
revoke all on function public.balcao_redeem_coupon(uuid, text) from public, anon;
grant execute on function public.balcao_redeem_coupon(uuid, text) to authenticated;

-- 5) Cortesia libera o banco e a conclusão do cadastro, como uma conta paga.
do $$
declare
  v_def text;
  v_name text;
begin
  foreach v_name in array array['balcao_billing_allows_bank_connection', 'balcao_complete_open_finance_onboarding'] loop
    select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = v_name;
    if v_def is null then
      raise exception 'function % not found', v_name;
    end if;
    if position('''courtesy''' in v_def) = 0 then
      if position('status in (''configured'', ''active'')' in v_def) = 0 then
        raise exception 'status list not found in %', v_name;
      end if;
      v_def := replace(v_def, 'status in (''configured'', ''active'')', 'status in (''configured'', ''active'', ''courtesy'', ''courtesy_ending'')');
      execute v_def;
    end if;
  end loop;
end $$;
