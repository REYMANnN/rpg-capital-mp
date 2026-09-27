-- Preço dos produtos novos da nota: a Rafa pergunta um de cada vez.
alter table public.rafa_pending_products add column if not exists current boolean not null default false;
alter table public.rafa_pending_products add column if not exists proposed_price_cents bigint;
alter table public.rafa_pending_products add column if not exists price_cents bigint;
alter table public.rafa_pending_products add column if not exists supplier_cnpj text;
alter table public.rafa_pending_products add column if not exists supplier_code text;

alter table public.rafa_pending_products drop constraint if exists rafa_pending_products_status_check;
alter table public.rafa_pending_products add constraint rafa_pending_products_status_check
  check (status in ('aguardando_preco', 'pulado', 'cadastrado', 'descartado'));

create index if not exists rafa_pending_products_current_idx
  on public.rafa_pending_products (wa_id) where current;
