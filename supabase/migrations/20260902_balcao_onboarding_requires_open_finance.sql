-- New BALCÃO onboardings create the business/store first, then finish only
-- after a Malvo Open Finance Item exists. Existing completed profiles are
-- preserved because the API calls the pending helper only for users that were
-- not completed before balcao_complete_onboarding ran.

create or replace function public.balcao_require_open_finance_onboarding()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'BALCAO_NOT_AUTHENTICATED'; end if;

  update public.balcao_profiles
  set onboarding_completed = false,
      updated_at = now()
  where user_id = v_user_id;
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
begin
  if v_user_id is null then raise exception 'BALCAO_NOT_AUTHENTICATED'; end if;

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
    from public.balcao_finance_connections c
    where c.business_id = v_business_id
      and c.store_id = p_store_id
      and c.provider = 'malvo'
      and c.status in ('pending', 'active', 'updating')
  ) then
    raise exception 'BALCAO_OPEN_FINANCE_REQUIRED';
  end if;

  update public.balcao_profiles
  set onboarding_completed = true,
      updated_at = now()
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
