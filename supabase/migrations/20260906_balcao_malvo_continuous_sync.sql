-- BALCAO / Malvo resilient continuous synchronization.
-- Runtime provider credentials are encrypted in Vault and are readable only by
-- the Supabase service role used by the dedicated Edge Function.

alter table public.balcao_finance_connections
  add column if not exists last_reconciled_at timestamptz;

create or replace function public.balcao_store_malvo_runtime_secrets(
  p_client_id text,
  p_client_secret text,
  p_webhook_secret text,
  p_webhook_egress_ip text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_value text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'BALCAO_SERVICE_ROLE_REQUIRED';
  end if;

  if nullif(btrim(p_client_id), '') is null
     or nullif(btrim(p_client_secret), '') is null
     or nullif(btrim(p_webhook_secret), '') is null then
    raise exception 'BALCAO_MALVO_SECRETS_REQUIRED';
  end if;

  foreach v_value in array array[p_client_id, p_client_secret, p_webhook_secret] loop
    if v_value is null then raise exception 'BALCAO_MALVO_SECRETS_REQUIRED'; end if;
  end loop;

  select id into v_id from vault.decrypted_secrets where name = 'balcao_malvo_client_id' limit 1;
  if v_id is null then
    perform vault.create_secret(p_client_id, 'balcao_malvo_client_id', 'BALCAO Malvo client id');
  else
    perform vault.update_secret(v_id, p_client_id, 'balcao_malvo_client_id', 'BALCAO Malvo client id');
  end if;

  select id into v_id from vault.decrypted_secrets where name = 'balcao_malvo_client_secret' limit 1;
  if v_id is null then
    perform vault.create_secret(p_client_secret, 'balcao_malvo_client_secret', 'BALCAO Malvo client secret');
  else
    perform vault.update_secret(v_id, p_client_secret, 'balcao_malvo_client_secret', 'BALCAO Malvo client secret');
  end if;

  select id into v_id from vault.decrypted_secrets where name = 'balcao_malvo_webhook_secret' limit 1;
  if v_id is null then
    perform vault.create_secret(p_webhook_secret, 'balcao_malvo_webhook_secret', 'BALCAO Malvo webhook secret');
  else
    perform vault.update_secret(v_id, p_webhook_secret, 'balcao_malvo_webhook_secret', 'BALCAO Malvo webhook secret');
  end if;

  if nullif(btrim(coalesce(p_webhook_egress_ip, '')), '') is not null then
    select id into v_id from vault.decrypted_secrets where name = 'balcao_malvo_webhook_egress_ip' limit 1;
    if v_id is null then
      perform vault.create_secret(p_webhook_egress_ip, 'balcao_malvo_webhook_egress_ip', 'BALCAO Malvo webhook egress IP');
    else
      perform vault.update_secret(v_id, p_webhook_egress_ip, 'balcao_malvo_webhook_egress_ip', 'BALCAO Malvo webhook egress IP');
    end if;
  end if;
end;
$$;

create or replace function public.balcao_get_malvo_runtime_secrets()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce(auth.role(), '');
begin
  if v_role <> 'service_role' then
    raise exception 'BALCAO_SERVICE_ROLE_REQUIRED';
  end if;

  return jsonb_build_object(
    'clientId', (select decrypted_secret from vault.decrypted_secrets where name = 'balcao_malvo_client_id' limit 1),
    'clientSecret', (select decrypted_secret from vault.decrypted_secrets where name = 'balcao_malvo_client_secret' limit 1),
    'webhookSecret', (select decrypted_secret from vault.decrypted_secrets where name = 'balcao_malvo_webhook_secret' limit 1),
    'webhookEgressIp', (select decrypted_secret from vault.decrypted_secrets where name = 'balcao_malvo_webhook_egress_ip' limit 1)
  );
end;
$$;

create or replace function public.balcao_malvo_reconcile_secret_matches(p_secret text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expected text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'BALCAO_SERVICE_ROLE_REQUIRED';
  end if;
  select decrypted_secret into v_expected
  from vault.decrypted_secrets
  where name = 'balcao_malvo_reconcile_secret'
  limit 1;
  return v_expected is not null and p_secret is not null and v_expected = p_secret;
end;
$$;

-- Create the reconciliation credential once. It never appears in source code.
do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'balcao_malvo_reconcile_secret') then
    perform vault.create_secret(
      gen_random_uuid()::text || gen_random_uuid()::text,
      'balcao_malvo_reconcile_secret',
      'BALCAO Malvo reconciliation credential'
    );
  end if;
end
$$;

create or replace function public.balcao_trigger_malvo_reconcile()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
  v_request_id bigint;
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'balcao_malvo_reconcile_secret'
  limit 1;

  if v_secret is null then
    raise exception 'BALCAO_MALVO_RECONCILE_SECRET_MISSING';
  end if;

  select net.http_post(
    url := 'https://kftmhqugsswieuxqznfk.supabase.co/functions/v1/balcao-malvo-ingest',
    body := jsonb_build_object('action', 'reconcile'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-balcao-reconcile-secret', v_secret
    ),
    timeout_milliseconds := 5000
  ) into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function public.balcao_store_malvo_runtime_secrets(text, text, text, text) from public, anon, authenticated;
revoke all on function public.balcao_get_malvo_runtime_secrets() from public, anon, authenticated;
revoke all on function public.balcao_malvo_reconcile_secret_matches(text) from public, anon, authenticated;
revoke all on function public.balcao_trigger_malvo_reconcile() from public, anon, authenticated;

grant execute on function public.balcao_store_malvo_runtime_secrets(text, text, text, text) to service_role;
grant execute on function public.balcao_get_malvo_runtime_secrets() to service_role;
grant execute on function public.balcao_malvo_reconcile_secret_matches(text) to service_role;

-- Reconciliation is a safety net. Webhooks remain the primary real-time path.
-- Every 15 minutes we retry unprocessed journal entries; canonical provider data
-- is only re-read for a connection if it has not been reconciled for 9 hours.
select cron.schedule(
  'balcao-malvo-reconcile',
  '*/15 * * * *',
  'select public.balcao_trigger_malvo_reconcile();'
);
