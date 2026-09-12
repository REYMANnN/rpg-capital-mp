-- BALCÃO v12.0 — merchant-first automation center. Software-only: no money movement.
create table if not exists public.balcao_automations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.balcao_businesses(id) on delete cascade,
  store_id uuid not null references public.inventory_v1_stores(id) on delete cascade,
  recipe_key text not null,
  name text not null,
  status text not null default 'active' check(status in('active','paused')),
  mode text not null default 'notify' check(mode in('notify','recommend','automatic')),
  scope jsonb not null default '{"type":"all"}'::jsonb,
  config jsonb not null default '{}'::jsonb,
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(store_id,recipe_key)
);
create table if not exists public.balcao_automation_runs (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references public.balcao_automations(id) on delete cascade,
  business_id uuid not null references public.balcao_businesses(id) on delete cascade,
  store_id uuid not null references public.inventory_v1_stores(id) on delete cascade,
  status text not null check(status in('running','success','failed','skipped')),
  trigger text not null default 'manual', matched_count integer not null default 0,
  action_count integer not null default 0, summary jsonb not null default '{}'::jsonb,
  error_code text, started_at timestamptz not null default now(), finished_at timestamptz
);
create table if not exists public.balcao_automation_actions (
  id uuid primary key default gen_random_uuid(), run_id uuid not null references public.balcao_automation_runs(id) on delete cascade,
  automation_id uuid not null references public.balcao_automations(id) on delete cascade,
  business_id uuid not null references public.balcao_businesses(id) on delete cascade,
  store_id uuid not null references public.inventory_v1_stores(id) on delete cascade,
  entity_type text not null, entity_id text, entity_name text, action_type text not null,
  status text not null default 'observed', severity text not null default 'info', title text not null, description text,
  before_state jsonb not null default '{}'::jsonb, after_state jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb, rollback_available boolean not null default false,
  rolled_back_at timestamptz, created_at timestamptz not null default now()
);
create index if not exists balcao_automations_store_idx on public.balcao_automations(store_id,status,updated_at desc);
create index if not exists balcao_automation_runs_store_idx on public.balcao_automation_runs(store_id,started_at desc);
create index if not exists balcao_automation_actions_store_idx on public.balcao_automation_actions(store_id,created_at desc);
alter table public.balcao_automations enable row level security;
alter table public.balcao_automation_runs enable row level security;
alter table public.balcao_automation_actions enable row level security;
revoke all on table public.balcao_automations,public.balcao_automation_runs,public.balcao_automation_actions from public,anon,authenticated;
grant all on table public.balcao_automations,public.balcao_automation_runs,public.balcao_automation_actions to service_role;

create or replace function private.balcao_automation_capability(p_store_id uuid,p_installation_id uuid)
returns uuid language plpgsql stable security definer set search_path='' as $$
declare v_business uuid;
begin
  select s.business_id into v_business
  from public.inventory_v1_stores s
  where s.id=p_store_id and s.active
    and (s.installation_id=p_installation_id or exists(
      select 1 from public.balcao_business_members m
      where m.business_id=s.business_id and m.user_id=auth.uid() and m.active and m.role in('owner','admin','manager')
    ));
  return v_business;
end;$$;
revoke all on function private.balcao_automation_capability(uuid,uuid) from public,anon,authenticated;

create or replace function public.balcao_automation_store_context(p_installation_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce((select jsonb_build_object('storeId',s.id,'businessId',s.business_id,'displayName',s.display_name,'installationId',s.installation_id)
    from public.inventory_v1_stores s where s.installation_id=p_installation_id and s.active and s.business_id is not null limit 1),'{}'::jsonb);
$$;
revoke all on function public.balcao_automation_store_context(uuid) from public;
grant execute on function public.balcao_automation_store_context(uuid) to anon,authenticated,service_role;

create or replace function public.balcao_automation_center_state(p_store_id uuid,p_installation_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_business uuid;
begin
  v_business:=private.balcao_automation_capability(p_store_id,p_installation_id);
  if v_business is null then raise exception 'BALCAO_AUTOMATION_FORBIDDEN'; end if;
  return jsonb_build_object(
    'automations',coalesce((select jsonb_agg(to_jsonb(x)) from (select a.* from public.balcao_automations a where a.business_id=v_business and a.store_id=p_store_id order by a.updated_at desc) x),'[]'::jsonb),
    'runs',coalesce((select jsonb_agg(to_jsonb(x)) from (select r.* from public.balcao_automation_runs r where r.business_id=v_business and r.store_id=p_store_id order by r.started_at desc limit 100) x),'[]'::jsonb),
    'actions',coalesce((select jsonb_agg(to_jsonb(x)) from (select a.* from public.balcao_automation_actions a where a.business_id=v_business and a.store_id=p_store_id order by a.created_at desc limit 250) x),'[]'::jsonb)
  );
end;$$;
revoke all on function public.balcao_automation_center_state(uuid,uuid) from public;
grant execute on function public.balcao_automation_center_state(uuid,uuid) to anon,authenticated,service_role;

create or replace function public.balcao_automation_upsert(
  p_store_id uuid,p_installation_id uuid,p_recipe_key text,p_name text,p_status text,p_mode text,p_config jsonb default '{}'::jsonb,p_scope jsonb default '{"type":"all"}'::jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_business uuid;v_row public.balcao_automations%rowtype;
begin
  v_business:=private.balcao_automation_capability(p_store_id,p_installation_id);
  if v_business is null then raise exception 'BALCAO_AUTOMATION_FORBIDDEN'; end if;
  if p_recipe_key not in('margin_protection','smart_pricing','low_stock','stockout_risk','stagnant_stock','excess_stock','replenishment','missing_cost','sales_drop','daily_summary','unusual_expense','card_effective_cost') then raise exception 'BALCAO_AUTOMATION_RECIPE_INVALID'; end if;
  if p_status not in('active','paused') or p_mode not in('notify','recommend','automatic') then raise exception 'BALCAO_AUTOMATION_CONFIG_INVALID'; end if;
  if p_mode='automatic' and p_recipe_key not in('margin_protection','smart_pricing') then raise exception 'BALCAO_AUTOMATION_MODE_INVALID'; end if;
  insert into public.balcao_automations(business_id,store_id,recipe_key,name,status,mode,config,scope,updated_at)
  values(v_business,p_store_id,p_recipe_key,left(coalesce(nullif(btrim(p_name),''),p_recipe_key),120),p_status,p_mode,coalesce(p_config,'{}'::jsonb),coalesce(p_scope,'{"type":"all"}'::jsonb),now())
  on conflict(store_id,recipe_key) do update set name=excluded.name,status=excluded.status,mode=excluded.mode,config=excluded.config,scope=excluded.scope,updated_at=now()
  returning * into v_row;
  return to_jsonb(v_row);
end;$$;
revoke all on function public.balcao_automation_upsert(uuid,uuid,text,text,text,text,jsonb,jsonb) from public;
grant execute on function public.balcao_automation_upsert(uuid,uuid,text,text,text,text,jsonb,jsonb) to anon,authenticated,service_role;

create or replace function public.balcao_automation_record_run(
 p_store_id uuid,p_installation_id uuid,p_automation_id uuid,p_status text,p_trigger text,p_summary jsonb,p_actions jsonb
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_business uuid;v_run uuid;v_action jsonb;v_automation public.balcao_automations%rowtype;
begin
  v_business:=private.balcao_automation_capability(p_store_id,p_installation_id);
  if v_business is null then raise exception 'BALCAO_AUTOMATION_FORBIDDEN'; end if;
  select * into v_automation from public.balcao_automations where id=p_automation_id and store_id=p_store_id and business_id=v_business;
  if v_automation.id is null then raise exception 'BALCAO_AUTOMATION_NOT_FOUND'; end if;
  insert into public.balcao_automation_runs(automation_id,business_id,store_id,status,trigger,matched_count,action_count,summary,started_at,finished_at)
  values(p_automation_id,v_business,p_store_id,case when p_status in('success','failed','skipped') then p_status else 'success' end,left(coalesce(p_trigger,'manual'),40),coalesce((p_summary->>'matched')::int,0),coalesce((p_summary->>'applied')::int,0),coalesce(p_summary,'{}'::jsonb),now(),now()) returning id into v_run;
  for v_action in select value from jsonb_array_elements(coalesce(p_actions,'[]'::jsonb)) loop
    insert into public.balcao_automation_actions(run_id,automation_id,business_id,store_id,entity_type,entity_id,entity_name,action_type,status,severity,title,description,before_state,after_state,metadata,rollback_available)
    values(v_run,p_automation_id,v_business,p_store_id,coalesce(v_action->>'entityType','store'),v_action->>'entityId',v_action->>'entityName',coalesce(v_action->>'actionType','finding'),coalesce(v_action->>'status','observed'),coalesce(v_action->>'severity','info'),left(coalesce(v_action->>'title','Automação executada'),180),v_action->>'description',coalesce(v_action->'beforeState','{}'::jsonb),coalesce(v_action->'afterState','{}'::jsonb),coalesce(v_action->'metadata','{}'::jsonb),coalesce((v_action->>'rollbackAvailable')::boolean,false));
  end loop;
  update public.balcao_automations set last_run_at=now(),updated_at=now() where id=p_automation_id;
  return v_run;
end;$$;
revoke all on function public.balcao_automation_record_run(uuid,uuid,uuid,text,text,jsonb,jsonb) from public;
grant execute on function public.balcao_automation_record_run(uuid,uuid,uuid,text,text,jsonb,jsonb) to anon,authenticated,service_role;
