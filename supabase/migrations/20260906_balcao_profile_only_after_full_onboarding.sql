-- BALCÃO: authenticated Google identity may hold an onboarding draft, but the
-- durable balcao_profiles row is created only after Asaas billing and Malvo
-- Open Finance are both configured and the final onboarding gate succeeds.

create table if not exists public.balcao_onboarding_drafts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  business_id uuid not null references public.balcao_businesses(id) on delete cascade,
  store_id uuid not null references public.inventory_v1_stores(id) on delete cascade,
  referral_source text check (referral_source in ('instagram','google','referral','ai','youtube_tiktok','other')),
  referral_other text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.balcao_onboarding_drafts enable row level security;
revoke all on public.balcao_onboarding_drafts from public, anon, authenticated;
grant all on public.balcao_onboarding_drafts to service_role;

create or replace function public.balcao_complete_onboarding(
  p_business_name text,
  p_tax_id text,
  p_phone text,
  p_pix_key text,
  p_referral_source text,
  p_referral_other text,
  p_business_type text,
  p_cep text,
  p_street text,
  p_address_number text,
  p_complement text,
  p_neighborhood text,
  p_city text,
  p_state text,
  p_legacy_installation_id uuid default null
)
returns table (
  business_id uuid,
  store_id uuid,
  installation_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict error
declare
  v_user_id uuid := auth.uid();
  v_business_id uuid;
  v_member_role text;
  v_store_id uuid;
  v_store_business_id uuid;
  v_installation_id uuid;
  v_now timestamptz := now();
begin
  if v_user_id is null then
    raise exception 'BALCAO_NOT_AUTHENTICATED';
  end if;

  if coalesce(btrim(p_business_name), '') = ''
     or coalesce(btrim(p_phone), '') = ''
     or coalesce(btrim(p_tax_id), '') = ''
     or coalesce(btrim(p_business_type), '') = ''
     or coalesce(btrim(p_cep), '') = ''
     or coalesce(btrim(p_street), '') = ''
     or coalesce(btrim(p_address_number), '') = ''
     or coalesce(btrim(p_city), '') = ''
     or coalesce(btrim(p_state), '') = '' then
    raise exception 'BALCAO_INVALID_ONBOARDING';
  end if;

  select m.business_id, m.role
    into v_business_id, v_member_role
  from public.balcao_business_members as m
  where m.user_id = v_user_id
    and m.active
  order by m.created_at asc
  limit 1;

  if v_business_id is not null and v_member_role <> 'owner' then
    raise exception 'BALCAO_MEMBER_CANNOT_ONBOARD';
  end if;

  if v_business_id is null then
    select b.id
      into v_business_id
    from public.balcao_businesses as b
    where b.created_by = v_user_id
      and b.active
    order by b.created_at asc
    limit 1
    for update;
  end if;

  if v_business_id is null then
    insert into public.balcao_businesses (
      display_name, tax_id, phone, pix_key, created_by, active, created_at, updated_at
    ) values (
      p_business_name, p_tax_id, p_phone, nullif(p_pix_key, ''), v_user_id, true, v_now, v_now
    ) returning id into v_business_id;
  else
    update public.balcao_businesses as b
    set display_name = p_business_name,
        tax_id = p_tax_id,
        phone = p_phone,
        pix_key = nullif(p_pix_key, ''),
        updated_at = v_now
    where b.id = v_business_id
      and b.active;
  end if;

  insert into public.balcao_business_members (
    business_id, user_id, role, active, created_at, updated_at
  ) values (
    v_business_id, v_user_id, 'owner', true, v_now, v_now
  )
  on conflict on constraint balcao_business_members_pkey do update
  set active = true,
      updated_at = excluded.updated_at;

  if p_legacy_installation_id is not null then
    select s.id, s.business_id, s.installation_id
      into v_store_id, v_store_business_id, v_installation_id
    from public.inventory_v1_stores as s
    where s.installation_id = p_legacy_installation_id
    limit 1
    for update;

    if v_store_id is not null and v_store_business_id is not null and v_store_business_id <> v_business_id then
      v_store_id := null;
      v_installation_id := null;
    end if;
  end if;

  if v_store_id is null then
    select s.id, s.installation_id
      into v_store_id, v_installation_id
    from public.inventory_v1_stores as s
    where s.business_id = v_business_id
      and s.active
    order by s.created_at asc
    limit 1
    for update;
  end if;

  if v_store_id is not null then
    update public.inventory_v1_stores as s
    set business_id = v_business_id,
        display_name = p_business_name,
        business_type = p_business_type,
        cep = p_cep,
        street = p_street,
        address_number = p_address_number,
        complement = nullif(p_complement, ''),
        neighborhood = nullif(p_neighborhood, ''),
        city = p_city,
        state = p_state,
        active = true,
        updated_at = v_now
    where s.id = v_store_id;
  else
    if p_legacy_installation_id is not null and not exists (
      select 1
      from public.inventory_v1_stores as s
      where s.installation_id = p_legacy_installation_id
    ) then
      v_installation_id := p_legacy_installation_id;
    else
      v_installation_id := gen_random_uuid();
    end if;

    insert into public.inventory_v1_stores (
      installation_id,
      display_name,
      system_tag,
      business_id,
      business_type,
      cep,
      street,
      address_number,
      complement,
      neighborhood,
      city,
      state,
      active,
      created_at,
      updated_at
    ) values (
      v_installation_id,
      p_business_name,
      'inventory',
      v_business_id,
      p_business_type,
      p_cep,
      p_street,
      p_address_number,
      nullif(p_complement, ''),
      nullif(p_neighborhood, ''),
      p_city,
      p_state,
      true,
      v_now,
      v_now
    ) returning id into v_store_id;
  end if;

  -- Only an ephemeral onboarding draft exists before the last step. There is
  -- deliberately no insert into public.balcao_profiles in this function.
  insert into public.balcao_onboarding_drafts (
    user_id, business_id, store_id, referral_source, referral_other, created_at, updated_at
  ) values (
    v_user_id, v_business_id, v_store_id, p_referral_source, nullif(p_referral_other, ''), v_now, v_now
  )
  on conflict (user_id) do update
  set business_id = excluded.business_id,
      store_id = excluded.store_id,
      referral_source = excluded.referral_source,
      referral_other = excluded.referral_other,
      updated_at = excluded.updated_at;

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
    v_store_id,
    v_user_id,
    'onboarding.prepared',
    'store',
    v_store_id::text,
    '{}'::jsonb,
    v_now
  );

  return query
  select v_business_id, v_store_id, v_installation_id;
end;
$$;

revoke all on function public.balcao_complete_onboarding(text,text,text,text,text,text,text,text,text,text,text,text,text,text,uuid) from public, anon;
grant execute on function public.balcao_complete_onboarding(text,text,text,text,text,text,text,text,text,text,text,text,text,text,uuid) to authenticated;

-- This helper used to flip an already-created profile back to incomplete.
-- New onboardings have no profile yet, so it now only validates authentication.
create or replace function public.balcao_require_open_finance_onboarding()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'BALCAO_NOT_AUTHENTICATED';
  end if;
end;
$$;

revoke all on function public.balcao_require_open_finance_onboarding() from public, anon;
grant execute on function public.balcao_require_open_finance_onboarding() to authenticated;

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
    v_business_id, p_store_id, v_user_id, 'onboarding.open_finance_completed',
    'store', p_store_id::text, '{}'::jsonb, now()
  );
end;
$$;

revoke all on function public.balcao_complete_open_finance_onboarding(uuid) from public, anon;
grant execute on function public.balcao_complete_open_finance_onboarding(uuid) to authenticated;
