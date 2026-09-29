-- Convites, onboarding simples e cobrança manual por Pix.
-- IMPORTANTE: esta migration é entregue no repositório, mas NÃO é executada pelo código.

alter table public.balcao_coupons
  add column if not exists invitee_name text,
  add column if not exists invitee_phone text,
  add column if not exists store_name_hint text,
  add column if not exists opened_at timestamptz,
  add column if not exists revoked_at timestamptz;

create table if not exists public.rpg_pix_payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.balcao_businesses(id) on delete cascade,
  amount_cents int not null check (amount_cents > 0),
  paid_at timestamptz not null default now(),
  paid_until date not null,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists rpg_pix_payments_business_paid_idx on public.rpg_pix_payments (business_id, paid_at desc);
alter table public.rpg_pix_payments enable row level security;
revoke all on table public.rpg_pix_payments from public, anon, authenticated;
grant select, insert, update, delete on table public.rpg_pix_payments to service_role;

insert into public.rpg_admin_settings (key, value)
values ('plan_price_cents', '999')
on conflict (key) do nothing;


-- C2: onboarding por convite sem cartão.
alter table public.balcao_businesses
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists terms_version text;

alter table public.balcao_profiles drop constraint if exists balcao_profiles_referral_source_check;
alter table public.balcao_profiles
  add constraint balcao_profiles_referral_source_check
  check (referral_source in ('instagram','google','referral','ai','youtube_tiktok','other','convite'));

alter table public.balcao_onboarding_drafts drop constraint if exists balcao_onboarding_drafts_referral_source_check;
alter table public.balcao_onboarding_drafts
  add constraint balcao_onboarding_drafts_referral_source_check
  check (referral_source in ('instagram','google','referral','ai','youtube_tiktok','other','convite'));


-- C3: primeira conversa da Rafa com a nova conta.
alter table public.balcao_businesses
  add column if not exists rafa_welcomed_at timestamptz;
