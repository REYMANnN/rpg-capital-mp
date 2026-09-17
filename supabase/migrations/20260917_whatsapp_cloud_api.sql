create table if not exists public.whatsapp_contacts (
  wa_id text primary key,
  profile_name text,
  opted_in boolean not null default false,
  opted_in_at timestamptz,
  opted_out boolean not null default false,
  opted_out_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_inbound_messages (
  id uuid primary key default gen_random_uuid(),
  wamid text unique not null,
  from_phone text not null,
  profile_name text,
  type text,
  text_body text,
  media_id text,
  raw jsonb,
  received_at timestamptz not null default now()
);

create table if not exists public.whatsapp_message_status (
  id uuid primary key default gen_random_uuid(),
  wamid text,
  status text,
  recipient text,
  status_at timestamptz,
  errors jsonb,
  raw jsonb,
  created_at timestamptz not null default now()
);

create index if not exists whatsapp_inbound_messages_from_phone_idx
  on public.whatsapp_inbound_messages(from_phone);
create index if not exists whatsapp_inbound_messages_wamid_idx
  on public.whatsapp_inbound_messages(wamid);
create index if not exists whatsapp_message_status_wamid_idx
  on public.whatsapp_message_status(wamid);

alter table public.whatsapp_contacts enable row level security;
alter table public.whatsapp_inbound_messages enable row level security;
alter table public.whatsapp_message_status enable row level security;

revoke all on table public.whatsapp_contacts from public, anon, authenticated;
revoke all on table public.whatsapp_inbound_messages from public, anon, authenticated;
revoke all on table public.whatsapp_message_status from public, anon, authenticated;

grant select, insert, update, delete on table public.whatsapp_contacts to service_role;
grant select, insert, update, delete on table public.whatsapp_inbound_messages to service_role;
grant select, insert, update, delete on table public.whatsapp_message_status to service_role;
