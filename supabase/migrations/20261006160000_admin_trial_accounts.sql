-- Admin-created trial accounts: reuse the normal business/store/WhatsApp model.
-- Existing historical phone collisions are intentionally left untouched.

alter table public.balcao_businesses
  add column if not exists account_origin text not null default 'self_signup',
  add column if not exists primary_contact_name text,
  add column if not exists trial_converted_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'balcao_businesses_account_origin_check'
      and conrelid = 'public.balcao_businesses'::regclass
  ) then
    alter table public.balcao_businesses
      add constraint balcao_businesses_account_origin_check
      check (account_origin in ('self_signup', 'admin_trial'));
  end if;
end $$;

create or replace function public.normalize_brazil_phone(p_value text)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  with cleaned as (
    select regexp_replace(coalesce(p_value, ''), '\D', '', 'g') as d
  )
  select case
    when d ~ '^55[1-9]{2}[2-9][0-9]{7,8}$' then d
    when d ~ '^[1-9]{2}[2-9][0-9]{7,8}$' then '55' || d
    else null
  end
  from cleaned;
$$;

-- Prevent NEW/changed active phone collisions without rewriting legacy duplicates.
-- Unrelated updates on old rows are deliberately allowed even if their historical
-- phone formatting would not pass today's validator.
create or replace function public.guard_balcao_business_phone()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_phone text;
  v_phone_changed boolean := false;
  v_should_check boolean := false;
begin
  if tg_op = 'INSERT' then
    v_phone_changed := true;
  else
    v_phone_changed := new.phone is distinct from old.phone;
  end if;

  if v_phone_changed then
    v_phone := public.normalize_brazil_phone(new.phone);
    if new.phone is not null and v_phone is null then
      raise exception 'invalid_phone' using errcode = '22023';
    end if;
    if v_phone is not null then new.phone := v_phone; end if;
  else
    v_phone := public.normalize_brazil_phone(new.phone);
  end if;

  if tg_op = 'INSERT' then
    v_should_check := new.active;
  else
    v_should_check := new.active and (v_phone_changed or (old.active = false and new.active = true));
  end if;

  if v_should_check and v_phone is not null then
    perform pg_advisory_xact_lock(hashtext(v_phone));
    if exists (
      select 1
      from public.balcao_businesses b
      where b.active = true
        and b.id <> new.id
        and public.normalize_brazil_phone(b.phone) = v_phone
    ) then
      raise exception 'phone_already_linked' using errcode = '23505';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists balcao_businesses_phone_guard on public.balcao_businesses;
create trigger balcao_businesses_phone_guard
before insert or update on public.balcao_businesses
for each row execute function public.guard_balcao_business_phone();

create or replace function public.admin_trial_phone_conflict(p_phone text, p_ignore_business uuid default null)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_phone text := public.normalize_brazil_phone(p_phone);
begin
  if v_phone is null then return false; end if;

  if exists (
    select 1 from public.balcao_businesses b
    where b.active = true
      and (p_ignore_business is null or b.id <> p_ignore_business)
      and public.normalize_brazil_phone(b.phone) = v_phone
  ) then return true; end if;

  if exists (
    select 1
    from public.balcao_profiles p
    join public.balcao_business_members m on m.user_id = p.user_id and m.active = true
    join public.balcao_businesses b on b.id = m.business_id and b.active = true
    where (p_ignore_business is null or b.id <> p_ignore_business)
      and public.normalize_brazil_phone(p.phone) = v_phone
  ) then return true; end if;

  if exists (
    select 1
    from public.wa_store_bindings w
    join public.inventory_v1_stores s on s.id = w.store_id and s.active = true
    left join public.balcao_businesses b on b.id = s.business_id
    where (p_ignore_business is null or b.id is distinct from p_ignore_business)
      and public.normalize_brazil_phone(w.wa_id) = v_phone
  ) then return true; end if;

  return false;
end;
$$;

create or replace function public.admin_create_trial_account(
  p_contact_name text,
  p_business_name text,
  p_phone text
)
returns table (business_id uuid, store_id uuid, phone text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_contact text := regexp_replace(trim(coalesce(p_contact_name, '')), '\s+', ' ', 'g');
  v_business text := regexp_replace(trim(coalesce(p_business_name, '')), '\s+', ' ', 'g');
  v_phone text := public.normalize_brazil_phone(p_phone);
  v_business_id uuid;
  v_store_id uuid;
begin
  if v_contact = '' then raise exception 'missing_contact_name' using errcode = '22023'; end if;
  if v_business = '' then raise exception 'missing_business_name' using errcode = '22023'; end if;
  if v_phone is null then raise exception 'invalid_phone' using errcode = '22023'; end if;

  perform pg_advisory_xact_lock(hashtext(v_phone));
  if public.admin_trial_phone_conflict(v_phone, null) then
    raise exception 'phone_already_linked' using errcode = '23505';
  end if;

  insert into public.balcao_businesses (
    display_name, phone, pix_key, created_by, active,
    account_origin, primary_contact_name
  ) values (
    left(v_business, 160), v_phone, null, null, true,
    'admin_trial', left(v_contact, 120)
  ) returning id into v_business_id;

  insert into public.inventory_v1_stores (
    installation_id, display_name, business_id, active
  ) values (
    gen_random_uuid(), left(v_business, 160), v_business_id, true
  ) returning id into v_store_id;

  insert into public.wa_store_bindings (wa_id, store_id, updated_at)
  values (v_phone, v_store_id, now());

  return query select v_business_id, v_store_id, v_phone;
end;
$$;

create or replace function public.admin_update_trial_account(
  p_business_id uuid,
  p_contact_name text,
  p_business_name text,
  p_phone text
)
returns table (business_id uuid, store_id uuid, phone text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_contact text := regexp_replace(trim(coalesce(p_contact_name, '')), '\s+', ' ', 'g');
  v_business text := regexp_replace(trim(coalesce(p_business_name, '')), '\s+', ' ', 'g');
  v_phone text := public.normalize_brazil_phone(p_phone);
  v_old_phone text;
  v_store_id uuid;
begin
  if v_contact = '' then raise exception 'missing_contact_name' using errcode = '22023'; end if;
  if v_business = '' then raise exception 'missing_business_name' using errcode = '22023'; end if;
  if v_phone is null then raise exception 'invalid_phone' using errcode = '22023'; end if;

  select public.normalize_brazil_phone(b.phone)
    into v_old_phone
  from public.balcao_businesses b
  where b.id = p_business_id and b.account_origin = 'admin_trial'
  for update;
  if not found then raise exception 'trial_not_found' using errcode = 'P0002'; end if;

  select s.id into v_store_id
  from public.inventory_v1_stores s
  where s.business_id = p_business_id
  order by s.created_at asc
  limit 1
  for update;
  if v_store_id is null then raise exception 'trial_store_not_found' using errcode = 'P0002'; end if;

  perform pg_advisory_xact_lock(hashtext(v_phone));
  if public.admin_trial_phone_conflict(v_phone, p_business_id) then
    raise exception 'phone_already_linked' using errcode = '23505';
  end if;

  update public.balcao_businesses
  set display_name = left(v_business, 160),
      primary_contact_name = left(v_contact, 120),
      phone = v_phone,
      updated_at = now()
  where id = p_business_id;

  update public.inventory_v1_stores
  set display_name = left(v_business, 160), updated_at = now()
  where id = v_store_id;

  if v_old_phone is distinct from v_phone then
    delete from public.whatsapp_sessions where wa_id = v_old_phone;
    delete from public.wa_store_bindings where store_id = v_store_id;
    insert into public.wa_store_bindings (wa_id, store_id, updated_at)
    values (v_phone, v_store_id, now());
  end if;

  return query select p_business_id, v_store_id, v_phone;
end;
$$;

create or replace function public.admin_deactivate_trial_account(p_business_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_store_ids uuid[];
begin
  if not exists (
    select 1 from public.balcao_businesses
    where id = p_business_id and account_origin = 'admin_trial'
    for update
  ) then
    raise exception 'trial_not_found' using errcode = 'P0002';
  end if;

  select coalesce(array_agg(id), array[]::uuid[]) into v_store_ids
  from public.inventory_v1_stores where business_id = p_business_id;

  update public.balcao_businesses
  set active = false, updated_at = now()
  where id = p_business_id;

  update public.inventory_v1_stores
  set active = false, updated_at = now()
  where business_id = p_business_id;

  delete from public.whatsapp_sessions where store_id = any(v_store_ids);
  delete from public.wa_store_bindings where store_id = any(v_store_ids);
  return true;
end;
$$;

revoke all on function public.normalize_brazil_phone(text) from public;
grant execute on function public.normalize_brazil_phone(text) to service_role;

revoke all on function public.admin_trial_phone_conflict(text, uuid) from public, anon, authenticated;
grant execute on function public.admin_trial_phone_conflict(text, uuid) to service_role;

revoke all on function public.admin_create_trial_account(text, text, text) from public, anon, authenticated;
grant execute on function public.admin_create_trial_account(text, text, text) to service_role;

revoke all on function public.admin_update_trial_account(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.admin_update_trial_account(uuid, text, text, text) to service_role;

revoke all on function public.admin_deactivate_trial_account(uuid) from public, anon, authenticated;
grant execute on function public.admin_deactivate_trial_account(uuid) to service_role;
