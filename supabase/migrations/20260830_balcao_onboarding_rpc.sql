create unique index if not exists balcao_businesses_active_cnpj_uq
  on public.balcao_businesses (tax_id)
  where active and tax_id ~ '^[0-9]{14}$';

grant select on public.inventory_v1_stores to authenticated;

drop policy if exists inventory_v1_stores_business_member_read on public.inventory_v1_stores;
create policy inventory_v1_stores_business_member_read
  on public.inventory_v1_stores
  for select
  to authenticated
  using (
    business_id is not null
    and (select private.balcao_is_business_member(business_id))
  );

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
  from public.balcao_business_members m
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
    from public.balcao_businesses b
    where b.created_by = v_user_id
      and b.active
    order by b.created_at asc
    limit 1
    for update;
  end if;

  if length(p_tax_id) = 14 and exists (
    select 1
    from public.balcao_businesses b
    where b.tax_id = p_tax_id
      and b.active
      and (v_business_id is null or b.id <> v_business_id)
  ) then
    raise exception 'BALCAO_CNPJ_ALREADY_REGISTERED';
  end if;

  if v_business_id is null then
    begin
      insert into public.balcao_businesses (
        display_name, tax_id, phone, pix_key, created_by, active, created_at, updated_at
      ) values (
        p_business_name, p_tax_id, p_phone, nullif(p_pix_key, ''), v_user_id, true, v_now, v_now
      ) returning id into v_business_id;
    exception when unique_violation then
      raise exception 'BALCAO_CNPJ_ALREADY_REGISTERED';
    end;
  else
    begin
      update public.balcao_businesses
      set display_name = p_business_name,
          tax_id = p_tax_id,
          phone = p_phone,
          pix_key = nullif(p_pix_key, ''),
          updated_at = v_now
      where id = v_business_id
        and active;
    exception when unique_violation then
      raise exception 'BALCAO_CNPJ_ALREADY_REGISTERED';
    end;
  end if;

  insert into public.balcao_business_members (
    business_id, user_id, role, active, created_at, updated_at
  ) values (
    v_business_id, v_user_id, 'owner', true, v_now, v_now
  )
  on conflict (business_id, user_id) do update
  set active = true,
      updated_at = excluded.updated_at;

  if p_legacy_installation_id is not null then
    select s.id, s.business_id, s.installation_id
      into v_store_id, v_store_business_id, v_installation_id
    from public.inventory_v1_stores s
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
    from public.inventory_v1_stores s
    where s.business_id = v_business_id
      and s.active
    order by s.created_at asc
    limit 1
    for update;
  end if;

  if v_store_id is not null then
    update public.inventory_v1_stores
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
    where id = v_store_id;
  else
    if p_legacy_installation_id is not null and not exists (
      select 1 from public.inventory_v1_stores s where s.installation_id = p_legacy_installation_id
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
    p_phone,
    p_tax_id,
    nullif(p_pix_key, ''),
    p_referral_source,
    nullif(p_referral_other, ''),
    true,
    v_now,
    v_now
  )
  on conflict (user_id) do update
  set phone = excluded.phone,
      tax_id = excluded.tax_id,
      pix_key = excluded.pix_key,
      referral_source = excluded.referral_source,
      referral_other = excluded.referral_other,
      onboarding_completed = true,
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
    'onboarding.completed',
    'store',
    v_store_id::text,
    '{}'::jsonb,
    v_now
  );

  return query select v_business_id, v_store_id, v_installation_id;
end;
$$;

revoke all on function public.balcao_complete_onboarding(text,text,text,text,text,text,text,text,text,text,text,text,text,text,uuid) from public, anon;
grant execute on function public.balcao_complete_onboarding(text,text,text,text,text,text,text,text,text,text,text,text,text,text,uuid) to authenticated;
