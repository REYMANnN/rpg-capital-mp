-- Allow Google management to list bank connections from the operational Financeiro
-- screen, where store context may arrive as the current installation instead of storeId.

create or replace function public.balcao_list_finance_connections(
  p_store_id uuid default null,
  p_installation_id uuid default null,
  p_terminal_id uuid default null,
  p_terminal_hash text default null,
  p_session_id uuid default null,
  p_session_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict error
declare
  v_user_id uuid := auth.uid();
  v_store_id uuid;
  v_business_id uuid;
  v_role text;
  v_operational record;
  v_can_manage boolean := false;
  v_allowed boolean := false;
  v_connections jsonb := '[]'::jsonb;
begin
  if v_user_id is not null and (p_store_id is not null or p_installation_id is not null) then
    select s.id, s.business_id, m.role
      into v_store_id, v_business_id, v_role
    from public.inventory_v1_stores as s
    join public.balcao_business_members as m
      on m.business_id = s.business_id
     and m.user_id = v_user_id
     and m.active
    where s.active
      and (
        (p_store_id is not null and s.id = p_store_id)
        or (p_store_id is null and p_installation_id is not null and s.installation_id = p_installation_id)
      )
    limit 1;

    if v_store_id is not null then
      v_allowed := true;
      v_can_manage := v_role in ('owner', 'admin', 'manager');
    end if;
  end if;

  if not v_allowed
     and p_terminal_id is not null
     and p_terminal_hash is not null
     and p_session_id is not null
     and p_session_hash is not null then
    select * into v_operational
    from public.balcao_operational_context(
      p_terminal_id,
      p_terminal_hash,
      p_session_id,
      p_session_hash
    )
    limit 1;

    if v_operational.current_staff_id is not null
       and v_operational.current_session_id is not null
       and (
         v_operational.current_staff_role in ('finance', 'manager')
         or (
           v_operational.current_staff_role = 'custom'
           and coalesce(v_operational.current_custom_permissions, '[]'::jsonb) ? 'analysis.financial'
         )
       ) then
      v_store_id := v_operational.store_id;
      v_business_id := v_operational.business_id;
      v_allowed := true;
      v_can_manage := false;
    end if;
  end if;

  if not v_allowed or v_store_id is null or v_business_id is null then
    raise exception 'BALCAO_FINANCE_FORBIDDEN';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'provider', c.provider,
    'itemId', c.provider_item_id,
    'institutionName', c.institution_name,
    'institutionLogoUrl', c.institution_logo_url,
    'status', c.status,
    'executionStatus', c.execution_status,
    'consentExpiresAt', c.consent_expires_at,
    'lastSyncedAt', c.last_synced_at,
    'errorCode', c.last_error_code,
    'errorMessage', c.last_error_message,
    'createdAt', c.created_at,
    'updatedAt', c.updated_at
  ) order by c.updated_at desc), '[]'::jsonb)
    into v_connections
  from public.balcao_finance_connections as c
  where c.business_id = v_business_id
    and c.store_id = v_store_id;

  return jsonb_build_object(
    'businessId', v_business_id,
    'storeId', v_store_id,
    'canManage', v_can_manage,
    'connections', v_connections
  );
end;
$$;

revoke all on function public.balcao_list_finance_connections(uuid, uuid, uuid, text, uuid, text) from public;
grant execute on function public.balcao_list_finance_connections(uuid, uuid, uuid, text, uuid, text) to anon, authenticated, service_role;
