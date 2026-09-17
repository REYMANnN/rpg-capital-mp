alter table public.whatsapp_inbound_messages
  add column if not exists intent text;

alter table public.whatsapp_inbound_messages
  add column if not exists text_normalized text;
