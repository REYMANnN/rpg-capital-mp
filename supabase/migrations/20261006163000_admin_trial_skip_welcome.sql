-- Admin trials are pre-authorized to talk to Rafa: skip the regular welcome/onboarding gate.
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
    account_origin, primary_contact_name, rafa_welcomed_at
  ) values (
    left(v_business, 160), v_phone, null, null, true,
    'admin_trial', left(v_contact, 120), now()
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

revoke all on function public.admin_create_trial_account(text, text, text) from public, anon, authenticated;
grant execute on function public.admin_create_trial_account(text, text, text) to service_role;
