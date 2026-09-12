-- BALCÃO v11.0 — public API rate limits and pricing automation controls.
create table if not exists public.balcao_api_rate_limits (
  api_key_id uuid primary key references public.balcao_api_keys(id) on delete cascade,
  window_start timestamptz not null default date_trunc('minute', now()),
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now()
);
create table if not exists public.balcao_pricing_settings (
  store_id uuid primary key references public.inventory_v1_stores(id) on delete cascade,
  business_id uuid not null references public.balcao_businesses(id) on delete cascade,
  mode text not null default 'recommend' check (mode in ('off','recommend','automatic')),
  minimum_margin_bps integer not null default 2500 check (minimum_margin_bps between 0 and 9500),
  target_margin_bps integer not null default 3000 check (target_margin_bps between 0 and 9500),
  max_change_bps integer not null default 500 check (max_change_bps between 1 and 2000),
  minimum_interval_days integer not null default 7 check (minimum_interval_days between 1 and 90),
  minimum_sales_count integer not null default 20 check (minimum_sales_count between 0 and 10000),
  updated_by_user_id uuid references auth.users(id) on delete set null,
  updated_by_staff_id uuid references public.balcao_staff_profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create table if not exists public.balcao_pricing_product_overrides (
  store_id uuid not null references public.inventory_v1_stores(id) on delete cascade,
  business_id uuid not null references public.balcao_businesses(id) on delete cascade,
  product_id text not null,
  mode text not null default 'inherit' check (mode in ('inherit','off','recommend','automatic')),
  minimum_margin_bps integer check (minimum_margin_bps is null or minimum_margin_bps between 0 and 9500),
  max_change_bps integer check (max_change_bps is null or max_change_bps between 1 and 2000),
  updated_at timestamptz not null default now(),
  primary key (store_id, product_id)
);
create table if not exists public.balcao_pricing_history (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.balcao_businesses(id) on delete cascade,
  store_id uuid not null references public.inventory_v1_stores(id) on delete cascade,
  product_id text not null,
  old_price_cents bigint not null,
  new_price_cents bigint not null,
  source text not null check (source in ('manual','recommendation','automatic','api')),
  reason jsonb not null default '[]'::jsonb,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_staff_id uuid references public.balcao_staff_profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.balcao_api_rate_limits enable row level security;
alter table public.balcao_pricing_settings enable row level security;
alter table public.balcao_pricing_product_overrides enable row level security;
alter table public.balcao_pricing_history enable row level security;
revoke all on public.balcao_api_rate_limits, public.balcao_pricing_settings, public.balcao_pricing_product_overrides, public.balcao_pricing_history from public, anon, authenticated;
grant all on public.balcao_api_rate_limits, public.balcao_pricing_settings, public.balcao_pricing_product_overrides, public.balcao_pricing_history to service_role;
create index if not exists balcao_pricing_history_store_idx on public.balcao_pricing_history(store_id, created_at desc);

create or replace function public.balcao_take_api_rate_limit(p_api_key_id uuid, p_limit integer)
returns table (allowed boolean, used integer, retry_after integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz := date_trunc('minute', now());
  v_used integer;
begin
  if p_limit < 1 then raise exception 'BALCAO_INVALID_RATE_LIMIT'; end if;
  insert into public.balcao_api_rate_limits(api_key_id,window_start,request_count,updated_at)
  values(p_api_key_id,v_window,1,now())
  on conflict(api_key_id) do update
    set request_count=case when public.balcao_api_rate_limits.window_start=v_window then public.balcao_api_rate_limits.request_count+1 else 1 end,
        window_start=v_window, updated_at=now()
  returning request_count into v_used;
  return query select v_used <= p_limit, v_used, greatest(1,60-extract(second from now())::integer);
end;
$$;
revoke all on function public.balcao_take_api_rate_limit(uuid,integer) from public,anon,authenticated;
grant execute on function public.balcao_take_api_rate_limit(uuid,integer) to service_role;
