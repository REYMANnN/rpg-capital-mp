-- Maquininha SumUp Solo pela Cloud API (10/10/2026).
-- Conta SumUp do lojista conectada por OAuth (ou chave de API, que já existia),
-- leitores Solo pareados por código, cobrança disparada pela Rafa ou pelo link de vender.

-- 1) Conta SumUp: OAuth além da chave de API. Tokens ficam no Vault.
alter table public.rpg_tap_merchants
  add column if not exists auth_type text not null default 'api_key',
  add column if not exists refresh_secret_id uuid,
  add column if not exists access_expires_at timestamptz,
  add column if not exists scopes text;

do $$ begin
  alter table public.rpg_tap_merchants add constraint rpg_tap_merchants_auth_type_check check (auth_type in ('api_key', 'oauth'));
exception when duplicate_object then null; end $$;

-- 2) Escolha do lojista na etapa "maquininha" do cadastro (para o login lembrar onde parou).
create table if not exists public.rpg_sumup_onboarding (
  store_id uuid primary key references public.inventory_v1_stores(id) on delete cascade,
  status text not null check (status in ('pending', 'signing_up', 'connected', 'skipped')),
  updated_at timestamptz not null default now()
);
alter table public.rpg_sumup_onboarding enable row level security;

-- 3) Maquininhas Solo pareadas (id da SumUp: rdr_...).
create table if not exists public.rpg_sumup_readers (
  id text primary key,
  store_id uuid not null references public.inventory_v1_stores(id) on delete cascade,
  name text not null,
  status text not null default 'processing',
  model text,
  serial text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists rpg_sumup_readers_store_idx on public.rpg_sumup_readers(store_id) where deleted_at is null;
alter table public.rpg_sumup_readers enable row level security;

-- 4) Cobranças na Solo reaproveitam rpg_tap_charges.
alter table public.rpg_tap_charges
  add column if not exists reader_id text,
  add column if not exists client_transaction_id text,
  add column if not exists checkout_id text,
  add column if not exists wa_reply_to text,
  add column if not exists failure_reason text;
create unique index if not exists rpg_tap_charges_client_tx_idx on public.rpg_tap_charges(client_transaction_id) where client_transaction_id is not null;

-- 5) Funções (só o servidor chama; tokens nunca saem do Vault para o navegador).
create or replace function public.rpg_sumup_save_oauth(
  p_store uuid, p_access text, p_refresh text, p_expires_at timestamptz,
  p_merchant text, p_country text, p_scopes text, p_user uuid
) returns void
language plpgsql security definer set search_path = '' as $$
declare v_access uuid; v_refresh uuid; v_business uuid;
begin
  select business_id into v_business from public.inventory_v1_stores where id = p_store;
  select vault_secret_id, refresh_secret_id into v_access, v_refresh from public.rpg_tap_merchants where store_id = p_store;
  if v_access is null then
    v_access := vault.create_secret(p_access, 'rpg_sumup_access_' || p_store::text || '_' || extract(epoch from now())::bigint, 'Token de acesso SumUp (OAuth)');
  else
    perform vault.update_secret(v_access, p_access);
  end if;
  if p_refresh is not null then
    if v_refresh is null then
      v_refresh := vault.create_secret(p_refresh, 'rpg_sumup_refresh_' || p_store::text || '_' || extract(epoch from now())::bigint, 'Refresh token SumUp (OAuth)');
    else
      perform vault.update_secret(v_refresh, p_refresh);
    end if;
  end if;
  insert into public.rpg_tap_merchants(store_id, business_id, sumup_merchant_code, sumup_country, vault_secret_id, refresh_secret_id,
    key_last4, status, connected_by, validated_at, updated_at, auth_type, access_expires_at, scopes)
  values (p_store, v_business, p_merchant, p_country, v_access, v_refresh, right(p_access, 4), 'active', p_user, now(), now(), 'oauth', p_expires_at, p_scopes)
  on conflict (store_id) do update set
    business_id = excluded.business_id,
    sumup_merchant_code = coalesce(excluded.sumup_merchant_code, public.rpg_tap_merchants.sumup_merchant_code),
    sumup_country = coalesce(excluded.sumup_country, public.rpg_tap_merchants.sumup_country),
    vault_secret_id = excluded.vault_secret_id,
    refresh_secret_id = coalesce(excluded.refresh_secret_id, public.rpg_tap_merchants.refresh_secret_id),
    key_last4 = excluded.key_last4, status = 'active',
    connected_by = coalesce(excluded.connected_by, public.rpg_tap_merchants.connected_by),
    validated_at = now(), updated_at = now(), auth_type = 'oauth',
    access_expires_at = excluded.access_expires_at,
    scopes = coalesce(excluded.scopes, public.rpg_tap_merchants.scopes);
end $$;

create or replace function public.rpg_sumup_credentials(p_store uuid)
returns table(auth_type text, access_token text, refresh_token text, access_expires_at timestamptz, merchant_code text, country text)
language sql security definer set search_path = '' as $$
  select m.auth_type, a.decrypted_secret, r.decrypted_secret, m.access_expires_at, m.sumup_merchant_code, m.sumup_country
  from public.rpg_tap_merchants m
  left join vault.decrypted_secrets a on a.id = m.vault_secret_id
  left join vault.decrypted_secrets r on r.id = m.refresh_secret_id
  where m.store_id = p_store and m.status = 'active'
$$;

create or replace function public.rpg_sumup_mark_invalid(p_store uuid)
returns void language sql security definer set search_path = '' as $$
  update public.rpg_tap_merchants set status = 'invalid', updated_at = now() where store_id = p_store
$$;

revoke all on function public.rpg_sumup_save_oauth(uuid, text, text, timestamptz, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.rpg_sumup_credentials(uuid) from public, anon, authenticated;
revoke all on function public.rpg_sumup_mark_invalid(uuid) from public, anon, authenticated;
grant execute on function public.rpg_sumup_save_oauth(uuid, text, text, timestamptz, text, text, text, uuid) to service_role;
grant execute on function public.rpg_sumup_credentials(uuid) to service_role;
grant execute on function public.rpg_sumup_mark_invalid(uuid) to service_role;
