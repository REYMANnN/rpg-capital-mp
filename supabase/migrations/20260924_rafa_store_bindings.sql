-- Vínculo permanente número de WhatsApp → loja, usado pela Rafa conversacional.
-- Separado de whatsapp_sessions (que expira em 30 min por fluxo).

create table if not exists public.wa_store_bindings (
  wa_id text primary key,
  store_id uuid not null references public.inventory_v1_stores(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.wa_store_bindings enable row level security;
revoke all on table public.wa_store_bindings from public, anon, authenticated;
grant select, insert, update, delete on table public.wa_store_bindings to service_role;
