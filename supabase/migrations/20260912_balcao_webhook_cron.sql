-- BALCÃO v11.0 — invoke the webhook outbox dispatcher every minute.
-- Secrets are stored separately in Supabase Vault as:
--   balcao_project_url
--   balcao_webhook_dispatch_secret

create extension if not exists pg_net;
create extension if not exists pg_cron;

select cron.schedule(
  'balcao-webhook-dispatcher',
  '* * * * *',
  $$
    select net.http_post(
      url := (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'balcao_project_url'
        limit 1
      ) || '/functions/v1/balcao-webhook-dispatcher',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-balcao-dispatch-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'balcao_webhook_dispatch_secret'
          limit 1
        )
      ),
      body := jsonb_build_object('scheduledAt', now()),
      timeout_milliseconds := 15000
    ) as request_id;
  $$
);
