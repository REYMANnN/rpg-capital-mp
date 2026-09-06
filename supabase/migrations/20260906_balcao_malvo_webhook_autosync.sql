-- BALCÃO Malvo automatic synchronization.
-- Malvo authenticates at the Next.js webhook with MALVO_WEBHOOK_SECRET.
-- This RPC performs the privileged database mutation without requiring a
-- Supabase service-role secret in Vercel. It never accepts tenant ids from the
-- caller: business/store are derived from the Malvo clientUserId and must match
-- an already-persisted Malvo connection.

create or replace function public.balcao_process_malvo_webhook(
  p_event_id uuid,
  p_event_type text,
  p_item_id text,
  p_client_user_id text,
  p_triggered_by text default null,
  p_payload jsonb default '{}'::jsonb,
  p_snapshot jsonb default null,
  p_transaction_ids jsonb default '[]'::jsonb,
  p_error_code text default null,
  p_error_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict error
declare
  v_business_id uuid;
  v_store_id uuid;
  v_connection_id uuid;
  v_connection_business_id uuid;
  v_connection_store_id uuid;
  v_account jsonb;
  v_transaction jsonb;
  v_account_id uuid;
  v_now timestamptz := now();
  v_account_count integer := 0;
  v_transaction_count integer := 0;
  v_status text;
  v_institution_name text;
  v_institution_logo_url text;
  v_execution_status text;
  v_consent_expires_at timestamptz;
  v_last_synced_at timestamptz;
begin
  if p_event_id is null
     or nullif(btrim(coalesce(p_event_type, '')), '') is null
     or nullif(btrim(coalesce(p_item_id, '')), '') is null
     or p_client_user_id !~* '^balcao:[0-9a-f-]{36}:[0-9a-f-]{36}$' then
    raise exception 'BALCAO_INVALID_MALVO_WEBHOOK';
  end if;

  if p_event_type not in (
    'item/created', 'item/updated', 'item/error', 'item/deleted',
    'item/waiting_user_input', 'item/login_succeeded',
    'transactions/created', 'transactions/updated', 'transactions/deleted'
  ) then
    return jsonb_build_object('ok', true, 'ignored', true);
  end if;

  -- The clientUserId is generated server-side by makeMalvoClientUserId().
  -- Derive tenant exclusively from it; never accept business/store from the caller.
  v_business_id := split_part(p_client_user_id, ':', 2)::uuid;
  v_store_id := split_part(p_client_user_id, ':', 3)::uuid;

  select c.id, c.business_id, c.store_id
    into v_connection_id, v_connection_business_id, v_connection_store_id
  from public.balcao_finance_connections as c
  where c.provider = 'malvo'
    and c.provider_item_id = p_item_id
    and c.client_user_id = p_client_user_id
  limit 1;

  if v_connection_id is null
     or v_connection_business_id <> v_business_id
     or v_connection_store_id <> v_store_id
     or not exists (
       select 1
       from public.inventory_v1_stores as s
       where s.id = v_store_id
         and s.business_id = v_business_id
         and s.active
     ) then
    raise exception 'BALCAO_UNKNOWN_MALVO_CONNECTION';
  end if;

  begin
    insert into public.balcao_finance_webhook_events (
      provider, event_id, event_type, provider_item_id, client_user_id, payload, created_at
    ) values (
      'malvo', p_event_id, p_event_type, p_item_id, p_client_user_id,
      coalesce(p_payload, '{}'::jsonb), v_now
    );
  exception
    when unique_violation then -- SQLSTATE 23505: Malvo redelivery, already processed/in-flight.
      return jsonb_build_object('ok', true, 'duplicate', true);
  end;

  begin
    if p_event_type in ('item/created', 'item/updated', 'transactions/created', 'transactions/updated') then
      if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object' then
        raise exception 'BALCAO_MALVO_SNAPSHOT_REQUIRED';
      end if;
      if p_snapshot ->> 'itemId' <> p_item_id
         or p_snapshot ->> 'clientUserId' <> p_client_user_id then
        raise exception 'BALCAO_MALVO_SNAPSHOT_MISMATCH';
      end if;
      if jsonb_typeof(coalesce(p_snapshot -> 'accounts', '[]'::jsonb)) <> 'array'
         or jsonb_typeof(coalesce(p_snapshot -> 'transactions', '[]'::jsonb)) <> 'array' then
        raise exception 'BALCAO_INVALID_MALVO_SNAPSHOT';
      end if;

      v_status := coalesce(nullif(p_snapshot ->> 'status', ''), 'pending');
      if v_status not in ('pending', 'active', 'updating', 'attention', 'error', 'disconnected') then
        raise exception 'BALCAO_INVALID_MALVO_SNAPSHOT';
      end if;
      v_institution_name := nullif(p_snapshot ->> 'institutionName', '');
      v_institution_logo_url := nullif(p_snapshot ->> 'institutionLogoUrl', '');
      v_execution_status := nullif(p_snapshot ->> 'executionStatus', '');
      v_consent_expires_at := nullif(p_snapshot ->> 'consentExpiresAt', '')::timestamptz;
      v_last_synced_at := coalesce(nullif(p_snapshot ->> 'lastSyncedAt', '')::timestamptz, v_now);

      update public.balcao_finance_connections
      set institution_name = v_institution_name,
          institution_logo_url = v_institution_logo_url,
          status = v_status,
          execution_status = v_execution_status,
          consent_expires_at = v_consent_expires_at,
          last_synced_at = v_last_synced_at,
          last_error_code = null,
          last_error_message = null,
          updated_at = v_now
      where id = v_connection_id;

      for v_account in
        select value from jsonb_array_elements(coalesce(p_snapshot -> 'accounts', '[]'::jsonb))
      loop
        if nullif(v_account ->> 'externalId', '') is null then continue; end if;

        insert into public.balcao_finance_accounts (
          business_id, store_id, provider, external_id, institution_name,
          account_name, account_type, masked_number, balance_cents, currency,
          status, source, last_synced_at, created_at, updated_at
        ) values (
          v_business_id,
          v_store_id,
          'malvo',
          v_account ->> 'externalId',
          coalesce(v_institution_name, 'Instituição financeira'),
          nullif(v_account ->> 'accountName', ''),
          nullif(v_account ->> 'accountType', ''),
          nullif(v_account ->> 'maskedNumber', ''),
          coalesce((v_account ->> 'balanceCents')::bigint, 0),
          coalesce(nullif(v_account ->> 'currency', ''), 'BRL'),
          'active',
          'malvo',
          nullif(v_account ->> 'lastSyncedAt', '')::timestamptz,
          v_now,
          v_now
        )
        on conflict (business_id, provider, external_id) do update
        set store_id = excluded.store_id,
            institution_name = excluded.institution_name,
            account_name = excluded.account_name,
            account_type = excluded.account_type,
            masked_number = excluded.masked_number,
            balance_cents = excluded.balance_cents,
            currency = excluded.currency,
            status = 'active',
            source = 'malvo',
            last_synced_at = excluded.last_synced_at,
            updated_at = v_now;

        v_account_count := v_account_count + 1;
      end loop;

      update public.balcao_finance_accounts as a
      set status = 'disconnected', updated_at = v_now
      where a.business_id = v_business_id
        and a.store_id = v_store_id
        and a.provider = 'malvo'
        and not exists (
          select 1
          from jsonb_array_elements(coalesce(p_snapshot -> 'accounts', '[]'::jsonb)) as incoming(value)
          where incoming.value ->> 'externalId' = a.external_id
        );

      for v_transaction in
        select value from jsonb_array_elements(coalesce(p_snapshot -> 'transactions', '[]'::jsonb))
      loop
        if nullif(v_transaction ->> 'externalId', '') is null
           or nullif(v_transaction ->> 'accountExternalId', '') is null
           or nullif(v_transaction ->> 'postedAt', '') is null
           or coalesce((v_transaction ->> 'amountCents')::bigint, 0) = 0 then
          continue;
        end if;

        select a.id into v_account_id
        from public.balcao_finance_accounts as a
        where a.business_id = v_business_id
          and a.store_id = v_store_id
          and a.provider = 'malvo'
          and a.external_id = v_transaction ->> 'accountExternalId'
        limit 1;

        if v_account_id is null then continue; end if;

        insert into public.balcao_finance_transactions (
          business_id, store_id, account_id, external_id, posted_at, amount_cents,
          description, counterparty_name, counterparty_tax_id, category,
          category_confidence, transaction_type, is_internal_transfer, source, created_at
        ) values (
          v_business_id,
          v_store_id,
          v_account_id,
          v_transaction ->> 'externalId',
          (v_transaction ->> 'postedAt')::timestamptz,
          (v_transaction ->> 'amountCents')::bigint,
          coalesce(nullif(v_transaction ->> 'description', ''), 'Movimentação'),
          nullif(v_transaction ->> 'counterpartyName', ''),
          nullif(v_transaction ->> 'counterpartyTaxId', ''),
          coalesce(nullif(v_transaction ->> 'category', ''), 'Outros'),
          null,
          nullif(v_transaction ->> 'transactionType', ''),
          coalesce((v_transaction ->> 'isInternalTransfer')::boolean, false),
          'malvo',
          v_now
        )
        on conflict (account_id, external_id) do update
        set posted_at = excluded.posted_at,
            amount_cents = excluded.amount_cents,
            description = excluded.description,
            counterparty_name = excluded.counterparty_name,
            counterparty_tax_id = excluded.counterparty_tax_id,
            category = excluded.category,
            transaction_type = excluded.transaction_type,
            is_internal_transfer = excluded.is_internal_transfer,
            source = 'malvo';

        v_transaction_count := v_transaction_count + 1;
      end loop;

    elsif p_event_type = 'transactions/deleted' then
      if jsonb_typeof(coalesce(p_transaction_ids, '[]'::jsonb)) <> 'array' then
        raise exception 'BALCAO_INVALID_MALVO_DELETIONS';
      end if;

      delete from public.balcao_finance_transactions as t
      using public.balcao_finance_accounts as a
      where t.account_id = a.id
        and a.business_id = v_business_id
        and a.store_id = v_store_id
        and a.provider = 'malvo'
        and t.external_id in (
          select value #>> '{}'
          from jsonb_array_elements(coalesce(p_transaction_ids, '[]'::jsonb))
        );

    elsif p_event_type = 'item/deleted' then
      update public.balcao_finance_connections
      set status = 'disconnected', updated_at = v_now
      where id = v_connection_id;

      update public.balcao_finance_accounts
      set status = 'disconnected', updated_at = v_now
      where business_id = v_business_id
        and store_id = v_store_id
        and provider = 'malvo';

    elsif p_event_type = 'item/error' then
      update public.balcao_finance_connections
      set status = 'error',
          last_error_code = nullif(p_error_code, ''),
          last_error_message = nullif(p_error_message, ''),
          updated_at = v_now
      where id = v_connection_id;

    elsif p_event_type = 'item/waiting_user_input' then
      update public.balcao_finance_connections
      set status = 'attention', updated_at = v_now
      where id = v_connection_id;
    end if;

    update public.balcao_finance_webhook_events
    set processed_at = v_now
    where provider = 'malvo' and event_id = p_event_id;

    return jsonb_build_object(
      'ok', true,
      'itemId', p_item_id,
      'eventType', p_event_type,
      'triggeredBy', p_triggered_by,
      'accountCount', v_account_count,
      'transactionCount', v_transaction_count
    );
  exception
    when others then
      -- Delete the journal row so the same Malvo eventId can be redelivered.
      delete from public.balcao_finance_webhook_events
      where provider = 'malvo' and event_id = p_event_id;
      return jsonb_build_object('ok', false, 'retry', true, 'error', SQLERRM);
  end;
end;
$$;

revoke all on function public.balcao_process_malvo_webhook(uuid, text, text, text, text, jsonb, jsonb, jsonb, text, text)
  from public;
grant execute on function public.balcao_process_malvo_webhook(uuid, text, text, text, text, jsonb, jsonb, jsonb, text, text)
  to anon, authenticated, service_role;
