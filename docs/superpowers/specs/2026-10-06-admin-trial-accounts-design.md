# Admin Trial Accounts + Pix Capture — Design

Date: 2026-10-06
Status: proposed
Branch: `feature/admin-trial-accounts`

## Goal

Allow an RPG administrator to create a usable Rafa account for a prospect with only:

- person/contact name;
- commerce/store name;
- WhatsApp number.

The prospect must be able to message Rafa immediately without email, password, Google login, bank connection, Pix key, onboarding, or pre-existing inventory.

The account must use the same production inventory, sales, Rafa, and WhatsApp code paths as a normal merchant. A trial account is only a different creation/lifecycle state, not a second product or database.

While the business has no Pix key, Rafa should answer the user's actual request first and then append a short reminder asking for the Pix key. If the user explicitly sends a Pix key in free text, Rafa validates and stores it in the current business. Once stored, Pix reminders stop.

## Current architecture confirmed

### Admin

- `/admin` is served by `app/admin/page.tsx`.
- Admin authentication uses the existing `ADMIN_COOKIE` / `verifyAdminSession` flow.
- The dashboard UI is `app/admin/AdminDashboard.tsx` and currently has tabs such as Convites, Contas, and Custos e uso.
- Admin write APIs use server routes protected by `isAdminRequest`, for example `app/api/admin/settings/route.ts`.
- `lib/admin/metrics.ts` already loads businesses, stores, WhatsApp bindings, billing, bank status, sales, and users with the server-side admin Supabase client.

### Business/store data

Current production tables already provide the core fields:

- `balcao_businesses`
  - `id uuid` default `gen_random_uuid()`
  - `display_name text not null`
  - `phone text`
  - `pix_key text`
  - `created_by uuid` nullable
  - `active boolean`
  - `rafa_welcomed_at timestamptz`
  - timestamps and other onboarding fields
- `inventory_v1_stores`
  - `id uuid` default `gen_random_uuid()`
  - `installation_id uuid not null`, unique, no DB default
  - `display_name text not null`
  - `business_id uuid`
  - `active boolean`
- `wa_store_bindings`
  - primary/unique key is `wa_id`
  - maps one WhatsApp number to one `store_id`
- `whatsapp_sessions`
  - primary/unique key is `wa_id`
  - may hold `store_id` and conversational payload

There is currently no unique index on `balcao_businesses.phone`, so duplicate-phone protection must be explicit and transaction-safe.

### Rafa / WhatsApp

- Evolution webhook: `app/api/whatsapp/evolution/route.ts`.
- Common inbound processor: `lib/whatsapp-inbound.ts`.
- Store resolution: `resolveRafaStore()` / `phoneStores()` in `lib/rafa-agent.ts`.
- `phoneStores()` already checks `balcao_businesses.phone`, then maps the business to active `inventory_v1_stores`.
- Rafa 3.0 path: `lib/rafa-brain.ts`.
- Legacy agent path: `lib/rafa-agent.ts`.

This means an admin-created business will already be discoverable by WhatsApp if it has a normalized phone plus an active inventory store. We should preserve this mechanism rather than create a special lookup system.

## Proposed data model

### `balcao_businesses` additions

Add lifecycle metadata to the existing business row:

- `account_origin text not null default 'self_signup'`
  - allowed values initially: `self_signup`, `admin_trial`
- `primary_contact_name text null`
  - used for admin-created trials before an Auth user exists
- `trial_converted_at timestamptz null`
  - set when an `admin_trial` is converted to the normal account lifecycle

Do not create a fake Supabase Auth user for a trial.

Do not create a separate trial-business table, trial inventory, or trial sales table.

### Phone uniqueness

Store business phone in one canonical normalized form: Brazilian E.164 digits, e.g. `5511999999999`.

Before trial creation, check the normalized last 10/11 local digits against:

1. active `balcao_businesses.phone`;
2. `balcao_profiles.phone` belonging to active business members;
3. `wa_store_bindings.wa_id`;
4. any existing active/incomplete business that would resolve to the same WhatsApp identity.

Creation must fail with a clear conflict response showing the already-linked business when possible.

Because application-only checks race, the implementation should also add a normalized-phone database uniqueness mechanism for business-level direct phone ownership. Preferred implementation: a stored normalized phone column or immutable normalization function plus a partial unique index on active businesses. The final migration must be chosen only after checking current production duplicates and must not fail deployment on existing dirty data.

## Trial creation transaction

New admin API: `POST /api/admin/trial-accounts`.

Input:

```json
{
  "contactName": "Carlos",
  "businessName": "Mercadinho Avenida",
  "phone": "(11) 99999-9999"
}
```

Server behavior:

1. Require existing admin session with `isAdminRequest`.
2. Trim/validate contact and business names.
3. Normalize phone with the same canonical function used by WhatsApp.
4. Run collision checks.
5. Create one `balcao_businesses` row:
   - `display_name = businessName`
   - `phone = normalized phone`
   - `pix_key = null`
   - `created_by = null`
   - `account_origin = 'admin_trial'`
   - `primary_contact_name = contactName`
   - `active = true`
6. Create one active `inventory_v1_stores` row using the same `business_id` and display name.
   - Generate `installation_id` server-side with a real UUID because the current column is required and has no default.
   - This UUID is only an inventory installation identifier; it is not a fake Auth user.
7. Create/upsert `wa_store_bindings` for the normalized WhatsApp number and new store.
8. Do not create billing, bank connection, Auth user, coupon, or Pix payment rows.
9. Return the created business/store IDs and status.

The business + store + binding creation must be atomic. Preferred: one server-side database function/RPC or transaction-capable database operation with explicit admin-only invocation. Do not leave a half-created trial if store/binding creation fails.

## Admin UI

Add a dedicated `testes` tab to the existing `/admin` dashboard labeled `Contas teste`.

### Create form

Fields only:

- Nome da pessoa
- Nome do comércio
- WhatsApp

Action:

- `Criar conta teste`

No CNPJ, email, password, address, Pix, bank, inventory, SumUp, or onboarding fields.

### Trial list

Columns:

- Comércio
- Pessoa
- WhatsApp
- Pix (`Cadastrado` / `Não cadastrado`)
- Status (`Teste`, later `Convertida`/`Desativada` if retained in list)
- Última interação
- Criada em
- Ações

Initial actions in this scope:

- Editar contact/business name and phone safely
- Desativar

Conversion support is designed now but may be a separate UI action if the normal-account handoff flow needs additional product decisions.

`lib/admin/metrics.ts` should expose trial rows without relying on Supabase Auth for `ownerName`; use `primary_contact_name` as the first source for admin trials.

## WhatsApp identification and first contact

No new identification path is necessary.

The existing `phoneStores()` already matches `balcao_businesses.phone` and resolves the active inventory store. Creation also writes `wa_store_bindings`, making lookup deterministic immediately.

For an admin trial:

- a first `Oi` resolves to the newly created store;
- Rafa should use `primary_contact_name` when helpful, but must not depend on that name for authorization;
- normal Rafa tools operate against the same `storeId` as any other business.

Example first response:

> Oi, Carlos! Esse número está registrado no Mercadinho Avenida. Como posso te ajudar hoje?
>
> Ah, ainda estou sem sua chave Pix. Sua chave serve para receber pagamentos. A Rafa não precisa da sua senha, código do banco ou qualquer outro dado bancário. Se quiser, pode me mandar sua chave aqui.

Exact microcopy may be shortened to respect Rafa's 6-line response rule.

## Pix reminder behavior

Canonical source of truth: `balcao_businesses.pix_key` for the business backing the current store.

If it is null/blank:

1. answer the user's actual request first;
2. append one short Pix reminder at the end whenever the response path supports it;
3. do not block inventory, product, sales, or other non-Pix functionality;
4. do not request bank password, token, SMS code, login, card data, or other banking secrets.

Preferred shared helper:

- `lib/rafa-pix.ts`
  - resolve `storeId -> businessId -> pix_key`
  - format reminder
  - detect/store keys

Both `lib/rafa-brain.ts` and `lib/rafa-agent.ts` should use the same helper. Fast/direct reply paths in `lib/whatsapp-inbound.ts` that bypass both agents should use the helper where practical so reminders are not silently skipped.

No cooldown is required by the requested behavior. The reminder stops immediately after a valid Pix key is stored.

Do not append the reminder when:

- the current message itself is successfully registering the Pix key;
- the current reply is already asking/confirming a Pix key;
- adding it would corrupt a confirmation or machine-sensitive payload.

## Free-text Pix capture

Before normal conversational routing, inspect text for an explicit Pix-key statement.

Examples that should be eligible for direct capture:

- `minha chave pix é loja@exemplo.com`
- `pix: 12345678909`
- `minha chave é 550e8400-e29b-41d4-a716-446655440000`
- `usa essa chave pix +5511999999999`

Supported types:

- CPF
- CNPJ
- Brazilian phone number
- email
- EVP/random Pix key (UUID format)

Validation must be deterministic server-side:

- CPF/CNPJ: normalize digits and validate check digits;
- phone: normalize to accepted Pix phone format;
- email: syntactic validation and reasonable length limits;
- EVP: UUID syntax validation.

### Ambiguity rule

Do not treat arbitrary personal data as Pix merely because it resembles a key.

Example:

`meu telefone é 11999999999`

must not be auto-saved as Pix. If the user appears to be offering the number as Pix but intent is not explicit, ask:

> Quer usar esse número como sua chave Pix?

Direct auto-save requires explicit Pix/key context plus one unambiguous valid candidate.

### Save behavior

When a valid explicit key is captured:

1. resolve the current `storeId` and its `business_id`;
2. update only that business's `balcao_businesses.pix_key`;
3. confirm the stored key in a masked or minimally exposed form where appropriate;
4. stop future Pix reminders immediately.

Do not duplicate the key into a trial-only table.

If current checkout code still mirrors Pix into `balcao_profiles.pix_key`, do not add a second write until code inspection proves it is required. Business-level `pix_key` is the canonical target for this feature.

## Editing a trial

Admin edits must be server-side and admin-authenticated.

Changing the phone must:

1. normalize the new phone;
2. run the same collision checks as creation;
3. update `balcao_businesses.phone`;
4. move the `wa_store_bindings` row atomically from old number to new number;
5. clear/migrate the old `whatsapp_sessions` association as needed so old number no longer resolves to the store.

Do not instruct the admin to manually edit identity/linkage fields in Supabase as a normal workflow.

## Deactivation

Deactivation should mark the business/store inactive and remove or invalidate the direct WhatsApp binding. Historical inventory, sales, and messages remain intact.

A deactivated trial must no longer resolve through Rafa.

## Conversion to normal account

Conversion must preserve the existing `balcao_businesses.id` and `inventory_v1_stores.id` so all inventory, sales, Rafa history, and integrations remain attached.

Target transition:

`account_origin = 'admin_trial'` -> normal/self-service lifecycle, setting `trial_converted_at`.

The future signup/linking flow should attach a real Auth user as business member/owner instead of creating a new business. Never copy inventory into a replacement business.

## Security

- Keep Supabase service-role access server-only through the existing admin client.
- Never expose service-role credentials to `AdminDashboard.tsx` or other browser code.
- Every `/api/admin/trial-accounts` mutation requires the existing admin-session check.
- Any new public-schema columns/tables/functions must follow current RLS/Data API posture after inspecting existing policies.
- A privileged DB function, if used for atomic trial creation, must not be publicly executable by `anon`/`authenticated`; revoke default `PUBLIC` execution and expose it only through the trusted server path.
- Do not use user-editable JWT metadata for admin authorization.

## Error handling / idempotency

Creation errors must be explicit:

- invalid phone
- phone already linked
- missing contact name
- missing business name
- database creation failure

A double click/retry must not create two businesses for the same normalized phone.

If business creation succeeds but store/binding fails, the whole transaction must roll back.

Pix capture must be idempotent: receiving the same key twice leaves the same value and returns a normal confirmation.

## Tests

### Pure/unit tests

- Brazilian phone normalization
- CPF validation
- CNPJ validation
- email Pix parsing
- EVP UUID parsing
- explicit Pix-intent detection
- `meu telefone é ...` does not auto-save
- duplicate key/candidate ambiguity
- reminder formatting

### Server/API tests

- admin auth required
- trial creation produces business + store + binding
- no Auth user created
- `pix_key` starts null
- duplicate phone rejected
- phone edit moves binding
- deactivate stops resolution

### Rafa integration tests

- trial phone resolves via `resolveRafaStore`
- inventory question works with empty inventory
- answer is produced before Pix reminder
- reminder appears while `pix_key` is null
- explicit valid Pix message stores key
- next normal response contains no reminder
- ambiguous phone message asks before saving
- malformed Pix candidate is rejected without overwriting existing data
- both Rafa 3.0 and legacy agent behave consistently

## Migration/deployment sequence

1. Audit existing normalized-phone duplicates in production.
2. Add lifecycle/contact columns and safe phone-uniqueness mechanism.
3. Add server trial-account service/API.
4. Add admin `Contas teste` UI.
5. Add shared Pix parser/reminder/storage helper.
6. Wire helper into Rafa 3.0, legacy Rafa, and important direct reply paths.
7. Add tests.
8. Run DB/security advisors and application test suite.
9. Deploy code/schema together in an order that keeps old accounts valid.
10. Create one internal trial number and verify end-to-end before broader use.

## Non-goals

This feature does not:

- create a second trial inventory system;
- create fake Auth users;
- require Pix before using Rafa;
- require bank connection;
- add SumUp/card onboarding;
- change normal-account behavior except for shared, safe Pix parsing/reminder code where applicable;
- erase historical data when a trial is converted or deactivated.

## Implementation acceptance criteria

The feature is complete when an admin can create `Carlos / Mercadinho Avenida / +55...` from `/admin`, Carlos can immediately message Rafa and use normal inventory/sales features, Rafa keeps appending the Pix reminder while the business has no key, `minha chave pix é ...` stores a valid key in the correct business, reminders stop on the very next response, duplicate WhatsApp identities are prevented, and no fake Auth user or duplicate trial data model is introduced.
