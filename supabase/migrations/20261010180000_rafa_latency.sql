-- Medição de tempo de resposta da Rafa (10/10/2026).
-- ai_usage.duration_ms: quanto cada chamada de IA levou.
-- rafa_latency: uma linha por mensagem recebida, com o tempo de cada etapa (em segundos).

alter table public.ai_usage add column if not exists duration_ms integer;

create or replace view public.rafa_latency
with (security_invoker = true) as
with inbound as (
  select m.wamid, m.from_phone, m.type, m.intent,
         left(coalesce(m.text_body, m.transcript), 40) as preview,
         m.received_at as phone_at
  from public.whatsapp_inbound_messages m
),
started as (
  select e.source_id, min(e.created_at) as started_at
  from public.rafa_events e
  where e.direction = 'in' and e.source_id is not null
  group by e.source_id
),
replies as (
  select o.in_reply_to, min(o.created_at) as reply_ready_at, min(o.sent_at) as reply_sent_at
  from public.wa_outbox o
  where o.in_reply_to is not null and o.kind = 'text'
  group by o.in_reply_to
)
select
  i.wamid,
  i.from_phone,
  i.phone_at,
  i.type,
  i.intent,
  i.preview,
  round(extract(epoch from s.started_at - i.phone_at)::numeric, 1) as ate_comecar_s,
  round((select coalesce(sum(u.duration_ms), 0) from public.ai_usage u
          where u.wa_id = i.from_phone and u.created_at between s.started_at and coalesce(r.reply_ready_at, s.started_at + interval '5 minutes'))::numeric / 1000, 1) as ia_s,
  (select count(*) from public.ai_usage u
    where u.wa_id = i.from_phone and u.operation = 'rafa_brain' and u.created_at between s.started_at and coalesce(r.reply_ready_at, s.started_at + interval '5 minutes')) as chamadas_ia,
  round(extract(epoch from r.reply_ready_at - s.started_at)::numeric, 1) as processamento_s,
  round(extract(epoch from r.reply_sent_at - r.reply_ready_at)::numeric, 1) as envio_s,
  round(extract(epoch from r.reply_sent_at - i.phone_at)::numeric, 1) as total_s
from inbound i
left join started s on s.source_id = i.wamid
left join replies r on r.in_reply_to = i.wamid;

revoke all on public.rafa_latency from anon, authenticated;
