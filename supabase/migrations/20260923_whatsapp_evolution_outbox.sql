-- WhatsApp via Evolution API (Baileys): outbox confiável, estado da instância e dedupe de webhooks.
-- HTTP 200/201 da Evolution NÃO é prova de entrega: o status real vem de MESSAGES_UPDATE.

create table if not exists public.wa_outbox (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  instance text not null default 'rafa',
  to_phone text not null,
  kind text not null check (kind in ('text', 'buttons', 'menu_fallback')),
  payload jsonb not null,
  status text not null default 'queued'
    check (status in ('queued', 'sending', 'sent', 'pending', 'server_ack', 'delivered', 'read', 'failed', 'fallback', 'cancelled')),
  provider_message_id text,
  attempts int not null default 0,
  max_attempts int not null default 3,
  last_error text,
  in_reply_to text,
  next_attempt_at timestamptz not null default now(),
  sent_at timestamptz,
  acked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wa_outbox_status_next_idx on public.wa_outbox(status, next_attempt_at);
create index if not exists wa_outbox_provider_id_idx on public.wa_outbox(provider_message_id);
create index if not exists wa_outbox_to_phone_created_idx on public.wa_outbox(to_phone, created_at desc);

create table if not exists public.wa_instance_state (
  instance text primary key,
  state text not null default 'unknown',
  status_reason int,
  updated_at timestamptz not null default now()
);

create table if not exists public.wa_webhook_events (
  event_key text primary key,
  event text not null,
  received_at timestamptz not null default now()
);

create index if not exists wa_webhook_events_received_idx on public.wa_webhook_events(received_at);

alter table public.wa_outbox enable row level security;
alter table public.wa_instance_state enable row level security;
alter table public.wa_webhook_events enable row level security;

revoke all on table public.wa_outbox from public, anon, authenticated;
revoke all on table public.wa_instance_state from public, anon, authenticated;
revoke all on table public.wa_webhook_events from public, anon, authenticated;

grant select, insert, update, delete on table public.wa_outbox to service_role;
grant select, insert, update, delete on table public.wa_instance_state to service_role;
grant select, insert, update, delete on table public.wa_webhook_events to service_role;

-- Claim atômico para o worker: evita dois workers pegarem a mesma mensagem.
create or replace function public.wa_outbox_claim(p_limit int default 20)
returns setof public.wa_outbox
language sql
security definer
set search_path = public
as $$
  update public.wa_outbox o
     set status = 'sending', updated_at = now()
   where o.id in (
     select id from public.wa_outbox
      where status = 'queued' and next_attempt_at <= now()
      order by created_at
      limit p_limit
      for update skip locked
   )
  returning o.*;
$$;

revoke all on function public.wa_outbox_claim(int) from public, anon, authenticated;
grant execute on function public.wa_outbox_claim(int) to service_role;
