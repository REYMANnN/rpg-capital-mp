-- BALCÃO v12.0 — capability-scoped integrations, API keys, webhooks and logs.
-- These functions deliberately expose only safe metadata to anon/authenticated callers that hold the current store installation capability.

create or replace function public.balcao_automation_api_keys_state(p_store_id uuid,p_installation_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_business uuid;
begin
  v_business:=private.balcao_automation_capability(p_store_id,p_installation_id);
  if v_business is null then raise exception 'BALCAO_AUTOMATION_FORBIDDEN'; end if;
  return coalesce((select jsonb_agg(to_jsonb(x)) from (
    select k.id,k.name,k.prefix,k.scopes,k.status,k.approval_status,k.expires_at,k.last_used_at,k.created_at
    from public.balcao_api_keys k
    where k.business_id=v_business and k.store_id=p_store_id
    order by k.created_at desc
  ) x),'[]'::jsonb);
end;$$;
revoke all on function public.balcao_automation_api_keys_state(uuid,uuid) from public;
grant execute on function public.balcao_automation_api_keys_state(uuid,uuid) to anon,authenticated,service_role;

create or replace function public.balcao_automation_api_key_create(
  p_store_id uuid,p_installation_id uuid,p_name text,p_prefix text,p_secret_hash text,p_scopes text[],p_approval_status text default 'approved',p_expires_at timestamptz default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_business uuid;v_row public.balcao_api_keys%rowtype;
begin
  v_business:=private.balcao_automation_capability(p_store_id,p_installation_id);
  if v_business is null then raise exception 'BALCAO_AUTOMATION_FORBIDDEN'; end if;
  if length(btrim(coalesce(p_name,'')))<2 or length(btrim(p_name))>120 or p_prefix !~ '^[a-f0-9]{8}$' or p_secret_hash !~ '^[a-f0-9]{64}$' then raise exception 'BALCAO_API_KEY_INVALID'; end if;
  if coalesce(p_approval_status,'') not in('pending','approved') then raise exception 'BALCAO_API_KEY_INVALID'; end if;
  if coalesce(p_scopes,'{}'::text[]) && array['products:read','products:write','inventory:read','inventory:write','sales:read','sales:ingest','finance:read','pricing:read','pricing:write','webhooks:manage']::text[] is false then raise exception 'BALCAO_API_KEY_INVALID'; end if;
  if exists(select 1 from unnest(coalesce(p_scopes,'{}'::text[])) s where s not in('products:read','products:write','inventory:read','inventory:write','sales:read','sales:ingest','finance:read','pricing:read','pricing:write','webhooks:manage')) then raise exception 'BALCAO_API_KEY_INVALID'; end if;
  insert into public.balcao_api_keys(business_id,store_id,name,prefix,secret_hash,scopes,status,approval_status,expires_at,created_by_user_id)
  values(v_business,p_store_id,btrim(p_name),p_prefix,p_secret_hash,coalesce(p_scopes,'{}'::text[]),'active',p_approval_status,p_expires_at,auth.uid()) returning * into v_row;
  insert into public.balcao_audit_events(business_id,store_id,actor_user_id,action,entity_type,entity_id,metadata,created_at)
  values(v_business,p_store_id,auth.uid(),'api_key.created','api_key',v_row.id::text,jsonb_build_object('prefix',p_prefix,'scopes',p_scopes,'approvalStatus',p_approval_status),now());
  return jsonb_build_object('id',v_row.id,'prefix',v_row.prefix,'approvalStatus',v_row.approval_status);
end;$$;
revoke all on function public.balcao_automation_api_key_create(uuid,uuid,text,text,text,text[],text,timestamptz) from public;
grant execute on function public.balcao_automation_api_key_create(uuid,uuid,text,text,text,text[],text,timestamptz) to anon,authenticated,service_role;

create or replace function public.balcao_automation_api_key_action(
  p_installation_id uuid,p_id uuid,p_action text,p_prefix text default null,p_secret_hash text default null,p_approval_status text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_row public.balcao_api_keys%rowtype;v_business uuid;
begin
  select * into v_row from public.balcao_api_keys where id=p_id;
  if v_row.id is null or v_row.store_id is null then raise exception 'BALCAO_API_KEY_NOT_FOUND'; end if;
  v_business:=private.balcao_automation_capability(v_row.store_id,p_installation_id);
  if v_business is null or v_business<>v_row.business_id then raise exception 'BALCAO_AUTOMATION_FORBIDDEN'; end if;
  if p_action='revoke' then
    update public.balcao_api_keys set status='revoked',updated_at=now() where id=p_id;
  elsif p_action='approve' or p_action='reject' then
    update public.balcao_api_keys set approval_status=case when p_action='reject' then 'rejected' else 'approved' end,updated_at=now() where id=p_id;
  elsif p_action='rotate' then
    if p_prefix !~ '^[a-f0-9]{8}$' or p_secret_hash !~ '^[a-f0-9]{64}$' then raise exception 'BALCAO_API_KEY_INVALID'; end if;
    update public.balcao_api_keys set prefix=p_prefix,secret_hash=p_secret_hash,last_used_at=null,updated_at=now() where id=p_id;
  else raise exception 'BALCAO_API_KEY_ACTION_INVALID';
  end if;
  insert into public.balcao_audit_events(business_id,store_id,actor_user_id,action,entity_type,entity_id,metadata,created_at)
  values(v_business,v_row.store_id,auth.uid(),'api_key.'||p_action,'api_key',p_id::text,jsonb_build_object('prefix',coalesce(p_prefix,v_row.prefix)),now());
  return jsonb_build_object('ok',true,'id',p_id,'action',p_action,'approvalStatus',case when p_action='reject' then 'rejected' when p_action='approve' then 'approved' else v_row.approval_status end);
end;$$;
revoke all on function public.balcao_automation_api_key_action(uuid,uuid,text,text,text,text) from public;
grant execute on function public.balcao_automation_api_key_action(uuid,uuid,text,text,text,text) to anon,authenticated,service_role;

create or replace function public.balcao_automation_integrations_state(p_store_id uuid,p_installation_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_business uuid;
begin
  v_business:=private.balcao_automation_capability(p_store_id,p_installation_id);
  if v_business is null then raise exception 'BALCAO_AUTOMATION_FORBIDDEN'; end if;
  return coalesce((select jsonb_agg(to_jsonb(x)) from (
    select i.id,i.name,i.kind,i.direction,i.authority,i.status,i.last_sync_at,i.last_error,i.created_at
    from public.balcao_integration_connections i where i.business_id=v_business and i.store_id=p_store_id order by i.created_at desc
  ) x),'[]'::jsonb);
end;$$;
revoke all on function public.balcao_automation_integrations_state(uuid,uuid) from public;
grant execute on function public.balcao_automation_integrations_state(uuid,uuid) to anon,authenticated,service_role;

create or replace function public.balcao_automation_integration_create(
 p_store_id uuid,p_installation_id uuid,p_name text,p_kind text,p_direction text,p_authority jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_business uuid;v_row public.balcao_integration_connections%rowtype;
begin
  v_business:=private.balcao_automation_capability(p_store_id,p_installation_id);
  if v_business is null then raise exception 'BALCAO_AUTOMATION_FORBIDDEN'; end if;
  if length(btrim(coalesce(p_name,'')))<2 or p_kind not in('erp','pos','ecommerce','bi','custom') or p_direction not in('inbound','outbound','bidirectional') then raise exception 'BALCAO_INTEGRATION_INVALID'; end if;
  insert into public.balcao_integration_connections(business_id,store_id,name,kind,direction,authority,status,created_by_user_id)
  values(v_business,p_store_id,left(btrim(p_name),120),p_kind,p_direction,coalesce(p_authority,'{}'::jsonb),'active',auth.uid()) returning * into v_row;
  insert into public.balcao_audit_events(business_id,store_id,actor_user_id,action,entity_type,entity_id,metadata,created_at)
  values(v_business,p_store_id,auth.uid(),'integration.created','integration',v_row.id::text,jsonb_build_object('kind',p_kind,'authority',p_authority),now());
  return jsonb_build_object('id',v_row.id,'authority',v_row.authority);
end;$$;
revoke all on function public.balcao_automation_integration_create(uuid,uuid,text,text,text,jsonb) from public;
grant execute on function public.balcao_automation_integration_create(uuid,uuid,text,text,text,jsonb) to anon,authenticated,service_role;

create or replace function public.balcao_automation_webhooks_state(p_store_id uuid,p_installation_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_business uuid;
begin
  v_business:=private.balcao_automation_capability(p_store_id,p_installation_id);
  if v_business is null then raise exception 'BALCAO_AUTOMATION_FORBIDDEN'; end if;
  return coalesce((select jsonb_agg(to_jsonb(x)) from (
    select w.id,w.name,w.url,w.event_types,w.status,w.consecutive_failures,w.last_success_at,w.last_failure_at,w.created_at
    from public.balcao_webhook_endpoints w where w.business_id=v_business and w.store_id=p_store_id order by w.created_at desc
  ) x),'[]'::jsonb);
end;$$;
revoke all on function public.balcao_automation_webhooks_state(uuid,uuid) from public;
grant execute on function public.balcao_automation_webhooks_state(uuid,uuid) to anon,authenticated,service_role;

create or replace function public.balcao_automation_webhook_create(
 p_store_id uuid,p_installation_id uuid,p_name text,p_url text,p_event_types text[],p_secret_ciphertext text
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_business uuid;v_id uuid;
begin
  v_business:=private.balcao_automation_capability(p_store_id,p_installation_id);
  if v_business is null then raise exception 'BALCAO_AUTOMATION_FORBIDDEN'; end if;
  if length(btrim(coalesce(p_name,'')))<2 or p_url not like 'https://%' or coalesce(array_length(p_event_types,1),0)=0 or length(coalesce(p_secret_ciphertext,''))<20 then raise exception 'BALCAO_WEBHOOK_INVALID'; end if;
  insert into public.balcao_webhook_endpoints(business_id,store_id,name,url,event_types,secret_ciphertext,status,created_by_user_id)
  values(v_business,p_store_id,left(btrim(p_name),120),p_url,p_event_types,p_secret_ciphertext,'active',auth.uid()) returning id into v_id;
  insert into public.balcao_audit_events(business_id,store_id,actor_user_id,action,entity_type,entity_id,metadata,created_at)
  values(v_business,p_store_id,auth.uid(),'webhook.created','webhook',v_id::text,jsonb_build_object('url',p_url,'eventTypes',p_event_types),now());
  return v_id;
end;$$;
revoke all on function public.balcao_automation_webhook_create(uuid,uuid,text,text,text[],text) from public;
grant execute on function public.balcao_automation_webhook_create(uuid,uuid,text,text,text[],text) to anon,authenticated,service_role;

create or replace function public.balcao_automation_webhook_action(
 p_installation_id uuid,p_id uuid,p_action text,p_status text default null,p_secret_ciphertext text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_row public.balcao_webhook_endpoints%rowtype;v_business uuid;
begin
  select * into v_row from public.balcao_webhook_endpoints where id=p_id;
  if v_row.id is null or v_row.store_id is null then raise exception 'BALCAO_WEBHOOK_NOT_FOUND'; end if;
  v_business:=private.balcao_automation_capability(v_row.store_id,p_installation_id);
  if v_business is null or v_business<>v_row.business_id then raise exception 'BALCAO_AUTOMATION_FORBIDDEN'; end if;
  if p_action='delete' then delete from public.balcao_webhook_endpoints where id=p_id;
  elsif p_action='status' then
    if p_status not in('active','paused') then raise exception 'BALCAO_WEBHOOK_INVALID'; end if;
    update public.balcao_webhook_endpoints set status=p_status,consecutive_failures=case when p_status='active' then 0 else consecutive_failures end,updated_at=now() where id=p_id;
  elsif p_action='rotate' then
    if length(coalesce(p_secret_ciphertext,''))<20 then raise exception 'BALCAO_WEBHOOK_INVALID'; end if;
    update public.balcao_webhook_endpoints set secret_ciphertext=p_secret_ciphertext,updated_at=now() where id=p_id;
  else raise exception 'BALCAO_WEBHOOK_ACTION_INVALID';
  end if;
  insert into public.balcao_audit_events(business_id,store_id,actor_user_id,action,entity_type,entity_id,metadata,created_at)
  values(v_business,v_row.store_id,auth.uid(),'webhook.'||p_action,'webhook',p_id::text,'{}'::jsonb,now());
  return jsonb_build_object('ok',true,'id',p_id,'action',p_action,'status',coalesce(p_status,v_row.status));
end;$$;
revoke all on function public.balcao_automation_webhook_action(uuid,uuid,text,text,text) from public;
grant execute on function public.balcao_automation_webhook_action(uuid,uuid,text,text,text) to anon,authenticated,service_role;

create or replace function public.balcao_automation_webhook_test_context(p_installation_id uuid,p_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_row public.balcao_webhook_endpoints%rowtype;v_business uuid;
begin
  select * into v_row from public.balcao_webhook_endpoints where id=p_id;
  if v_row.id is null or v_row.store_id is null then raise exception 'BALCAO_WEBHOOK_NOT_FOUND'; end if;
  v_business:=private.balcao_automation_capability(v_row.store_id,p_installation_id);
  if v_business is null or v_business<>v_row.business_id then raise exception 'BALCAO_AUTOMATION_FORBIDDEN'; end if;
  return jsonb_build_object('businessId',v_row.business_id,'storeId',v_row.store_id,'url',v_row.url,'secretCiphertext',v_row.secret_ciphertext);
end;$$;
revoke all on function public.balcao_automation_webhook_test_context(uuid,uuid) from public;
grant execute on function public.balcao_automation_webhook_test_context(uuid,uuid) to anon,authenticated,service_role;

create or replace function public.balcao_automation_delivery_logs(p_store_id uuid,p_installation_id uuid,p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_business uuid;
begin
  v_business:=private.balcao_automation_capability(p_store_id,p_installation_id);
  if v_business is null then raise exception 'BALCAO_AUTOMATION_FORBIDDEN'; end if;
  return coalesce((select jsonb_agg(to_jsonb(x)) from (
    select d.id,d.endpoint_id,w.name as endpoint_name,d.status,d.attempt_count,d.response_status,d.duration_ms,d.last_error,d.created_at,d.delivered_at,o.event_type,o.occurred_at
    from public.balcao_webhook_deliveries d
    join public.balcao_webhook_endpoints w on w.id=d.endpoint_id
    join public.balcao_event_outbox o on o.id=d.event_id
    where w.business_id=v_business and w.store_id=p_store_id
    order by d.created_at desc limit greatest(1,least(coalesce(p_limit,50),200))
  ) x),'[]'::jsonb);
end;$$;
revoke all on function public.balcao_automation_delivery_logs(uuid,uuid,integer) from public;
grant execute on function public.balcao_automation_delivery_logs(uuid,uuid,integer) to anon,authenticated,service_role;
