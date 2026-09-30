-- Cadastro sem banco: o lojista pode "Conectar depois". A Rafa manda o link /conectar-banco quando precisar.
alter table public.balcao_businesses add column if not exists bank_skipped_at timestamptz;

drop function if exists public.balcao_complete_open_finance_onboarding(uuid);

create or replace function public.balcao_complete_open_finance_onboarding(p_store_id uuid, p_skip_bank boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_business_id uuid;
  v_role text;
  v_phone text;
  v_tax_id text;
  v_pix_key text;
  v_referral_source text;
  v_referral_other text;
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
      and b.status in ('configured', 'active', 'courtesy', 'courtesy_ending')
  ) then
    raise exception 'BALCAO_BILLING_REQUIRED';
  end if;

  if not coalesce(p_skip_bank, false) and not exists (
    select 1
    from public.balcao_finance_connections c
    where c.business_id = v_business_id
      and c.store_id = p_store_id
      and c.provider = 'malvo'
      and c.status in ('pending', 'active', 'updating')
  ) then
    raise exception 'BALCAO_OPEN_FINANCE_REQUIRED';
  end if;

  select b.phone, b.tax_id, b.pix_key, d.referral_source, d.referral_other
    into v_phone, v_tax_id, v_pix_key, v_referral_source, v_referral_other
  from public.balcao_businesses b
  join public.balcao_onboarding_drafts d
    on d.business_id = b.id
   and d.user_id = v_user_id
   and d.store_id = p_store_id
  where b.id = v_business_id
    and b.active
  limit 1;

  if not found then
    raise exception 'BALCAO_ONBOARDING_DRAFT_REQUIRED';
  end if;

  insert into public.balcao_profiles (
    user_id,
    phone,
    tax_id,
    pix_key,
    referral_source,
    referral_other,
    onboarding_completed,
    created_at,
    updated_at
  ) values (
    v_user_id,
    v_phone,
    v_tax_id,
    v_pix_key,
    v_referral_source,
    v_referral_other,
    true,
    now(),
    now()
  )
  on conflict (user_id) do update
  set phone = excluded.phone,
      tax_id = excluded.tax_id,
      pix_key = excluded.pix_key,
      referral_source = excluded.referral_source,
      referral_other = excluded.referral_other,
      onboarding_completed = true,
      updated_at = excluded.updated_at;

  delete from public.balcao_onboarding_drafts
  where user_id = v_user_id;

  insert into public.balcao_audit_events (
    business_id, store_id, actor_user_id, action, entity_type, entity_id, metadata, created_at
  ) values (
    v_business_id, p_store_id, v_user_id,
    case when coalesce(p_skip_bank, false) then 'onboarding.bank_skipped' else 'onboarding.open_finance_completed' end,
    'store', p_store_id::text, '{}'::jsonb, now()
  );

  -- Pulou o banco: registra quando (o lojista conecta depois em /conectar-banco).
  if coalesce(p_skip_bank, false) and not exists (
    select 1 from public.balcao_finance_connections c
    where c.business_id = v_business_id and c.provider = 'malvo' and c.status in ('pending', 'active', 'updating')
  ) then
    update public.balcao_businesses set bank_skipped_at = coalesce(bank_skipped_at, now()) where id = v_business_id;
  end if;
end;
$$;

revoke all on function public.balcao_complete_open_finance_onboarding(uuid, boolean) from public, anon;
grant execute on function public.balcao_complete_open_finance_onboarding(uuid, boolean) to authenticated;
