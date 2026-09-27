alter table public.rpg_interest_leads
  add column if not exists analytics_session_key uuid;

create index if not exists rpg_interest_leads_analytics_session_idx
  on public.rpg_interest_leads (analytics_session_key)
  where analytics_session_key is not null;

comment on column public.rpg_interest_leads.analytics_session_key is
  'Liga um lead a uma sessao de analitica apenas quando o visitante permitiu a analise.';
