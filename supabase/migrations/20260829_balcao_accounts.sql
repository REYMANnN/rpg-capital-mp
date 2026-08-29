create extension if not exists pgcrypto;

create table if not exists public.balcao_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  phone text,
  tax_id text,
  pix_key text,
  referral_source text check (referral_source in ('instagram','google','referral','ai','youtube_tiktok','other')),
  referral_other text,
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.balcao_businesses (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  tax_id text,
  phone text,
  pix_key text,
  created_by uuid references auth.users(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.balcao_business_members (
  business_id uuid not null references public.balcao_businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','manager')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (business_id, user_id)
);

alter table public.inventory_v1_stores add column if not exists business_id uuid references public.balcao_businesses(id) on delete set null;
alter table public.inventory_v1_stores add column if not exists business_type text;
alter table public.inventory_v1_stores add column if not exists cep text;
alter table public.inventory_v1_stores add column if not exists street text;
alter table public.inventory_v1_stores add column if not exists address_number text;
alter table public.inventory_v1_stores add column if not exists complement text;
alter table public.inventory_v1_stores add column if not exists neighborhood text;
alter table public.inventory_v1_stores add column if not exists city text;
alter table public.inventory_v1_stores add column if not exists state text;
alter table public.inventory_v1_stores add column if not exists active boolean not null default true;

create table if not exists public.balcao_staff_profiles (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.balcao_businesses(id) on delete cascade,
  display_name text not null,
  pin_hash text not null,
  google_user_id uuid references auth.users(id) on delete set null,
  active boolean not null default true,
  failed_pin_attempts integer not null default 0 check (failed_pin_attempts >= 0),
  locked_until timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.balcao_staff_store_access (
  staff_id uuid not null references public.balcao_staff_profiles(id) on delete cascade,
  store_id uuid not null references public.inventory_v1_stores(id) on delete cascade,
  role text not null check (role in ('stock','cashier','manager','custom')),
  custom_permissions jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (staff_id, store_id)
);

create table if not exists public.balcao_terminals (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.inventory_v1_stores(id) on delete cascade,
  display_name text not null,
  credential_hash text not null,
  user_agent text,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.balcao_terminal_invites (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.inventory_v1_stores(id) on delete cascade,
  token_hash text not null unique,
  display_name text,
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.balcao_staff_sessions (
  id uuid primary key default gen_random_uuid(),
  terminal_id uuid not null references public.balcao_terminals(id) on delete cascade,
  staff_id uuid not null references public.balcao_staff_profiles(id) on delete cascade,
  session_hash text not null unique,
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.balcao_audit_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.balcao_businesses(id) on delete set null,
  store_id uuid references public.inventory_v1_stores(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_staff_id uuid references public.balcao_staff_profiles(id) on delete set null,
  terminal_id uuid references public.balcao_terminals(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists balcao_members_user_idx on public.balcao_business_members(user_id) where active;
create index if not exists inventory_v1_stores_business_idx on public.inventory_v1_stores(business_id) where business_id is not null;
create index if not exists balcao_staff_business_idx on public.balcao_staff_profiles(business_id) where active;
create index if not exists balcao_staff_store_idx on public.balcao_staff_store_access(store_id) where active;
create index if not exists balcao_terminals_store_idx on public.balcao_terminals(store_id) where active;
create index if not exists balcao_invites_store_idx on public.balcao_terminal_invites(store_id, expires_at);
create index if not exists balcao_sessions_terminal_idx on public.balcao_staff_sessions(terminal_id, expires_at) where revoked_at is null;
create index if not exists balcao_audit_business_idx on public.balcao_audit_events(business_id, created_at desc);
create index if not exists balcao_audit_store_idx on public.balcao_audit_events(store_id, created_at desc);

create or replace function public.balcao_is_business_member(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.balcao_business_members m
    where m.business_id = p_business_id
      and m.user_id = auth.uid()
      and m.active
  );
$$;

create or replace function public.balcao_business_role(p_business_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select m.role from public.balcao_business_members m
  where m.business_id = p_business_id
    and m.user_id = auth.uid()
    and m.active
  limit 1;
$$;

grant execute on function public.balcao_is_business_member(uuid) to authenticated;
grant execute on function public.balcao_business_role(uuid) to authenticated;

alter table public.balcao_profiles enable row level security;
alter table public.balcao_businesses enable row level security;
alter table public.balcao_business_members enable row level security;
alter table public.balcao_staff_profiles enable row level security;
alter table public.balcao_staff_store_access enable row level security;
alter table public.balcao_terminals enable row level security;
alter table public.balcao_terminal_invites enable row level security;
alter table public.balcao_staff_sessions enable row level security;
alter table public.balcao_audit_events enable row level security;

drop policy if exists balcao_profiles_self on public.balcao_profiles;
create policy balcao_profiles_self on public.balcao_profiles for select to authenticated using (user_id = auth.uid());

drop policy if exists balcao_businesses_member_read on public.balcao_businesses;
create policy balcao_businesses_member_read on public.balcao_businesses for select to authenticated using (public.balcao_is_business_member(id));

drop policy if exists balcao_members_member_read on public.balcao_business_members;
create policy balcao_members_member_read on public.balcao_business_members for select to authenticated using (public.balcao_is_business_member(business_id));

drop policy if exists balcao_staff_member_read on public.balcao_staff_profiles;
create policy balcao_staff_member_read on public.balcao_staff_profiles for select to authenticated using (public.balcao_is_business_member(business_id));

drop policy if exists balcao_staff_access_member_read on public.balcao_staff_store_access;
create policy balcao_staff_access_member_read on public.balcao_staff_store_access for select to authenticated using (
  exists (
    select 1 from public.balcao_staff_profiles s
    where s.id = staff_id and public.balcao_is_business_member(s.business_id)
  )
);

drop policy if exists balcao_terminals_member_read on public.balcao_terminals;
create policy balcao_terminals_member_read on public.balcao_terminals for select to authenticated using (
  exists (
    select 1 from public.inventory_v1_stores s
    where s.id = store_id and s.business_id is not null and public.balcao_is_business_member(s.business_id)
  )
);

drop policy if exists balcao_invites_member_read on public.balcao_terminal_invites;
create policy balcao_invites_member_read on public.balcao_terminal_invites for select to authenticated using (
  exists (
    select 1 from public.inventory_v1_stores s
    where s.id = store_id and s.business_id is not null and public.balcao_is_business_member(s.business_id)
  )
);

drop policy if exists balcao_audit_member_read on public.balcao_audit_events;
create policy balcao_audit_member_read on public.balcao_audit_events for select to authenticated using (
  business_id is not null and public.balcao_is_business_member(business_id)
);

revoke all on public.balcao_staff_sessions from anon, authenticated;
