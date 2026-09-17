-- BALCÃO dual onboarding: website + WhatsApp Cloud API.
-- WhatsApp identity is the Meta wa_id. Consent history is append-only.

create table if not exists public.balcao_whatsapp_contacts (
  wa_id text primary key check (wa_id ~ '^[0-9]{10,15}$'),
  phone_e164 text not null check (phone_e164 ~ '^\+[0-9]{10,15}$'),
  business_id uuid references public.balcao_businesses(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  state text not null default 'awaiting_entry_choice'
    check (state in ('awaiting_entry_choice','awaiting_business_name','awaiting_consent','awaiting_link','active')),
  pending_business_name text,
  consent_current boolean not null default false,
  consent_version text,
  consent_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists balcao_whatsapp_contacts_business_unique
  on public.balcao_whatsapp_contacts(business_id)
  where business_id is not null;

create index if not exists balcao_whatsapp_contacts_user_idx
  on public.balcao_whatsapp_contacts(user_id)
  where user_id is not null;

create table if not exists public.balcao_whatsapp_consents (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.balcao_businesses(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  wa_id text not null check (wa_id ~ '^[0-9]{10,15}$'),
  phone_e164 text not null check (phone_e164 ~ '^\+[0-9]{10,15}$'),
  status text not null check (status in ('granted','revoked')),
  consent_text text not null,
  policy_version text not null,
  source text not null check (source in ('onboarding_site','onboarding_whatsapp','whatsapp_reoptin','whatsapp_stop')),
  source_message_id text,
  event_at timestamptz not null default now()
);

create index if not exists balcao_whatsapp_consents_business_idx
  on public.balcao_whatsapp_consents(business_id, event_at desc);
create index if not exists balcao_whatsapp_consents_wa_idx
  on public.balcao_whatsapp_consents(wa_id, event_at desc);
create unique index if not exists balcao_whatsapp_consents_message_unique
  on public.balcao_whatsapp_consents(source_message_id)
  where source_message_id is not null;

create table if not exists public.balcao_whatsapp_link_requests (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  wa_id text not null references public.balcao_whatsapp_contacts(wa_id) on delete cascade,
  business_id uuid references public.balcao_businesses(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create index if not exists balcao_whatsapp_link_requests_wa_idx
  on public.balcao_whatsapp_link_requests(wa_id, created_at desc);

create table if not exists public.balcao_whatsapp_webhook_events (
  message_id text primary key,
  wa_id text not null check (wa_id ~ '^[0-9]{10,15}$'),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text
);

alter table public.balcao_whatsapp_contacts enable row level security;
alter table public.balcao_whatsapp_consents enable row level security;
alter table public.balcao_whatsapp_link_requests enable row level security;
alter table public.balcao_whatsapp_webhook_events enable row level security;

revoke all on public.balcao_whatsapp_contacts from public, anon, authenticated;
revoke all on public.balcao_whatsapp_consents from public, anon, authenticated;
revoke all on public.balcao_whatsapp_link_requests from public, anon, authenticated;
revoke all on public.balcao_whatsapp_webhook_events from public, anon, authenticated;

grant select on public.balcao_whatsapp_contacts to authenticated;
grant select on public.balcao_whatsapp_consents to authenticated;
grant all on public.balcao_whatsapp_contacts to service_role;
grant all on public.balcao_whatsapp_consents to service_role;
grant all on public.balcao_whatsapp_link_requests to service_role;
grant all on public.balcao_whatsapp_webhook_events to service_role;

drop policy if exists balcao_whatsapp_contacts_member_read on public.balcao_whatsapp_contacts;
create policy balcao_whatsapp_contacts_member_read
  on public.balcao_whatsapp_contacts for select to authenticated
  using (
    business_id is not null and exists (
      select 1 from public.balcao_business_members m
      where m.business_id = balcao_whatsapp_contacts.business_id
        and m.user_id = (select auth.uid())
        and m.active
    )
  );

drop policy if exists balcao_whatsapp_consents_member_read on public.balcao_whatsapp_consents;
create policy balcao_whatsapp_consents_member_read
  on public.balcao_whatsapp_consents for select to authenticated
  using (
    business_id is not null and exists (
      select 1 from public.balcao_business_members m
      where m.business_id = balcao_whatsapp_consents.business_id
        and m.user_id = (select auth.uid())
        and m.active
    )
  );

-- Website onboarding: only an authenticated member of the business may bind the declared phone
-- and record proactive-message consent.
create or replace function public.balcao_record_whatsapp_consent(
  p_business_id uuid,
  p_phone_e164 text,
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
  v_wa_id text := regexp_replace(coalesce(p_phone_e164, ''), '[^0-9]', '', 'g');
  v_phone text;
  v_id uuid;
  v_existing_business uuid;
begin
  if v_user_id is null then raise exception 'BALCAO_NOT_AUTHENTICATED'; end if;
  if p_source <> 'onboarding_site' then raise exception 'BALCAO_WHATSAPP_CONSENT_SOURCE_INVALID'; end if;
  if v_wa_id !~ '^55[0-9]{10,11}$' then raise exception 'BALCAO_WHATSAPP_PHONE_INVALID'; end if;
  if coalesce(btrim(p_policy_version), '') = '' or coalesce(btrim(p_consent_text), '') = '' then
    raise exception 'BALCAO_WHATSAPP_CONSENT_INVALID';
  end if;
  if not exists (
    select 1 from public.balcao_business_members m
    where m.business_id = p_business_id and m.user_id = v_user_id and m.active
  ) then
    raise exception 'BALCAO_WHATSAPP_CONSENT_FORBIDDEN';
  end if;

  v_phone := '+' || v_wa_id;
  select c.business_id into v_existing_business
  from public.balcao_whatsapp_contacts c
  where c.wa_id = v_wa_id
  for update;

  if v_existing_business is not null and v_existing_business <> p_business_id then
    raise exception 'BALCAO_WHATSAPP_ALREADY_LINKED';
  end if;

  insert into public.balcao_whatsapp_contacts (
    wa_id, phone_e164, business_id, user_id, state, consent_current,
    consent_version, consent_updated_at, created_at, updated_at
  ) values (
    v_wa_id, v_phone, p_business_id, v_user_id, 'active', true,
    btrim(p_policy_version), now(), now(), now()
  )
  on conflict (wa_id) do update
  set phone_e164 = excluded.phone_e164,
      business_id = excluded.business_id,
      user_id = excluded.user_id,
      state = 'active',
      consent_current = true,
      consent_version = excluded.consent_version,
      consent_updated_at = excluded.consent_updated_at,
      updated_at = now();

  insert into public.balcao_whatsapp_consents (
    business_id, user_id, wa_id, phone_e164, status, consent_text, policy_version, source, event_at
  ) values (
    p_business_id, v_user_id, v_wa_id, v_phone, 'granted', btrim(p_consent_text),
    btrim(p_policy_version), p_source, now()
  ) returning id into v_id;

  insert into public.balcao_audit_events (
    business_id, actor_user_id, action, entity_type, entity_id, metadata, created_at
  ) values (
    p_business_id, v_user_id, 'whatsapp.consent_granted', 'whatsapp_consent', v_id::text,
    jsonb_build_object('waId', v_wa_id, 'source', p_source, 'policyVersion', btrim(p_policy_version)), now()
  );

  return v_id;
end;
$$;

revoke all on function public.balcao_record_whatsapp_consent(uuid,text,text,text,text) from public, anon;
grant execute on function public.balcao_record_whatsapp_consent(uuid,text,text,text,text) to authenticated;

-- Server-only WhatsApp onboarding. The service role is the only caller.
create or replace function public.balcao_whatsapp_create_business(
  p_wa_id text,
  p_business_name text,
  p_grant_consent boolean,
  p_policy_version text,
  p_consent_text text,
  p_source_message_id text default null
)
returns table (business_id uuid, store_id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_wa_id text := regexp_replace(coalesce(p_wa_id, ''), '[^0-9]', '', 'g');
  v_phone text;
  v_business_id uuid;
  v_store_id uuid;
  v_consent_id uuid;
  v_now timestamptz := now();
begin
  if v_wa_id !~ '^55[0-9]{10,11}$' then raise exception 'BALCAO_WHATSAPP_PHONE_INVALID'; end if;
  if coalesce(btrim(p_business_name), '') = '' then raise exception 'BALCAO_WHATSAPP_BUSINESS_NAME_REQUIRED'; end if;
  v_phone := '+' || v_wa_id;

  insert into public.balcao_whatsapp_contacts (wa_id, phone_e164, state, created_at, updated_at)
  values (v_wa_id, v_phone, 'awaiting_consent', v_now, v_now)
  on conflict (wa_id) do nothing;

  select c.business_id into v_business_id
  from public.balcao_whatsapp_contacts c
  where c.wa_id = v_wa_id
  for update;

  if v_business_id is not null then
    select s.id into v_store_id
    from public.inventory_v1_stores s
    where s.business_id = v_business_id and s.active
    order by s.created_at asc limit 1;
    return query select v_business_id, v_store_id;
    return;
  end if;

  insert into public.balcao_businesses (
    display_name, tax_id, phone, pix_key, created_by, active, created_at, updated_at
  ) values (
    btrim(p_business_name), null, v_phone, null, null, true, v_now, v_now
  ) returning id into v_business_id;

  insert into public.inventory_v1_stores (
    installation_id, display_name, system_tag, business_id, business_type,
    active, created_at, updated_at
  ) values (
    gen_random_uuid(), btrim(p_business_name), 'inventory', v_business_id, 'outro',
    true, v_now, v_now
  ) returning id into v_store_id;

  update public.balcao_whatsapp_contacts
  set business_id = v_business_id,
      state = 'active',
      pending_business_name = null,
      consent_current = coalesce(p_grant_consent, false),
      consent_version = case when p_grant_consent then btrim(p_policy_version) else null end,
      consent_updated_at = case when p_grant_consent then v_now else null end,
      updated_at = v_now
  where wa_id = v_wa_id;

  if p_grant_consent then
    insert into public.balcao_whatsapp_consents (
      business_id, wa_id, phone_e164, status, consent_text, policy_version,
      source, source_message_id, event_at
    ) values (
      v_business_id, v_wa_id, v_phone, 'granted', btrim(p_consent_text), btrim(p_policy_version),
      'onboarding_whatsapp', nullif(btrim(p_source_message_id), ''), v_now
    ) on conflict (source_message_id) where source_message_id is not null do nothing
    returning id into v_consent_id;
  end if;

  insert into public.balcao_audit_events (
    business_id, store_id, action, entity_type, entity_id, metadata, created_at
  ) values (
    v_business_id, v_store_id, 'onboarding.whatsapp_completed', 'store', v_store_id::text,
    jsonb_build_object('waId', v_wa_id, 'consent', coalesce(p_grant_consent, false)), v_now
  );

  return query select v_business_id, v_store_id;
end;
$$;

revoke all on function public.balcao_whatsapp_create_business(text,text,boolean,text,text,text) from public, anon, authenticated;
grant execute on function public.balcao_whatsapp_create_business(text,text,boolean,text,text,text) to service_role;

-- Secure website approval of an existing-account link request.
create or replace function public.balcao_whatsapp_link_business(
  p_token_hash text,
  p_business_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_wa_id text;
  v_existing_business uuid;
begin
  if v_user_id is null then raise exception 'BALCAO_NOT_AUTHENTICATED'; end if;
  select m.role into v_role
  from public.balcao_business_members m
  where m.business_id = p_business_id and m.user_id = v_user_id and m.active
  limit 1;
  if v_role is null or v_role not in ('owner','admin') then raise exception 'BALCAO_WHATSAPP_LINK_FORBIDDEN'; end if;

  select r.wa_id into v_wa_id
  from public.balcao_whatsapp_link_requests r
  where r.token_hash = p_token_hash
    and r.used_at is null
    and r.expires_at > now()
  for update;
  if v_wa_id is null then raise exception 'BALCAO_WHATSAPP_LINK_INVALID'; end if;

  select c.business_id into v_existing_business
  from public.balcao_whatsapp_contacts c where c.wa_id = v_wa_id for update;
  if v_existing_business is not null and v_existing_business <> p_business_id then
    raise exception 'BALCAO_WHATSAPP_ALREADY_LINKED';
  end if;

  update public.balcao_whatsapp_contacts
  set business_id = p_business_id,
      user_id = v_user_id,
      state = 'awaiting_consent',
      updated_at = now()
  where wa_id = v_wa_id;

  update public.balcao_whatsapp_link_requests
  set business_id = p_business_id, approved_by = v_user_id, used_at = now()
  where token_hash = p_token_hash and used_at is null;

  update public.balcao_businesses
  set phone = coalesce(phone, '+' || v_wa_id), updated_at = now()
  where id = p_business_id;

  insert into public.balcao_audit_events (
    business_id, actor_user_id, action, entity_type, entity_id, metadata, created_at
  ) values (
    p_business_id, v_user_id, 'whatsapp.identity_linked', 'whatsapp_contact', v_wa_id,
    jsonb_build_object('waId', v_wa_id, 'source', 'website_approval'), now()
  );

  return v_wa_id;
end;
$$;

revoke all on function public.balcao_whatsapp_link_business(text,uuid) from public, anon;
grant execute on function public.balcao_whatsapp_link_business(text,uuid) to authenticated;
