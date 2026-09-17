-- Shared WhatsApp identity, onboarding state and append-only consent audit for BALCÃO.

create table if not exists public.balcao_whatsapp_consents (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.balcao_businesses(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  phone text not null,
  event_type text not null check (event_type in ('granted', 'revoked')),
  consent_text text not null,
  policy_version text not null,
  source text not null,
  meta_message_id text,
  meta_action_id text,
  occurred_at timestamptz not null default now()
);

create unique index if not exists balcao_whatsapp_consents_meta_message_unique
  on public.balcao_whatsapp_consents(meta_message_id)
  where meta_message_id is not null;
create index if not exists balcao_whatsapp_consents_business_phone_idx
  on public.balcao_whatsapp_consents(business_id, phone, occurred_at desc);
create index if not exists balcao_whatsapp_consents_user_idx
  on public.balcao_whatsapp_consents(user_id, occurred_at desc);

alter table public.balcao_whatsapp_consents enable row level security;
revoke all on public.balcao_whatsapp_consents from public, anon, authenticated;
grant select on public.balcao_whatsapp_consents to authenticated;

drop policy if exists balcao_whatsapp_consents_member_read on public.balcao_whatsapp_consents;
create policy balcao_whatsapp_consents_member_read
  on public.balcao_whatsapp_consents for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.balcao_business_members m
      where m.business_id = balcao_whatsapp_consents.business_id
        and m.user_id = (select auth.uid())
        and m.active
    )
  );

create table if not exists public.balcao_whatsapp_sessions (
  phone text primary key,
  state text not null default 'welcome' check (state in (
    'welcome', 'awaiting_store_name', 'awaiting_consent', 'active', 'link_pending'
  )),
  business_id uuid references public.balcao_businesses(id) on delete set null,
  store_id uuid references public.inventory_v1_stores(id) on delete set null,
  pending_store_name text,
  last_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.balcao_whatsapp_sessions enable row level security;
revoke all on public.balcao_whatsapp_sessions from public, anon, authenticated;

create table if not exists public.balcao_whatsapp_link_codes (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  business_id uuid references public.balcao_businesses(id) on delete cascade,
  requested_by_user_id uuid references auth.users(id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists balcao_whatsapp_link_codes_business_idx
  on public.balcao_whatsapp_link_codes(business_id, created_at desc);
create index if not exists balcao_whatsapp_link_codes_phone_idx
  on public.balcao_whatsapp_link_codes(phone, created_at desc);

alter table public.balcao_whatsapp_link_codes enable row level security;
revoke all on public.balcao_whatsapp_link_codes from public, anon, authenticated;
grant select on public.balcao_whatsapp_link_codes to authenticated;

drop policy if exists balcao_whatsapp_link_codes_owner_read on public.balcao_whatsapp_link_codes;
create policy balcao_whatsapp_link_codes_owner_read
  on public.balcao_whatsapp_link_codes for select to authenticated
  using (
    exists (
      select 1 from public.balcao_business_members m
      where m.business_id = balcao_whatsapp_link_codes.business_id
        and m.user_id = (select auth.uid())
        and m.role in ('owner', 'admin')
        and m.active
    )
  );

create or replace function public.balcao_record_whatsapp_consent(
  p_business_id uuid,
  p_phone text,
  p_policy_version text,
  p_consent_text text,
  p_source text default 'onboarding_site'
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
    select 1 from public.balcao_business_members m
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
    business_id, user_id, phone, event_type, consent_text, policy_version, source, occurred_at
  ) values (
    p_business_id, v_user_id, regexp_replace(p_phone, '[^0-9]', '', 'g'), 'granted',
    trim(p_consent_text), trim(p_policy_version), trim(p_source), now()
  ) returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.balcao_record_whatsapp_consent(uuid, text, text, text, text) from public, anon;
grant execute on function public.balcao_record_whatsapp_consent(uuid, text, text, text, text) to authenticated;

-- Service-side helper used only by the OIDC-authenticated Supabase Edge Function.
create or replace function public.balcao_whatsapp_create_business(
  p_phone text,
  p_store_name text,
  p_message_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_name text := btrim(coalesce(p_store_name, ''));
  v_business_id uuid;
  v_store_id uuid;
  v_installation_id uuid := gen_random_uuid();
  v_existing_session public.balcao_whatsapp_sessions%rowtype;
begin
  if length(v_phone) < 12 or length(v_phone) > 13 or length(v_name) < 2 then
    raise exception 'BALCAO_WHATSAPP_CREATE_INVALID';
  end if;

  select * into v_existing_session
  from public.balcao_whatsapp_sessions
  where phone = v_phone
  for update;

  if v_existing_session.business_id is not null then
    return jsonb_build_object(
      'ok', true,
      'businessId', v_existing_session.business_id,
      'storeId', v_existing_session.store_id,
      'duplicate', true
    );
  end if;

  insert into public.balcao_businesses (
    display_name, phone, active, created_at, updated_at
  ) values (
    v_name, v_phone, true, now(), now()
  ) returning id into v_business_id;

  insert into public.inventory_v1_stores (
    installation_id, display_name, system_tag, business_id, business_type, active, created_at, updated_at
  ) values (
    v_installation_id, v_name, 'inventory', v_business_id, 'outro', true, now(), now()
  ) returning id into v_store_id;

  insert into public.balcao_whatsapp_sessions (
    phone, state, business_id, store_id, pending_store_name, last_message_id, created_at, updated_at
  ) values (
    v_phone, 'awaiting_consent', v_business_id, v_store_id, v_name, p_message_id, now(), now()
  ) on conflict (phone) do update
  set state = 'awaiting_consent',
      business_id = excluded.business_id,
      store_id = excluded.store_id,
      pending_store_name = excluded.pending_store_name,
      last_message_id = excluded.last_message_id,
      updated_at = now();

  return jsonb_build_object('ok', true, 'businessId', v_business_id, 'storeId', v_store_id, 'duplicate', false);
end;
$$;

revoke all on function public.balcao_whatsapp_create_business(text, text, text) from public, anon, authenticated;
grant execute on function public.balcao_whatsapp_create_business(text, text, text) to service_role;

create or replace function public.balcao_whatsapp_record_event(
  p_phone text,
  p_event_type text,
  p_policy_version text,
  p_consent_text text,
  p_source text,
  p_message_id text,
  p_action_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_session public.balcao_whatsapp_sessions%rowtype;
  v_id uuid;
begin
  if p_event_type not in ('granted', 'revoked') then
    raise exception 'BALCAO_WHATSAPP_EVENT_INVALID';
  end if;

  select * into v_session
  from public.balcao_whatsapp_sessions
  where phone = v_phone
  for update;

  insert into public.balcao_whatsapp_consents (
    business_id, phone, event_type, consent_text, policy_version, source,
    meta_message_id, meta_action_id, occurred_at
  ) values (
    v_session.business_id, v_phone, p_event_type, p_consent_text, p_policy_version, p_source,
    nullif(p_message_id, ''), nullif(p_action_id, ''), now()
  ) on conflict (meta_message_id) where meta_message_id is not null do nothing
  returning id into v_id;

  update public.balcao_whatsapp_sessions
  set state = case when p_event_type = 'granted' then 'active' else state end,
      last_message_id = p_message_id,
      updated_at = now()
  where phone = v_phone;

  return jsonb_build_object('ok', true, 'id', v_id, 'businessId', v_session.business_id);
end;
$$;

revoke all on function public.balcao_whatsapp_record_event(text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.balcao_whatsapp_record_event(text, text, text, text, text, text, text) to service_role;
