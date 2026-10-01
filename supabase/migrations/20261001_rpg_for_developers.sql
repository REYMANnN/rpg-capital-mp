-- RPG for Developers v1 — delegated access for third-party apps.
-- Developer identity is separate from BALCAO business identity even when both use the same auth.users record.

create table if not exists public.rpg_developer_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.rpg_developer_profiles enable row level security;

create policy "developer profile self select"
on public.rpg_developer_profiles for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "developer profile self update"
on public.rpg_developer_profiles for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create table if not exists public.rpg_developer_apps (
  id uuid primary key default gen_random_uuid(),
  developer_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 100),
  website_url text,
  redirect_uris text[] not null default '{}',
  status text not null default 'active' check (status in ('active','disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists rpg_developer_apps_owner_idx on public.rpg_developer_apps(developer_user_id);
alter table public.rpg_developer_apps enable row level security;

create policy "developer owns apps"
on public.rpg_developer_apps for select
to authenticated
using ((select auth.uid()) = developer_user_id);

create table if not exists public.rpg_developer_secrets (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.rpg_developer_apps(id) on delete cascade,
  name text not null default 'Default',
  prefix text not null unique,
  secret_hash text not null,
  scopes text[] not null default '{}',
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index if not exists rpg_developer_secrets_app_idx on public.rpg_developer_secrets(app_id);
alter table public.rpg_developer_secrets enable row level security;

create table if not exists public.rpg_developer_connection_requests (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.rpg_developer_apps(id) on delete cascade,
  token_hash text not null unique,
  requested_scopes text[] not null default '{}',
  external_reference text,
  status text not null default 'pending' check (status in ('pending','consumed','expired','revoked')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  consumed_at timestamptz
);
create index if not exists rpg_developer_connection_requests_app_idx on public.rpg_developer_connection_requests(app_id);
alter table public.rpg_developer_connection_requests enable row level security;

create table if not exists public.rpg_developer_grants (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.rpg_developer_apps(id) on delete cascade,
  business_id uuid not null references public.balcao_businesses(id) on delete cascade,
  store_id uuid not null references public.inventory_v1_stores(id) on delete cascade,
  authorized_by_user_id uuid not null references auth.users(id) on delete cascade,
  scopes text[] not null default '{}',
  status text not null default 'active' check (status in ('active','revoked')),
  external_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index if not exists rpg_developer_grants_app_idx on public.rpg_developer_grants(app_id);
create index if not exists rpg_developer_grants_business_idx on public.rpg_developer_grants(business_id);
alter table public.rpg_developer_grants enable row level security;

create table if not exists public.rpg_developer_api_rate_limits (
  secret_id uuid not null references public.rpg_developer_secrets(id) on delete cascade,
  grant_id uuid not null references public.rpg_developer_grants(id) on delete cascade,
  window_start timestamptz not null,
  request_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key(secret_id, grant_id, window_start)
);
alter table public.rpg_developer_api_rate_limits enable row level security;

create or replace function public.rpg_developer_api_authenticate(
  p_prefix text,
  p_secret_hash text,
  p_connection_id uuid,
  p_required_scope text,
  p_limit integer default 120
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_secret public.rpg_developer_secrets%rowtype;
  v_app public.rpg_developer_apps%rowtype;
  v_grant public.rpg_developer_grants%rowtype;
  v_store public.inventory_v1_stores%rowtype;
  v_window timestamptz := date_trunc('minute', now());
  v_count integer;
begin
  select * into v_secret
  from public.rpg_developer_secrets
  where prefix = p_prefix
    and secret_hash = p_secret_hash
    and revoked_at is null
  limit 1;

  if v_secret.id is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_api_key');
  end if;

  select * into v_app
  from public.rpg_developer_apps
  where id = v_secret.app_id and status = 'active';

  if v_app.id is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_api_key');
  end if;

  select * into v_grant
  from public.rpg_developer_grants
  where id = p_connection_id
    and app_id = v_app.id
    and status = 'active';

  if v_grant.id is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_connection');
  end if;

  if not (p_required_scope = any(v_secret.scopes))
     or not (p_required_scope = any(v_grant.scopes)) then
    return jsonb_build_object('ok', false, 'code', 'missing_scope');
  end if;

  select * into v_store
  from public.inventory_v1_stores
  where id = v_grant.store_id
    and business_id = v_grant.business_id
    and active;

  if v_store.id is null then
    return jsonb_build_object('ok', false, 'code', 'store_forbidden');
  end if;

  insert into public.rpg_developer_api_rate_limits(secret_id, grant_id, window_start, request_count, updated_at)
  values (v_secret.id, v_grant.id, v_window, 1, now())
  on conflict (secret_id, grant_id, window_start)
  do update set request_count = public.rpg_developer_api_rate_limits.request_count + 1, updated_at = now()
  returning request_count into v_count;

  if v_count > greatest(1, least(coalesce(p_limit, 120), 1000)) then
    return jsonb_build_object('ok', false, 'code', 'rate_limited', 'retryAfter', 60);
  end if;

  update public.rpg_developer_secrets
  set last_used_at = now()
  where id = v_secret.id;

  return jsonb_build_object(
    'ok', true,
    'credentialId', v_secret.id,
    'connectionId', v_grant.id,
    'businessId', v_grant.business_id,
    'storeId', v_grant.store_id,
    'installationId', v_store.installation_id,
    'scopes', to_jsonb(v_grant.scopes),
    'prefix', v_secret.prefix
  );
end;
$$;

revoke all on function public.rpg_developer_api_authenticate(text,text,uuid,text,integer) from public;
grant execute on function public.rpg_developer_api_authenticate(text,text,uuid,text,integer) to anon,authenticated,service_role;
