-- Evidence of the exact legal documents accepted before billing is configured.
-- No card data is stored here. Direct UPDATE/DELETE access is intentionally not granted.

create table if not exists public.balcao_legal_acceptances (
  id bigint generated always as identity primary key,
  business_id uuid not null references public.balcao_businesses(id) on delete cascade,
  store_id uuid not null references public.inventory_v1_stores(id) on delete cascade,
  actor_user_id uuid not null,
  term_type text not null check (term_type in ('payment', 'data', 'platform')),
  term_version text not null check (char_length(term_version) between 3 and 80),
  document_path text not null,
  accepted_at timestamptz not null default now(),
  ip_address text not null default '',
  user_agent text not null default '',
  source text not null default 'onboarding_billing' check (source = 'onboarding_billing'),
  unique (business_id, store_id, actor_user_id, term_type, term_version)
);

create index if not exists balcao_legal_acceptances_business_time_idx
  on public.balcao_legal_acceptances (business_id, accepted_at desc);

alter table public.balcao_legal_acceptances enable row level security;
revoke all on public.balcao_legal_acceptances from public, anon, authenticated;

create or replace function public.balcao_record_legal_acceptances(
  p_store_id uuid,
  p_payment_version text,
  p_data_version text,
  p_platform_version text,
  p_ip_address text,
  p_user_agent text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_business_id uuid;
  v_role text;
  v_ip text := left(coalesce(p_ip_address, ''), 128);
  v_user_agent text := left(coalesce(p_user_agent, ''), 512);
begin
  if v_user_id is null then
    raise exception 'BALCAO_NOT_AUTHENTICATED';
  end if;

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

  if v_business_id is null or v_role not in ('owner', 'admin') then
    raise exception 'BALCAO_LEGAL_ACCEPTANCE_FORBIDDEN';
  end if;

  if nullif(trim(p_payment_version), '') is null
     or nullif(trim(p_data_version), '') is null
     or nullif(trim(p_platform_version), '') is null then
    raise exception 'BALCAO_LEGAL_VERSION_REQUIRED';
  end if;

  if char_length(p_payment_version) > 80
     or char_length(p_data_version) > 80
     or char_length(p_platform_version) > 80 then
    raise exception 'BALCAO_LEGAL_VERSION_INVALID';
  end if;

  insert into public.balcao_legal_acceptances (
    business_id, store_id, actor_user_id, term_type, term_version,
    document_path, ip_address, user_agent
  ) values
    (v_business_id, p_store_id, v_user_id, 'payment', trim(p_payment_version), '/termos/pagamento', v_ip, v_user_agent),
    (v_business_id, p_store_id, v_user_id, 'data', trim(p_data_version), '/termos/dados', v_ip, v_user_agent),
    (v_business_id, p_store_id, v_user_id, 'platform', trim(p_platform_version), '/termos/uso', v_ip, v_user_agent)
  on conflict (business_id, store_id, actor_user_id, term_type, term_version) do nothing;

  insert into public.balcao_audit_events (
    business_id, store_id, actor_user_id, action, entity_type, entity_id, metadata, created_at
  ) values (
    v_business_id,
    p_store_id,
    v_user_id,
    'legal.terms_accepted',
    'business',
    v_business_id::text,
    jsonb_build_object(
      'paymentVersion', trim(p_payment_version),
      'dataVersion', trim(p_data_version),
      'platformVersion', trim(p_platform_version)
    ),
    now()
  );

  return jsonb_build_object(
    'ok', true,
    'businessId', v_business_id,
    'paymentVersion', trim(p_payment_version),
    'dataVersion', trim(p_data_version),
    'platformVersion', trim(p_platform_version)
  );
end;
$$;

revoke all on function public.balcao_record_legal_acceptances(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.balcao_record_legal_acceptances(uuid, text, text, text, text, text) to authenticated;
