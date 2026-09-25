-- Links curtos da Rafa para o Balcão (https://www.rpgcapital.com.br/l/<code>).
-- Sem prazo fixo: o link vale até ser substituído por um mais novo do mesmo número
-- ou até o fluxo ser encerrado no Balcão.

create table if not exists public.wa_links (
  code text primary key,
  wa_id text not null,
  store_id uuid references public.inventory_v1_stores(id) on delete cascade,
  fluxo text not null,
  created_at timestamptz not null default now(),
  opened_at timestamptz,
  revoked_at timestamptz,
  revoked_reason text
);

create index if not exists wa_links_wa_active_idx on public.wa_links (wa_id, created_at desc) where revoked_at is null;

alter table public.wa_links enable row level security;
revoke all on table public.wa_links from public, anon, authenticated;
grant select, insert, update, delete on table public.wa_links to service_role;

-- Novo fluxo "entrada" (subir estoque).
alter table public.whatsapp_sessions drop constraint if exists whatsapp_sessions_fluxo_atual_check;
alter table public.whatsapp_sessions add constraint whatsapp_sessions_fluxo_atual_check
  check (fluxo_atual is null or fluxo_atual in ('vender', 'ler-codigo', 'prateleira', 'entrada'));
alter table public.whatsapp_deeplink_jtis drop constraint if exists whatsapp_deeplink_jtis_fluxo_check;
alter table public.whatsapp_deeplink_jtis add constraint whatsapp_deeplink_jtis_fluxo_check
  check (fluxo in ('vender', 'ler-codigo', 'prateleira', 'entrada'));
