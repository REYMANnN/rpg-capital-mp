create or replace function public.balcao_checkout_pix_context(
  p_terminal_id uuid,
  p_terminal_hash text,
  p_session_id uuid,
  p_session_hash text
)
returns table (
  pix_key text,
  merchant_name text,
  merchant_city text
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict error
declare
  v_store_id uuid;
  v_business_id uuid;
  v_role text;
  v_custom jsonb;
  v_now timestamptz := now();
begin
  select t.store_id, s.business_id, a.role, a.custom_permissions
  into v_store_id, v_business_id, v_role, v_custom
  from public.balcao_terminals as t
  join public.inventory_v1_stores as s on s.id = t.store_id
  join public.balcao_staff_sessions as ss on ss.terminal_id = t.id
  join public.balcao_staff_profiles as p on p.id = ss.staff_id
  join public.balcao_staff_store_access as a on a.staff_id = p.id and a.store_id = s.id
  where t.id = p_terminal_id
    and t.credential_hash = p_terminal_hash
    and t.active
    and s.active
    and ss.id = p_session_id
    and ss.session_hash = p_session_hash
    and ss.revoked_at is null
    and ss.expires_at > v_now
    and ss.last_seen_at > v_now - interval '30 minutes'
    and p.active
    and a.active
  limit 1;

  if v_store_id is null or v_business_id is null then
    return;
  end if;

  if not (
    v_role in ('cashier', 'manager')
    or (v_role = 'custom' and coalesce(v_custom, '[]'::jsonb) @> '["checkout.sell"]'::jsonb)
  ) then
    return;
  end if;

  update public.balcao_staff_sessions as ss
  set last_seen_at = v_now
  where ss.id = p_session_id
    and ss.terminal_id = p_terminal_id
    and ss.session_hash = p_session_hash;

  return query
  select b.pix_key, b.display_name, coalesce(nullif(s.city, ''), 'BRASIL')
  from public.balcao_businesses as b
  join public.inventory_v1_stores as s on s.id = v_store_id
  where b.id = v_business_id
    and b.active
  limit 1;
end;
$$;

revoke all on function public.balcao_checkout_pix_context(uuid,text,uuid,text) from public;
grant execute on function public.balcao_checkout_pix_context(uuid,text,uuid,text) to anon, authenticated;
