create or replace function public.balcao_list_staff(p_store_id uuid)
returns table (
  staff_id uuid,
  display_name text,
  staff_role text,
  is_active boolean,
  google_linked boolean
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict error
declare
  v_user_id uuid := auth.uid();
  v_business_id uuid;
  v_manager_role text;
begin
  if v_user_id is null then
    raise exception 'BALCAO_NOT_AUTHENTICATED';
  end if;

  select s.business_id
    into v_business_id
  from public.inventory_v1_stores as s
  where s.id = p_store_id
    and s.active;

  if v_business_id is null then
    raise exception 'BALCAO_STORE_NOT_FOUND';
  end if;

  select m.role
    into v_manager_role
  from public.balcao_business_members as m
  where m.business_id = v_business_id
    and m.user_id = v_user_id
    and m.active;

  if v_manager_role is null or v_manager_role not in ('owner', 'admin', 'manager') then
    raise exception 'BALCAO_STAFF_FORBIDDEN';
  end if;

  return query
  select
    p.id,
    p.display_name,
    a.role,
    (p.active and a.active),
    (p.google_user_id is not null)
  from public.balcao_staff_store_access as a
  join public.balcao_staff_profiles as p on p.id = a.staff_id
  where a.store_id = p_store_id
    and p.business_id = v_business_id
  order by p.created_at asc;
end;
$$;

create or replace function public.balcao_create_staff(
  p_store_id uuid,
  p_display_name text,
  p_role text,
  p_pin_hash text,
  p_custom_permissions jsonb default '[]'::jsonb
)
returns table (
  staff_id uuid,
  display_name text,
  staff_role text,
  is_active boolean
)
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
  v_now timestamptz := now();
begin
  if v_user_id is null then
    raise exception 'BALCAO_NOT_AUTHENTICATED';
  end if;

  if length(btrim(coalesce(p_display_name, ''))) < 2
     or length(btrim(coalesce(p_display_name, ''))) > 80
     or p_role not in ('stock', 'cashier', 'manager', 'custom')
     or length(coalesce(p_pin_hash, '')) < 20
     or jsonb_typeof(coalesce(p_custom_permissions, '[]'::jsonb)) <> 'array' then
    raise exception 'BALCAO_INVALID_STAFF';
  end if;

  select s.business_id
    into v_business_id
  from public.inventory_v1_stores as s
  where s.id = p_store_id
    and s.active;

  if v_business_id is null then
    raise exception 'BALCAO_STORE_NOT_FOUND';
  end if;

  select m.role
    into v_manager_role
  from public.balcao_business_members as m
  where m.business_id = v_business_id
    and m.user_id = v_user_id
    and m.active;

  if v_manager_role is null or v_manager_role not in ('owner', 'admin', 'manager') then
    raise exception 'BALCAO_STAFF_FORBIDDEN';
  end if;

  insert into public.balcao_staff_profiles (
    business_id,
    display_name,
    pin_hash,
    active,
    failed_pin_attempts,
    created_by,
    created_at,
    updated_at
  ) values (
    v_business_id,
    btrim(p_display_name),
    p_pin_hash,
    true,
    0,
    v_user_id,
    v_now,
    v_now
  )
  returning id into v_staff_id;

  insert into public.balcao_staff_store_access (
    staff_id,
    store_id,
    role,
    custom_permissions,
    active,
    created_at,
    updated_at
  ) values (
    v_staff_id,
    p_store_id,
    p_role,
    coalesce(p_custom_permissions, '[]'::jsonb),
    true,
    v_now,
    v_now
  );

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
    p_store_id,
    v_user_id,
    'staff.created',
    'staff',
    v_staff_id::text,
    jsonb_build_object('role', p_role),
    v_now
  );

  return query
  select v_staff_id, btrim(p_display_name), p_role, true;
end;
$$;

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
  v_staff_exists boolean := false;
begin
  if v_user_id is null then
    raise exception 'BALCAO_NOT_AUTHENTICATED';
  end if;

  if p_display_name is not null and (length(btrim(p_display_name)) < 2 or length(btrim(p_display_name)) > 80) then
    raise exception 'BALCAO_INVALID_STAFF';
  end if;
  if p_role is not null and p_role not in ('stock', 'cashier', 'manager', 'custom') then
    raise exception 'BALCAO_INVALID_STAFF';
  end if;
  if p_custom_permissions is not null and jsonb_typeof(p_custom_permissions) <> 'array' then
    raise exception 'BALCAO_INVALID_STAFF';
  end if;

  select s.business_id
    into v_business_id
  from public.inventory_v1_stores as s
  where s.id = p_store_id
    and s.active;

  if v_business_id is null then
    raise exception 'BALCAO_STORE_NOT_FOUND';
  end if;

  select m.role
    into v_manager_role
  from public.balcao_business_members as m
  where m.business_id = v_business_id
    and m.user_id = v_user_id
    and m.active;

  if v_manager_role is null or v_manager_role not in ('owner', 'admin', 'manager') then
    raise exception 'BALCAO_STAFF_FORBIDDEN';
  end if;

  select exists (
    select 1
    from public.balcao_staff_profiles as p
    join public.balcao_staff_store_access as a on a.staff_id = p.id
    where p.id = p_staff_id
      and p.business_id = v_business_id
      and a.store_id = p_store_id
  ) into v_staff_exists;

  if not v_staff_exists then
    raise exception 'BALCAO_STAFF_NOT_FOUND';
  end if;

  if p_display_name is not null or p_active is not null then
    update public.balcao_staff_profiles as p
    set display_name = coalesce(btrim(p_display_name), p.display_name),
        active = coalesce(p_active, p.active),
        updated_at = v_now
    where p.id = p_staff_id
      and p.business_id = v_business_id;
  end if;

  if p_role is not null or p_custom_permissions is not null or p_active is not null then
    update public.balcao_staff_store_access as a
    set role = coalesce(p_role, a.role),
        custom_permissions = coalesce(p_custom_permissions, a.custom_permissions),
        active = coalesce(p_active, a.active),
        updated_at = v_now
    where a.staff_id = p_staff_id
      and a.store_id = p_store_id;
  end if;

  if p_active is false then
    update public.balcao_staff_sessions as ss
    set revoked_at = v_now
    where ss.staff_id = p_staff_id
      and ss.revoked_at is null;
  end if;

  insert into public.balcao_audit_events (
    business_id, store_id, actor_user_id, action, entity_type, entity_id, metadata, created_at
  ) values (
    v_business_id,
    p_store_id,
    v_user_id,
    case when p_active is false then 'staff.deactivated' else 'staff.updated' end,
    'staff',
    p_staff_id::text,
    '{}'::jsonb,
    v_now
  );

  return true;
end;
$$;

create or replace function public.balcao_reset_staff_pin(
  p_store_id uuid,
  p_staff_id uuid,
  p_pin_hash text
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
  v_staff_exists boolean := false;
begin
  if v_user_id is null then
    raise exception 'BALCAO_NOT_AUTHENTICATED';
  end if;
  if length(coalesce(p_pin_hash, '')) < 20 then
    raise exception 'BALCAO_INVALID_STAFF_PIN';
  end if;

  select s.business_id
    into v_business_id
  from public.inventory_v1_stores as s
  where s.id = p_store_id
    and s.active;

  if v_business_id is null then
    raise exception 'BALCAO_STORE_NOT_FOUND';
  end if;

  select m.role
    into v_manager_role
  from public.balcao_business_members as m
  where m.business_id = v_business_id
    and m.user_id = v_user_id
    and m.active;

  if v_manager_role is null or v_manager_role not in ('owner', 'admin', 'manager') then
    raise exception 'BALCAO_STAFF_FORBIDDEN';
  end if;

  select exists (
    select 1
    from public.balcao_staff_profiles as p
    join public.balcao_staff_store_access as a on a.staff_id = p.id
    where p.id = p_staff_id
      and p.business_id = v_business_id
      and a.store_id = p_store_id
  ) into v_staff_exists;

  if not v_staff_exists then
    raise exception 'BALCAO_STAFF_NOT_FOUND';
  end if;

  update public.balcao_staff_profiles as p
  set pin_hash = p_pin_hash,
      failed_pin_attempts = 0,
      locked_until = null,
      updated_at = v_now
  where p.id = p_staff_id
    and p.business_id = v_business_id;

  update public.balcao_staff_sessions as ss
  set revoked_at = v_now
  where ss.staff_id = p_staff_id
    and ss.revoked_at is null;

  insert into public.balcao_audit_events (
    business_id, store_id, actor_user_id, action, entity_type, entity_id, metadata, created_at
  ) values (
    v_business_id,
    p_store_id,
    v_user_id,
    'staff.pin_reset',
    'staff',
    p_staff_id::text,
    '{}'::jsonb,
    v_now
  );

  return true;
end;
$$;

revoke all on function public.balcao_list_staff(uuid) from public, anon;
revoke all on function public.balcao_create_staff(uuid,text,text,text,jsonb) from public, anon;
revoke all on function public.balcao_update_staff(uuid,uuid,text,text,jsonb,boolean) from public, anon;
revoke all on function public.balcao_reset_staff_pin(uuid,uuid,text) from public, anon;

grant execute on function public.balcao_list_staff(uuid) to authenticated;
grant execute on function public.balcao_create_staff(uuid,text,text,text,jsonb) to authenticated;
grant execute on function public.balcao_update_staff(uuid,uuid,text,text,jsonb,boolean) to authenticated;
grant execute on function public.balcao_reset_staff_pin(uuid,uuid,text) to authenticated;
