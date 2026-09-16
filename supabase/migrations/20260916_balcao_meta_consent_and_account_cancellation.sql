-- Meta/WhatsApp compliance and simple BALCÃO account cancellation.
-- Consent is append-only for auditability. Account cancellation preserves business history,
-- but deactivates operational access and future billing.

create table if not exists public.balcao_whatsapp_consents (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.balcao_businesses(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  phone text not null,
  status text not null default 'granted' check (status in ('granted', 'revoked')),
  consent_text text not null,
  policy_version text not null,
  source text not null,
  consented_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists balcao_whatsapp_consents_user_idx
  on public.balcao_whatsapp_consents(user_id, consented_at desc);
create index if not exists balcao_whatsapp_consents_business_idx
  on public.balcao_whatsapp_consents(business_id, consented_at desc);

alter table public.balcao_whatsapp_consents enable row level security;
revoke all on public.balcao_whatsapp_consents from public, anon, authenticated;
grant select on public.balcao_whatsapp_consents to authenticated;

drop policy if exists balcao_whatsapp_consents_self_read on public.balcao_whatsapp_consents;
create policy balcao_whatsapp_consents_self_read
  on public.balcao_whatsapp_consents for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.balcao_record_whatsapp_consent(
  p_business_id uuid,
  p_phone text,
  p_policy_version text,
  p_consent_text text,
  p_source text default 'onboarding'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_id uuid;
begin
  if v_user_id is null then
    raise exception 'BALCAO_NOT_AUTHENTICATED';
  end if;

  if not exists (
    select 1
    from public.balcao_business_members m
    where m.business_id = p_business_id
      and m.user_id = v_user_id
      and m.active
  ) then
    raise exception 'BALCAO_WHATSAPP_CONSENT_FORBIDDEN';
  end if;

  if nullif(trim(p_phone), '') is null
     or nullif(trim(p_policy_version), '') is null
     or nullif(trim(p_consent_text), '') is null
     or nullif(trim(p_source), '') is null then
    raise exception 'BALCAO_WHATSAPP_CONSENT_INVALID';
  end if;

  insert into public.balcao_whatsapp_consents (
    business_id, user_id, phone, status, consent_text, policy_version, source, consented_at
  ) values (
    p_business_id, v_user_id, trim(p_phone), 'granted', trim(p_consent_text),
    trim(p_policy_version), trim(p_source), now()
  ) returning id into v_id;

  insert into public.balcao_audit_events (
    business_id, actor_user_id, action, entity_type, entity_id, metadata, created_at
  ) values (
    p_business_id, v_user_id, 'whatsapp.consent_granted', 'whatsapp_consent', v_id::text,
    jsonb_build_object('phone', trim(p_phone), 'policyVersion', trim(p_policy_version), 'source', trim(p_source)), now()
  );

  return v_id;
end;
$$;

revoke all on function public.balcao_record_whatsapp_consent(uuid, text, text, text, text) from public, anon;
grant execute on function public.balcao_record_whatsapp_consent(uuid, text, text, text, text) to authenticated;

create table if not exists public.balcao_account_cancellations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.balcao_businesses(id) on delete set null,
  requested_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  source text not null default 'settings'
);

create index if not exists balcao_account_cancellations_business_idx
  on public.balcao_account_cancellations(business_id, requested_at desc);

alter table public.balcao_account_cancellations enable row level security;
revoke all on public.balcao_account_cancellations from public, anon, authenticated;

grant select on public.balcao_account_cancellations to authenticated;
drop policy if exists balcao_account_cancellations_owner_read on public.balcao_account_cancellations;
create policy balcao_account_cancellations_owner_read
  on public.balcao_account_cancellations for select to authenticated
  using (requested_by = (select auth.uid()));

create or replace function public.balcao_cancel_business_account(p_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
begin
  if v_user_id is null then
    raise exception 'BALCAO_NOT_AUTHENTICATED';
  end if;

  select m.role into v_role
  from public.balcao_business_members m
  where m.business_id = p_business_id
    and m.user_id = v_user_id
    and m.active
  limit 1;

  if v_role is distinct from 'owner' then
    raise exception 'BALCAO_ACCOUNT_CANCEL_FORBIDDEN';
  end if;

  insert into public.balcao_account_cancellations (business_id, requested_by, requested_at, source)
  values (p_business_id, v_user_id, now(), 'settings');

  insert into public.balcao_audit_events (
    business_id, actor_user_id, action, entity_type, entity_id, metadata, created_at
  ) values (
    p_business_id, v_user_id, 'account.cancelled', 'business', p_business_id::text,
    jsonb_build_object('source', 'settings'), now()
  );

  update public.balcao_billing_accounts
  set status = 'cancelled', updated_at = now()
  where business_id = p_business_id;

  update public.balcao_staff_sessions ss
  set revoked_at = coalesce(ss.revoked_at, now())
  where ss.staff_id in (
    select sp.id from public.balcao_staff_profiles sp where sp.business_id = p_business_id
  );

  update public.balcao_terminal_invites ti
  set revoked_at = coalesce(ti.revoked_at, now())
  where ti.store_id in (
    select s.id from public.inventory_v1_stores s where s.business_id = p_business_id
  );

  update public.balcao_staff_store_access sa
  set active = false, updated_at = now()
  where sa.staff_id in (
    select sp.id from public.balcao_staff_profiles sp where sp.business_id = p_business_id
  );

  update public.balcao_staff_profiles
  set active = false, updated_at = now()
  where business_id = p_business_id;

  update public.balcao_terminals t
  set active = false, updated_at = now()
  where t.store_id in (
    select s.id from public.inventory_v1_stores s where s.business_id = p_business_id
  );

  update public.inventory_v1_stores
  set active = false
  where business_id = p_business_id;

  update public.balcao_businesses
  set active = false, updated_at = now()
  where id = p_business_id;

  update public.balcao_business_members
  set active = false, updated_at = now()
  where business_id = p_business_id;

  update public.balcao_profiles
  set onboarding_completed = false, updated_at = now()
  where user_id = v_user_id;

  return jsonb_build_object('ok', true, 'businessId', p_business_id, 'cancelledAt', now());
end;
$$;

revoke all on function public.balcao_cancel_business_account(uuid) from public, anon;
grant execute on function public.balcao_cancel_business_account(uuid) to authenticated;
