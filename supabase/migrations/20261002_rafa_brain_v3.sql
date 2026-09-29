-- Rafa 3.0: integridade das gravações + memória de conversa + cérebro do lojista.
-- Tudo aditivo. Nenhuma tabela existente perde dado.

-- 1) Versão do estado por loja: toda atualização da linha da loja (inclusive a feita pelo
--    inventory_v1_sync_state) incrementa a versão. A Rafa só grava se a versão não mudou.
alter table public.inventory_v1_stores
  add column if not exists state_version bigint not null default 0;

create or replace function public.inventory_v1_bump_state_version()
returns trigger
language plpgsql
as $$
begin
  new.state_version := coalesce(old.state_version, 0) + 1;
  return new;
end
$$;

drop trigger if exists inventory_v1_stores_state_version on public.inventory_v1_stores;
create trigger inventory_v1_stores_state_version
  before update on public.inventory_v1_stores
  for each row execute function public.inventory_v1_bump_state_version();

-- Gravação com checagem de versão + trava da linha da loja durante a transação.
create or replace function public.rafa_sync_state_checked(
  p_store_id uuid,
  p_state jsonb,
  p_app_version text,
  p_expected_version bigint
)
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_installation uuid;
  v_version bigint;
begin
  select installation_id, state_version into v_installation, v_version
  from public.inventory_v1_stores
  where id = p_store_id and active
  for update;
  if v_installation is null then
    raise exception 'rafa_store_not_found';
  end if;
  if v_version <> p_expected_version then
    raise exception 'state_version_conflict';
  end if;
  perform public.inventory_v1_sync_state(v_installation, p_state, p_app_version);
  select state_version into v_version from public.inventory_v1_stores where id = p_store_id;
  return v_version;
end
$$;
revoke all on function public.rafa_sync_state_checked(uuid, jsonb, text, bigint) from public, anon, authenticated;

-- 2) Operações da Rafa: idempotência (operation_id único) + antes/depois para desfazer.
create table if not exists public.rafa_operations (
  id uuid primary key default gen_random_uuid(),
  operation_id text not null unique,
  store_id uuid not null references public.inventory_v1_stores(id) on delete cascade,
  wa_id text,
  tool text not null,
  summary text,
  input jsonb not null default '{}'::jsonb,
  changes jsonb not null default '[]'::jsonb,
  before_products jsonb not null default '[]'::jsonb,
  after_products jsonb not null default '[]'::jsonb,
  created_movement_ids jsonb not null default '[]'::jsonb,
  created_sale_ids jsonb not null default '[]'::jsonb,
  side_effects jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'applied', 'undone', 'failed')),
  error text,
  state_version_after bigint,
  undo_of uuid references public.rafa_operations(id) on delete set null,
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  undone_at timestamptz
);
create index if not exists rafa_operations_store_created_idx on public.rafa_operations (store_id, created_at desc);
alter table public.rafa_operations enable row level security;

-- 3) Conversa como eventos (texto, áudio, foto, nota, ação, resposta da Rafa).
create table if not exists public.rafa_events (
  id uuid primary key default gen_random_uuid(),
  wa_id text not null,
  store_id uuid references public.inventory_v1_stores(id) on delete set null,
  direction text not null check (direction in ('in', 'out', 'system')),
  kind text not null,
  text text,
  data jsonb not null default '{}'::jsonb,
  media_path text,
  source_id text,
  created_at timestamptz not null default now()
);
-- Índice único COMPLETO (não parcial): o upsert on conflict (source_id) do supabase-js exige isso.
create unique index if not exists rafa_events_source_uidx on public.rafa_events (source_id);
create index if not exists rafa_events_wa_created_idx on public.rafa_events (wa_id, created_at desc);
alter table public.rafa_events enable row level security;

-- 4) Cérebro do lojista: só fatos que o lojista disse.
create table if not exists public.rafa_memory (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.inventory_v1_stores(id) on delete cascade,
  fact text not null check (char_length(fact) between 2 and 300),
  source text not null default 'lojista' check (source in ('lojista')),
  source_event_id uuid references public.rafa_events(id) on delete set null,
  created_by_wa text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists rafa_memory_store_idx on public.rafa_memory (store_id) where deleted_at is null;
alter table public.rafa_memory enable row level security;

-- 5) Trava por número/loja (uma mensagem por vez).
create table if not exists public.rafa_locks (
  key text primary key,
  holder text not null,
  expires_at timestamptz not null
);
alter table public.rafa_locks enable row level security;

create or replace function public.rafa_try_lock(p_key text, p_holder text, p_ttl_seconds int)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_holder text;
begin
  insert into public.rafa_locks (key, holder, expires_at)
  values (p_key, p_holder, now() + make_interval(secs => p_ttl_seconds))
  on conflict (key) do update
    set holder = excluded.holder, expires_at = excluded.expires_at
    where public.rafa_locks.expires_at < now() or public.rafa_locks.holder = excluded.holder
  returning holder into v_holder;
  return coalesce(v_holder = p_holder, false);
end
$$;

create or replace function public.rafa_release_lock(p_key text, p_holder text)
returns void
language sql
security definer
set search_path to 'public'
as $$
  delete from public.rafa_locks where key = p_key and holder = p_holder;
$$;
revoke all on function public.rafa_try_lock(text, text, int) from public, anon, authenticated;
revoke all on function public.rafa_release_lock(text, text) from public, anon, authenticated;
grant execute on function public.rafa_try_lock(text, text, int) to service_role;
grant execute on function public.rafa_release_lock(text, text) to service_role;
grant execute on function public.rafa_sync_state_checked(uuid, jsonb, text, bigint) to service_role;
revoke all on public.rafa_operations, public.rafa_events, public.rafa_memory, public.rafa_locks from anon, authenticated;

-- 6) Bateria de testes: token só vale para a loja e o número de teste gravados junto.
create table if not exists public.rafa_eval_tokens (
  token_hash text primary key,
  store_id uuid not null references public.inventory_v1_stores(id) on delete cascade,
  wa_id text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.rafa_eval_tokens enable row level security;
revoke all on public.rafa_eval_tokens from anon, authenticated;
