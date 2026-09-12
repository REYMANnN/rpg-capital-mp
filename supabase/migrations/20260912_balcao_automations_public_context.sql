-- BALCÃO v11.0 hotfix — resolve the current store from the existing installation capability without a Vercel service-role secret.
create or replace function public.balcao_automation_store_context(p_installation_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select jsonb_build_object(
      'storeId', s.id,
      'businessId', s.business_id,
      'displayName', s.display_name
    )
    from public.inventory_v1_stores s
    where s.installation_id = p_installation_id
      and s.active
      and s.business_id is not null
    limit 1
  ), '{}'::jsonb);
$$;

revoke all on function public.balcao_automation_store_context(uuid) from public;
grant execute on function public.balcao_automation_store_context(uuid) to anon, authenticated, service_role;
