create table if not exists public.rpg_interest_leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null check (char_length(name) between 2 and 120),
  business_name text not null check (char_length(business_name) between 2 and 160),
  address text not null check (char_length(address) between 5 and 240),
  phone text not null check (char_length(phone) between 8 and 32),
  email text not null check (char_length(email) between 3 and 180),
  secondary_phone text check (secondary_phone is null or char_length(secondary_phone) between 8 and 32),
  secondary_email text check (secondary_email is null or char_length(secondary_email) between 3 and 180),
  referral_source text not null check (char_length(referral_source) between 2 and 240),
  help_text text not null check (char_length(help_text) between 5 and 2000),
  source text not null default 'public_interest_page'
);

comment on table public.rpg_interest_leads is
  'Interessados em receber uma conta RPG para Balcoes durante a fase final de testes.';

alter table public.rpg_interest_leads enable row level security;

revoke all on table public.rpg_interest_leads from anon, authenticated;
grant select, insert, update, delete on table public.rpg_interest_leads to service_role;
