create table if not exists public.balcao_staff_access_links (
  staff_id uuid not null references public.balcao_staff_profiles(id) on delete cascade,
  store_id uuid not null references public.inventory_v1_stores(id) on delete cascade,
  token text not null unique,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (staff_id, store_id)
);

alter table public.balcao_staff_access_links enable row level security;
revoke all on table public.balcao_staff_access_links from public, anon, authenticated;

insert into public.balcao_staff_access_links (staff_id, store_id, token, created_by)
select a.staff_id, a.store_id, encode(gen_random_bytes(24), 'hex'), p.created_by
from public.balcao_staff_store_access as a
join public.balcao_staff_profiles as p on p.id = a.staff_id
where p.active and a.active
on conflict (staff_id, store_id) do nothing;

create or replace function private.balcao_ensure_staff_access_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.balcao_staff_access_links (staff_id, store_id, token, created_by)
  values (new.staff_id, new.store_id, encode(gen_random_bytes(24), 'hex'), auth.uid())
  on conflict (staff_id, store_id) do nothing;
  return new;
end;
$$;

drop trigger if exists balcao_staff_access_link_after_access on public.balcao_staff_store_access;
create trigger balcao_staff_access_link_after_access
after insert on public.balcao_staff_store_access
for each row execute function private.balcao_ensure_staff_access_link();

create or replace function public.balcao_staff_access_links_for_store(p_store_id uuid)
returns table (
  staff_id uuid,
  access_token text
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict error
declare
  v_user_id uuid := auth.uid();
  v_business_id uuid;
  v_role text;
begin
  if v_user_id is null then
    raise exception 'BALCAO_NOT_AUTHENTICATED';
  end if;

  select s.business_id into v_business_id
  from public.inventory_v1_stores as s
  where s.id = p_store_id and s.active;

  if v_business_id is null then
    raise exception 'BALCAO_STORE_NOT_FOUND';
  end if;

  select m.role into v_role
  from public.balcao_business_members as m
  where m.business_id = v_business_id
    and m.user_id = v_user_id
    and m.active;

  if v_role is null or v_role not in ('owner', 'admin', 'manager') then
    raise exception 'BALCAO_STAFF_FORBIDDEN';
  end if;

  return query
  select l.staff_id, l.token
  from public.balcao_staff_access_links as l
  join public.balcao_staff_profiles as p on p.id = l.staff_id
  join public.balcao_staff_store_access as a
    on a.staff_id = l.staff_id and a.store_id = l.store_id
  where l.store_id = p_store_id
    and l.active
    and p.active
    and a.active;
end;
$$;

create or replace function public.balcao_rotate_staff_access_link(
  p_store_id uuid,
  p_staff_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict error
declare
  v_user_id uuid := auth.uid();
  v_business_id uuid;
  v_role text;
  v_token text := encode(gen_random_bytes(24), 'hex');
  v_exists boolean := false;
begin
  if v_user_id is null then
    raise exception 'BALCAO_NOT_AUTHENTICATED';
  end if;

  select s.business_id into v_business_id
  from public.inventory_v1_stores as s
  where s.id = p_store_id and s.active;

  if v_business_id is null then
    raise exception 'BALCAO_STORE_NOT_FOUND';
  end if;

  select m.role into v_role
  from public.balcao_business_members as m
  where m.business_id = v_business_id
    and m.user_id = v_user_id
    and m.active;

  if v_role is null or v_role not in ('owner', 'admin', 'manager') then
    raise exception 'BALCAO_STAFF_FORBIDDEN';
  end if;

  select exists (
    select 1
    from public.balcao_staff_profiles as p
    join public.balcao_staff_store_access as a on a.staff_id = p.id
    where p.id = p_staff_id
      and p.business_id = v_business_id
      and a.store_id = p_store_id
  ) into v_exists;

  if not v_exists then
    raise exception 'BALCAO_STAFF_NOT_FOUND';
  end if;

  insert into public.balcao_staff_access_links (
    staff_id, store_id, token, active, created_by, created_at, updated_at
  ) values (
    p_staff_id, p_store_id, v_token, true, v_user_id, now(), now()
  )
  on conflict (staff_id, store_id) do update
  set token = excluded.token,
      active = true,
      updated_at = now();

  insert into public.balcao_audit_events (
    business_id, store_id, actor_user_id, action, entity_type, entity_id, metadata, created_at
  ) values (
    v_business_id, p_store_id, v_user_id,
    'staff.access_link_rotated', 'staff', p_staff_id::text, '{}'::jsonb, now()
  );

  return v_token;
end;
$$;

create or replace function public.balcao_staff_access_info(p_token text)
returns table (
  is_valid boolean,
  store_name text
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict error
begin
  return query
  select true, s.display_name
  from public.balcao_staff_access_links as l
  join public.balcao_staff_profiles as p on p.id = l.staff_id
  join public.balcao_staff_store_access as a
    on a.staff_id = l.staff_id and a.store_id = l.store_id
  join public.inventory_v1_stores as s on s.id = l.store_id
  where l.token = p_token
    and l.active
    and p.active
    and a.active
    and s.active
  limit 1;

  if not found then
    return query select false, null::text;
  end if;
end;
$$;

create or replace function public.balcao_staff_access_login(
  p_token text,
  p_display_name text,
  p_pin text,
  p_terminal_hash text,
  p_session_hash text,
  p_user_agent text,
  p_session_expires_at timestamptz
)
returns table (
  login_status text,
  terminal_id uuid,
  session_id uuid,
  installation_id uuid,
  store_name text,
  staff_id uuid,
  staff_name text,
  staff_role text
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict error
declare
  v_link public.balcao_staff_access_links%rowtype;
  v_business_id uuid;
  v_installation_id uuid;
  v_store_name text;
  v_staff_name text;
  v_pin_hash text;
  v_role text;
  v_failed integer;
  v_locked_until timestamptz;
  v_attempts integer;
  v_lock_until timestamptz;
  v_terminal_id uuid;
  v_session_id uuid;
  v_bcrypt_hash text;
  v_now timestamptz := now();
begin
  if length(coalesce(p_token, '')) < 24
     or p_display_name is null
     or p_pin !~ '^\d{4}$'
     or p_terminal_hash !~ '^[0-9a-f]{64}$'
     or p_session_hash !~ '^[0-9a-f]{64}$'
     or p_session_expires_at <= v_now
     or p_session_expires_at > v_now + interval '13 hours' then
    return query select 'INVALID_REQUEST', null::uuid, null::uuid, null::uuid, null::text, null::uuid, null::text, null::text;
    return;
  end if;

  select l.* into v_link
  from public.balcao_staff_access_links as l
  where l.token = p_token
    and l.active
  limit 1;

  if v_link.staff_id is null then
    return query select 'INVALID_LINK', null::uuid, null::uuid, null::uuid, null::text, null::uuid, null::text, null::text;
    return;
  end if;

  select
    p.business_id,
    p.display_name,
    p.pin_hash,
    p.failed_pin_attempts,
    p.locked_until,
    a.role,
    s.installation_id,
    s.display_name
  into
    v_business_id,
    v_staff_name,
    v_pin_hash,
    v_failed,
    v_locked_until,
    v_role,
    v_installation_id,
    v_store_name
  from public.balcao_staff_profiles as p
  join public.balcao_staff_store_access as a
    on a.staff_id = p.id and a.store_id = v_link.store_id
  join public.inventory_v1_stores as s on s.id = v_link.store_id
  where p.id = v_link.staff_id
    and p.active
    and a.active
    and s.active
  for update of p;

  if v_business_id is null then
    return query select 'INVALID_LINK', null::uuid, null::uuid, null::uuid, null::text, null::uuid, null::text, null::text;
    return;
  end if;

  if lower(regexp_replace(btrim(coalesce(p_display_name, '')), '\s+', ' ', 'g'))
       <> lower(regexp_replace(btrim(v_staff_name), '\s+', ' ', 'g')) then
    return query select 'INVALID_NAME', null::uuid, null::uuid, null::uuid, v_store_name, v_link.staff_id, null::text, null::text;
    return;
  end if;

  if v_locked_until is not null and v_locked_until > v_now then
    return query select 'PIN_LOCKED', null::uuid, null::uuid, null::uuid, v_store_name, v_link.staff_id, v_staff_name, v_role;
    return;
  end if;

  v_bcrypt_hash := replace(v_pin_hash, '$2b$', '$2a$');
  if crypt(p_pin, v_bcrypt_hash) <> v_bcrypt_hash then
    v_attempts := coalesce(v_failed, 0) + 1;
    v_lock_until := null;

    if v_attempts >= 5 then
      case greatest(1, floor(v_attempts / 5.0)::integer)
        when 1 then v_lock_until := v_now + interval '30 seconds';
        when 2 then v_lock_until := v_now + interval '2 minutes';
        when 3 then v_lock_until := v_now + interval '5 minutes';
        when 4 then v_lock_until := v_now + interval '15 minutes';
        else v_lock_until := v_now + interval '1 hour';
      end case;
    end if;

    update public.balcao_staff_profiles as p
    set failed_pin_attempts = v_attempts,
        locked_until = v_lock_until,
        updated_at = v_now
    where p.id = v_link.staff_id;

    return query select
      case when v_lock_until is null then 'INVALID_PIN' else 'PIN_LOCKED' end,
      null::uuid, null::uuid, null::uuid, v_store_name, v_link.staff_id, v_staff_name, v_role;
    return;
  end if;

  update public.balcao_staff_profiles as p
  set failed_pin_attempts = 0,
      locked_until = null,
      updated_at = v_now
  where p.id = v_link.staff_id;

  insert into public.balcao_terminals (
    store_id, display_name, credential_hash, user_agent, active, last_seen_at, created_at, updated_at
  ) values (
    v_link.store_id,
    'Acesso · ' || v_staff_name,
    p_terminal_hash,
    nullif(left(coalesce(p_user_agent, ''), 500), ''),
    true,
    v_now,
    v_now,
    v_now
  ) returning id into v_terminal_id;

  insert into public.balcao_staff_sessions (
    terminal_id, staff_id, session_hash, expires_at, last_seen_at, created_at
  ) values (
    v_terminal_id,
    v_link.staff_id,
    p_session_hash,
    p_session_expires_at,
    v_now,
    v_now
  ) returning id into v_session_id;

  update public.balcao_staff_access_links as l
  set last_used_at = v_now,
      updated_at = v_now
  where l.staff_id = v_link.staff_id
    and l.store_id = v_link.store_id;

  insert into public.balcao_audit_events (
    business_id, store_id, actor_staff_id, terminal_id, action, entity_type, entity_id, metadata, created_at
  ) values (
    v_business_id,
    v_link.store_id,
    v_link.staff_id,
    v_terminal_id,
    'staff.access_login',
    'staff',
    v_link.staff_id::text,
    '{}'::jsonb,
    v_now
  );

  return query select 'OK', v_terminal_id, v_session_id, v_installation_id, v_store_name, v_link.staff_id, v_staff_name, v_role;
end;
$$;

create or replace function public.balcao_operational_context(
  p_terminal_id uuid,
  p_terminal_hash text,
  p_session_id uuid default null,
  p_session_hash text default null
)
returns table (
  terminal_id uuid,
  store_id uuid,
  business_id uuid,
  installation_id uuid,
  store_name text,
  terminal_name text,
  current_staff_id uuid,
  current_staff_name text,
  current_staff_role text,
  current_custom_permissions jsonb,
  current_session_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict error
declare
  v_store_id uuid;
  v_business_id uuid;
  v_installation_id uuid;
  v_store_name text;
  v_terminal_name text;
  v_staff_id uuid;
  v_staff_name text;
  v_role text;
  v_custom jsonb;
  v_session_id uuid;
  v_now timestamptz := now();
begin
  select t.store_id, s.business_id, s.installation_id, s.display_name, t.display_name
  into v_store_id, v_business_id, v_installation_id, v_store_name, v_terminal_name
  from public.balcao_terminals as t
  join public.inventory_v1_stores as s on s.id = t.store_id
  where t.id = p_terminal_id
    and t.credential_hash = p_terminal_hash
    and t.active
    and s.active
  limit 1;

  if v_store_id is null or v_business_id is null then
    return;
  end if;

  update public.balcao_terminals as t
  set last_seen_at = v_now,
      updated_at = v_now
  where t.id = p_terminal_id;

  if p_session_id is not null and p_session_hash is not null then
    select ss.id, p.id, p.display_name, a.role, a.custom_permissions
    into v_session_id, v_staff_id, v_staff_name, v_role, v_custom
    from public.balcao_staff_sessions as ss
    join public.balcao_staff_profiles as p on p.id = ss.staff_id
    join public.balcao_staff_store_access as a
      on a.staff_id = p.id and a.store_id = v_store_id
    where ss.id = p_session_id
      and ss.terminal_id = p_terminal_id
      and ss.session_hash = p_session_hash
      and ss.revoked_at is null
      and ss.expires_at > v_now
      and ss.last_seen_at > v_now - interval '30 minutes'
      and p.active
      and a.active
    limit 1;

    if v_session_id is not null then
      update public.balcao_staff_sessions as ss
      set last_seen_at = v_now
      where ss.id = v_session_id;
    else
      update public.balcao_staff_sessions as ss
      set revoked_at = coalesce(ss.revoked_at, v_now)
      where ss.id = p_session_id
        and ss.terminal_id = p_terminal_id
        and ss.session_hash = p_session_hash;
    end if;
  end if;

  return query select
    p_terminal_id,
    v_store_id,
    v_business_id,
    v_installation_id,
    v_store_name,
    v_terminal_name,
    v_staff_id,
    v_staff_name,
    v_role,
    coalesce(v_custom, '[]'::jsonb),
    v_session_id;
end;
$$;

create or replace function public.balcao_operational_staff_list(
  p_terminal_id uuid,
  p_terminal_hash text
)
returns table (
  staff_id uuid,
  display_name text,
  staff_role text
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict error
declare
  v_store_id uuid;
begin
  select t.store_id into v_store_id
  from public.balcao_terminals as t
  join public.inventory_v1_stores as s on s.id = t.store_id
  where t.id = p_terminal_id
    and t.credential_hash = p_terminal_hash
    and t.active
    and s.active
  limit 1;

  if v_store_id is null then
    return;
  end if;

  return query
  select p.id, p.display_name, a.role
  from public.balcao_staff_store_access as a
  join public.balcao_staff_profiles as p on p.id = a.staff_id
  where a.store_id = v_store_id
    and a.active
    and p.active
  order by p.display_name;
end;
$$;

create or replace function public.balcao_staff_session_logout(
  p_session_id uuid,
  p_session_hash text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.balcao_staff_sessions as ss
  set revoked_at = coalesce(ss.revoked_at, now())
  where ss.id = p_session_id
    and ss.session_hash = p_session_hash
    and ss.revoked_at is null;
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

revoke all on function public.balcao_staff_access_links_for_store(uuid) from public, anon;
revoke all on function public.balcao_rotate_staff_access_link(uuid,uuid) from public, anon;
grant execute on function public.balcao_staff_access_links_for_store(uuid) to authenticated;
grant execute on function public.balcao_rotate_staff_access_link(uuid,uuid) to authenticated;

revoke all on function public.balcao_staff_access_info(text) from public;
revoke all on function public.balcao_staff_access_login(text,text,text,text,text,text,timestamptz) from public;
revoke all on function public.balcao_operational_context(uuid,text,uuid,text) from public;
revoke all on function public.balcao_operational_staff_list(uuid,text) from public;
revoke all on function public.balcao_staff_session_logout(uuid,text) from public;

grant execute on function public.balcao_staff_access_info(text) to anon, authenticated;
grant execute on function public.balcao_staff_access_login(text,text,text,text,text,text,timestamptz) to anon, authenticated;
grant execute on function public.balcao_operational_context(uuid,text,uuid,text) to anon, authenticated;
grant execute on function public.balcao_operational_staff_list(uuid,text) to anon, authenticated;
grant execute on function public.balcao_staff_session_logout(uuid,text) to anon, authenticated;
