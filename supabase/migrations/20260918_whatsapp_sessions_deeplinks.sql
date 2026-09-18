create table if not exists public.whatsapp_sessions (
  wa_id text primary key,
  store_id uuid references public.inventory_v1_stores(id) on delete set null,
  fluxo_atual text check (fluxo_atual is null or fluxo_atual in ('vender', 'ler-codigo', 'prateleira')),
  etapa text not null default 'menu',
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 minutes')
);

create table if not exists public.whatsapp_deeplink_jtis (
  jti text primary key,
  wa_id text not null,
  fluxo text not null check (fluxo in ('vender', 'ler-codigo', 'prateleira')),
  used_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists whatsapp_sessions_store_id_idx on public.whatsapp_sessions(store_id);
create index if not exists whatsapp_sessions_expires_at_idx on public.whatsapp_sessions(expires_at);
create index if not exists whatsapp_deeplink_jtis_expires_at_idx on public.whatsapp_deeplink_jtis(expires_at);

alter table public.whatsapp_sessions enable row level security;
alter table public.whatsapp_deeplink_jtis enable row level security;

revoke all on table public.whatsapp_sessions from public, anon, authenticated;
revoke all on table public.whatsapp_deeplink_jtis from public, anon, authenticated;

grant select, insert, update, delete on table public.whatsapp_sessions to service_role;
grant select, insert, update, delete on table public.whatsapp_deeplink_jtis to service_role;
