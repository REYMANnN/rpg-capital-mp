-- BALCÃO v12.0 — public API authentication and read snapshots without a Vercel service-role secret.

create or replace function public.balcao_public_api_authenticate(
  p_prefix text,
  p_secret_hash text,
  p_requested_store_id uuid,
  p_required_scope text,
  p_limit integer default 120
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_key public.balcao_api_keys%rowtype;
  v_store public.inventory_v1_stores%rowtype;
  v_rate record;
begin
  select * into v_key from public.balcao_api_keys
  where prefix=p_prefix and secret_hash=p_secret_hash and status='active' and approval_status='approved'
    and (expires_at is null or expires_at>now())
  limit 1;
  if v_key.id is null then return jsonb_build_object('ok',false,'code','invalid_api_key'); end if;
  if not (p_required_scope=any(v_key.scopes)) then return jsonb_build_object('ok',false,'code','missing_scope'); end if;

  select * into v_store from public.inventory_v1_stores
  where id=coalesce(v_key.store_id,p_requested_store_id) and active and business_id=v_key.business_id;
  if v_store.id is null then return jsonb_build_object('ok',false,'code',case when v_key.store_id is null and p_requested_store_id is null then 'store_required' else 'store_forbidden' end); end if;

  select * into v_rate from public.balcao_take_api_rate_limit(v_key.id,greatest(1,least(coalesce(p_limit,120),1000))) limit 1;
  if not coalesce(v_rate.allowed,false) then return jsonb_build_object('ok',false,'code','rate_limited','retryAfter',coalesce(v_rate.retry_after,60)); end if;

  update public.balcao_api_keys set last_used_at=now(),updated_at=now() where id=v_key.id;
  return jsonb_build_object(
    'ok',true,'keyId',v_key.id,'businessId',v_key.business_id,'storeId',v_store.id,'installationId',v_store.installation_id,
    'scopes',to_jsonb(v_key.scopes),'prefix',v_key.prefix
  );
end;$$;
revoke all on function public.balcao_public_api_authenticate(text,text,uuid,text,integer) from public;
grant execute on function public.balcao_public_api_authenticate(text,text,uuid,text,integer) to anon,authenticated,service_role;

create or replace function public.balcao_public_finance_snapshot(p_api_key_id uuid,p_store_id uuid,p_installation_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_business uuid;v_key public.balcao_api_keys%rowtype;
begin
  v_business:=private.balcao_automation_capability(p_store_id,p_installation_id);
  select * into v_key from public.balcao_api_keys where id=p_api_key_id and status='active' and approval_status='approved' and 'finance:read'=any(scopes) and (expires_at is null or expires_at>now());
  if v_business is null or v_key.id is null or v_key.business_id<>v_business or (v_key.store_id is not null and v_key.store_id<>p_store_id) then raise exception 'BALCAO_PUBLIC_API_FORBIDDEN'; end if;
  return jsonb_build_object(
    'accounts',coalesce((select jsonb_agg(to_jsonb(x)) from (select a.* from public.balcao_finance_accounts a where a.business_id=v_business and a.store_id=p_store_id order by a.created_at) x),'[]'::jsonb),
    'transactions',coalesce((select jsonb_agg(to_jsonb(x)) from (select t.* from public.balcao_finance_transactions t where t.business_id=v_business and t.store_id=p_store_id order by t.posted_at desc limit 5000) x),'[]'::jsonb),
    'dailyMetrics',coalesce((select jsonb_agg(to_jsonb(x)) from (select d.* from public.balcao_finance_daily_metrics d where d.business_id=v_business and d.store_id=p_store_id order by d.metric_date desc limit 400) x),'[]'::jsonb)
  );
end;$$;
revoke all on function public.balcao_public_finance_snapshot(uuid,uuid,uuid) from public;
grant execute on function public.balcao_public_finance_snapshot(uuid,uuid,uuid) to anon,authenticated,service_role;

create or replace function public.balcao_public_pricing_history(p_api_key_id uuid,p_store_id uuid,p_installation_id uuid,p_limit integer default 200)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_business uuid;v_key public.balcao_api_keys%rowtype;
begin
  v_business:=private.balcao_automation_capability(p_store_id,p_installation_id);
  select * into v_key from public.balcao_api_keys where id=p_api_key_id and status='active' and approval_status='approved' and 'pricing:read'=any(scopes) and (expires_at is null or expires_at>now());
  if v_business is null or v_key.id is null or v_key.business_id<>v_business or (v_key.store_id is not null and v_key.store_id<>p_store_id) then raise exception 'BALCAO_PUBLIC_API_FORBIDDEN'; end if;
  return coalesce((select jsonb_agg(to_jsonb(x)) from (
    select h.* from public.balcao_pricing_history h where h.business_id=v_business and h.store_id=p_store_id order by h.changed_at desc limit greatest(1,least(coalesce(p_limit,200),1000))
  ) x),'[]'::jsonb);
end;$$;
revoke all on function public.balcao_public_pricing_history(uuid,uuid,uuid,integer) from public;
grant execute on function public.balcao_public_pricing_history(uuid,uuid,uuid,integer) to anon,authenticated,service_role;
