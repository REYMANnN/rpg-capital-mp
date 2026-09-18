create table if not exists public.rafa_pending_actions (
  id uuid primary key default gen_random_uuid(),
  wa_id text not null,
  store_id uuid references public.inventory_v1_stores(id) on delete cascade,
  tipo text not null check (tipo in ('preco', 'estoque', 'venda', 'entrada', 'outro')),
  payload jsonb not null default '{}'::jsonb,
  mensagem_confirmacao text not null,
  status text not null default 'pendente' check (status in ('pendente', 'confirmada', 'recusada', 'expirada', 'invalidada')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  confirmed_at timestamptz
);

create index if not exists rafa_pending_actions_wa_status_idx
  on public.rafa_pending_actions (wa_id, status, created_at desc);
create index if not exists rafa_pending_actions_store_idx
  on public.rafa_pending_actions (store_id, created_at desc);
create index if not exists rafa_pending_actions_expires_idx
  on public.rafa_pending_actions (expires_at)
  where status = 'pendente';

alter table public.whatsapp_inbound_messages
  add column if not exists transcript text,
  add column if not exists media_mime text,
  add column if not exists media_duration_s int;

alter table public.whatsapp_inbound_messages
  drop constraint if exists whatsapp_inbound_messages_media_duration_s_check;
alter table public.whatsapp_inbound_messages
  add constraint whatsapp_inbound_messages_media_duration_s_check
  check (media_duration_s is null or media_duration_s >= 0);

create table if not exists public.supplier_product_map (
  id uuid primary key default gen_random_uuid(),
  fornecedor_cnpj text not null,
  codigo_fornecedor text not null,
  descricao_original text not null default '',
  produto_id text references public.inventory_v1_product_catalog_cache(barcode) on delete set null,
  ean text,
  confirmacoes int not null default 1 check (confirmacoes >= 0),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (fornecedor_cnpj, codigo_fornecedor)
);

create index if not exists supplier_product_map_ean_idx
  on public.supplier_product_map (ean)
  where ean is not null;

create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.inventory_v1_stores(id) on delete set null,
  wa_id text,
  operation text not null,
  model text not null,
  input_tokens int not null default 0 check (input_tokens >= 0),
  output_tokens int not null default 0 check (output_tokens >= 0),
  audio_seconds numeric(12,3) not null default 0 check (audio_seconds >= 0),
  estimated_cost_usd numeric(14,8) not null default 0 check (estimated_cost_usd >= 0),
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_store_created_idx
  on public.ai_usage (store_id, created_at desc);

create table if not exists public.rafa_invoice_imports (
  id uuid primary key default gen_random_uuid(),
  wa_id text not null,
  store_id uuid references public.inventory_v1_stores(id) on delete cascade,
  supplier_cnpj text,
  supplier_name text,
  media_paths jsonb not null default '[]'::jsonb,
  classification jsonb not null default '{}'::jsonb,
  extraction jsonb not null default '{}'::jsonb,
  status text not null default 'classified'
    check (status in ('classified', 'extracting', 'pending_review', 'ready', 'applied', 'cancelled', 'failed')),
  item_count int not null default 0 check (item_count >= 0),
  unit_count numeric(14,3) not null default 0 check (unit_count >= 0),
  total_cost_cents bigint not null default 0 check (total_cost_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  applied_at timestamptz
);

create index if not exists rafa_invoice_imports_wa_status_idx
  on public.rafa_invoice_imports (wa_id, status, created_at desc);
create index if not exists rafa_invoice_imports_store_idx
  on public.rafa_invoice_imports (store_id, created_at desc);

alter table public.rafa_pending_actions enable row level security;
alter table public.supplier_product_map enable row level security;
alter table public.ai_usage enable row level security;
alter table public.rafa_invoice_imports enable row level security;

revoke all on table public.rafa_pending_actions from public, anon, authenticated;
revoke all on table public.supplier_product_map from public, anon, authenticated;
revoke all on table public.ai_usage from public, anon, authenticated;
revoke all on table public.rafa_invoice_imports from public, anon, authenticated;

grant select, insert, update, delete on table public.rafa_pending_actions to service_role;
grant select, insert, update, delete on table public.supplier_product_map to service_role;
grant select, insert, update, delete on table public.ai_usage to service_role;
grant select, insert, update, delete on table public.rafa_invoice_imports to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'rafa-invoice-proofs',
  'rafa-invoice-proofs',
  false,
  20971520,
  array['image/jpeg','image/png','image/webp','application/pdf']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
