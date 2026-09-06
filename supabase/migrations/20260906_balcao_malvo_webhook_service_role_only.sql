-- The public-schema RPC is invoked only by the authenticated Supabase Edge Function.
-- Vercel authenticates to that Edge Function with its deployment OIDC identity.
revoke all on function public.balcao_process_malvo_webhook(uuid, text, text, text, text, jsonb, jsonb, jsonb, text, text)
  from public, anon, authenticated;
grant execute on function public.balcao_process_malvo_webhook(uuid, text, text, text, text, jsonb, jsonb, jsonb, text, text)
  to service_role;
