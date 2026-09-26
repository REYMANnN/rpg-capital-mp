-- Estoque "preguiçoso": produtos novos da nota esperando o preço de venda do lojista
-- e controle de 1 dica/tarefa por dia da Rafa.

create table if not exists public.rafa_pending_products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.inventory_v1_stores(id) on delete cascade,
  wa_id text not null,
  invoice_import_id uuid references public.rafa_invoice_imports(id) on delete set null,
  barcode text not null,
  name text not null,
  brand text,
  unit text not null default 'UN' check (unit in ('UN', 'KG')),
  quantity_milli bigint not null default 0 check (quantity_milli >= 0),
  cost_cents bigint not null check (cost_cents > 0),
  status text not null default 'aguardando_preco'
    check (status in ('aguardando_preco', 'cadastrado', 'descartado')),
  asked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Um produto pendente por EAN por loja (nota nova do mesmo produto soma na pendência).
create unique index if not exists rafa_pending_products_open_uidx
  on public.rafa_pending_products (store_id, barcode) where status = 'aguardando_preco';
create index if not exists rafa_pending_products_store_idx
  on public.rafa_pending_products (store_id, status, created_at desc);

create table if not exists public.rafa_daily_tips (
  id uuid primary key default gen_random_uuid(),
  wa_id text not null,
  store_id uuid references public.inventory_v1_stores(id) on delete cascade,
  day date not null,
  tip_key text not null,
  message text not null,
  created_at timestamptz not null default now(),
  unique (wa_id, day)
);

alter table public.rafa_pending_products enable row level security;
alter table public.rafa_daily_tips enable row level security;
revoke all on table public.rafa_pending_products from public, anon, authenticated;
revoke all on table public.rafa_daily_tips from public, anon, authenticated;
grant select, insert, update, delete on table public.rafa_pending_products to service_role;
grant select, insert, update, delete on table public.rafa_daily_tips to service_role;

-- XML de NF-e também vira comprovante da nota.
update storage.buckets
set allowed_mime_types = array['image/jpeg','image/png','image/webp','application/pdf','application/xml','text/xml']::text[]
where id = 'rafa-invoice-proofs';
