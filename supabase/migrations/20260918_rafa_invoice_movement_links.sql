alter table public.rafa_invoice_imports
  add column if not exists movement_ids jsonb not null default '[]'::jsonb;
