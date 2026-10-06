-- A pending invite for the same WhatsApp can later create a second identity.
-- Treat it as a conflict until the invite is redeemed/revoked/cancelled.
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

  if exists (
    select 1 from public.balcao_coupons c
    where c.status = 'available'
      and c.redeemed_at is null
      and c.revoked_at is null
      and public.normalize_brazil_phone(c.invitee_phone) = v_phone
  ) then return true; end if;

  return false;
end;
$$;

revoke all on function public.admin_trial_phone_conflict(text, uuid) from public, anon, authenticated;
grant execute on function public.admin_trial_phone_conflict(text, uuid) to service_role;
