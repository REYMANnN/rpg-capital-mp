-- Falhas da camada de IA da Rafa (Groq): motivo + resposta crua.
-- A Vercel Hobby só guarda 1h de log; aqui o diagnóstico fica disponível.
create table if not exists public.rafa_ai_errors (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.inventory_v1_stores(id) on delete set null,
  wa_id text,
  operation text not null,
  model text not null,
  stage text not null check (stage in ('http', 'truncated', 'parse', 'empty', 'exception')),
  http_status int,
  error_message text,
  raw_response text,
  created_at timestamptz not null default now()
);

create index if not exists rafa_ai_errors_created_idx
  on public.rafa_ai_errors (created_at desc);

-- Só o service role (backend) lê/escreve: RLS ligado e nenhuma policy.
alter table public.rafa_ai_errors enable row level security;
