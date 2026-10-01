alter table public.rpg_tap_charges
  add column if not exists sale_payload jsonb,
  add column if not exists inventory_finalized_at timestamptz,
  add column if not exists inventory_error text;

comment on column public.rpg_tap_charges.sale_payload is
  'Carrinho validado pelo Balcao para finalizar a venda somente depois do cartao aprovado.';

comment on column public.rpg_tap_charges.inventory_finalized_at is
  'Momento em que a venda aprovada foi aplicada ao estoque.';
