# Admin Trial Accounts + Pix Capture — Design

Date: 2026-10-06
Status: proposed
Branch: `feature/admin-trial-accounts`

## Goal

Let an RPG administrator create a usable Rafa account for a prospect using only:

- person/contact name;
- commerce/store name;
- WhatsApp number.

The prospect must be able to message Rafa immediately without email, password, Google login, bank connection, Pix key, onboarding, or pre-existing inventory.

The trial must use the same production inventory, sales, Rafa, and WhatsApp paths as a normal merchant. It is a different creation/lifecycle state, not a second product or database.

While the business has no Pix key, Rafa answers the real request first and then appends a short Pix reminder. If the user explicitly sends a valid Pix key in free text, Rafa stores it in the current business and reminders stop immediately.

## Current architecture confirmed

### Admin

- `/admin`: `app/admin/page.tsx`.
- Dashboard UI: `app/admin/AdminDashboard.tsx`.
- Admin session: existing `ADMIN_COOKIE` / `verifyAdminSession` and `isAdminRequest` flow.
- Admin server APIs already follow this pattern, e.g. `app/api/admin/settings/route.ts`.
- `lib/admin/metrics.ts` already loads businesses, stores, WhatsApp bindings, billing, bank, sales, and Auth users with the server-side Supabase admin client.

### Existing data model

`balcao_businesses` already contains:

- `id uuid` with `gen_random_uuid()` default;
- `display_name text not null`;
- `phone text`;
- `pix_key text`;
- nullable `created_by uuid`;
- `active boolean`;
- `rafa_welcomed_at timestamptz`.

`inventory_v1_stores` already contains:

- `id uuid` with `gen_random_uuid()` default;
- `installation_id uuid not null`, unique, with no DB default;
- `display_name text not null`;
- `business_id uuid`;
- `active boolean`.

`wa_store_bindings` maps one unique `wa_id` to one `store_id`.

`whatsapp_sessions` is also keyed by `wa_id` and may hold `store_id` plus conversational payload.

There is no unique index on `balcao_businesses.phone` today.

### Rafa / WhatsApp

- Evolution webhook: `app/api/whatsapp/evolution/route.ts`.
- Common inbound processor: `lib/whatsapp-inbound.ts`.
- Store resolution: `resolveRafaStore()` / `phoneStores()` in `lib/rafa-agent.ts`.
- `phoneStores()` already matches `balcao_businesses.phone` and resolves active `inventory_v1_stores`.
- Rafa 3.0 path: `lib/rafa-brain.ts`.
- Legacy agent path: `lib/rafa-agent.ts`.

Therefore an admin-created business can use the existing resolution mechanism as soon as it has a normalized phone, active store, and binding. No special trial resolver is needed.

## Data model changes

Add to `balcao_businesses`:

- `account_origin text not null default 'self_signup'`
  - allowed initial values: `self_signup`, `admin_trial`;
  - immutable provenance: an admin-created account remains `admin_trial` even after conversion.
- `primary_contact_name text null`
  - used before a real Auth owner exists and retained as a useful contact fallback.
- `trial_converted_at timestamptz null`
  - null while still a trial; set when linked into the normal authenticated lifecycle.

Derived trial status:

- `Teste`: `account_origin='admin_trial'`, `active=true`, `trial_converted_at is null`;
- `Convertida`: `account_origin='admin_trial'`, `trial_converted_at is not null`;
- `Desativada`: `account_origin='admin_trial'`, `active=false`.

Do not create a fake Supabase Auth user.

Do not create separate trial inventory, sales, Pix, or business tables.

## Phone normalization and collision safety

Canonical stored business phone: Brazilian E.164 digits, e.g. `5511999999999`.

Before create/edit, compare the same normalized local identity against:

1. active `balcao_businesses.phone`;
2. `balcao_profiles.phone` linked to active business members;
3. `wa_store_bindings.wa_id`;
4. any active/incomplete record that would resolve the same WhatsApp identity.

Production audit on 2026-10-06 found at least one existing normalized-phone collision involving three old test businesses. Therefore a unique constraint must not be added blindly.

Implementation must first handle existing collisions, then add a transaction-safe uniqueness mechanism for direct active business phones. Preferred shape: a canonical normalized-phone column or immutable normalization function plus a partial unique index. Existing dirty test records must be reconciled before enabling that index.

Application-level checks still return a friendly conflict such as `phone_already_linked` and, when safe, the existing business name.

## Trial creation

New admin API: `POST /api/admin/trial-accounts`.

Input:

```json
{
  "contactName": "Carlos",
  "businessName": "Mercadinho Avenida",
  "phone": "(11) 99999-9999"
}
```

Server flow:

1. Require `isAdminRequest`.
2. Validate/trim names.
3. Normalize phone with the same canonical phone logic used by WhatsApp.
4. Run collision checks.
5. Create `balcao_businesses` with:
   - `display_name = businessName`;
   - `phone = normalized phone`;
   - `pix_key = null`;
   - `created_by = null`;
   - `account_origin = 'admin_trial'`;
   - `primary_contact_name = contactName`;
   - `active = true`.
6. Create one active `inventory_v1_stores` row for that business.
   - Generate a real UUID for required `installation_id`.
   - This is an inventory installation identifier, not an Auth identity.
7. Create/upsert `wa_store_bindings` from normalized WhatsApp to the new store.
8. Do not create billing, bank, Auth user, coupon, or Pix payment rows.
9. Return business/store IDs and status.

Business + store + binding must be atomic. Prefer one database transaction/RPC invoked only by the trusted server. A failure must not leave a half-created trial.

Double-click/retry must not create two businesses for the same phone.

## Admin UI

Add tab `Contas teste` to the existing `/admin` dashboard.

### Create form

Only:

- Nome da pessoa
- Nome do comércio
- WhatsApp
- button `Criar conta teste`

No CNPJ, email, password, address, Pix, bank, inventory, SumUp, or onboarding fields.

### List

Columns:

- Comércio
- Pessoa
- WhatsApp
- Pix: `Cadastrado` / `Não cadastrado`
- Status: `Teste` / `Convertida` / `Desativada`
- Última interação
- Criada em
- Ações

Initial actions:

- Editar
- Desativar

`lib/admin/metrics.ts` must use `primary_contact_name` before falling back to Auth-derived owner names for admin trials.

## WhatsApp identification / first contact

The existing `phoneStores()` path stays authoritative.

Creation writes both `balcao_businesses.phone` and `wa_store_bindings`, so the first incoming message resolves immediately to the new store.

For an admin trial, Rafa may greet with the stored contact name, but the name is presentation only, never authorization.

Expected first-contact style:

> Oi, Carlos! Esse número está registrado no Mercadinho Avenida. Como posso te ajudar hoje?
>
> Ah, ainda estou sem sua chave Pix. Sua chave serve para receber pagamentos. A Rafa não precisa da sua senha, código do banco ou qualquer outro dado bancário. Se quiser, pode me mandar sua chave aqui.

Microcopy may be shortened to preserve Rafa's normal response-length rules.

## Pix reminder

Canonical source of truth: `balcao_businesses.pix_key` for the business behind the current store.

If blank/null:

1. answer the user's actual request first;
2. append one short Pix reminder at the end whenever the response type allows it;
3. never block inventory, product, sales, or unrelated operations;
4. never ask for password, token, SMS code, login, card data, or banking secrets.

Create shared server helper, proposed `lib/rafa-pix.ts`, responsible for:

- `storeId -> businessId -> pix_key` lookup;
- Pix reminder formatting;
- parsing/validation;
- safe Pix storage.

Use the same helper from both `lib/rafa-brain.ts` and `lib/rafa-agent.ts`. Important direct responses in `lib/whatsapp-inbound.ts` that bypass both agents should also apply it when safe.

Requested behavior has no cooldown: while Pix is missing, Rafa may remind after each normal supported interaction. The reminder stops immediately once a valid key is stored.

Do not append a reminder when:

- the current message successfully registers the key;
- Rafa is already asking/confirming a Pix key;
- the response is a confirmation/machine-sensitive payload where an appended paragraph could break the flow.

## Free-text Pix capture

Inspect incoming text before normal conversational routing for explicit Pix-key intent.

Examples eligible for direct capture:

- `minha chave pix é loja@exemplo.com`
- `pix: 12345678909`
- `minha chave é 550e8400-e29b-41d4-a716-446655440000`
- `usa essa chave pix +5511999999999`

Supported deterministic types:

- CPF
- CNPJ
- Brazilian phone
- email
- EVP/random UUID key

Validation:

- CPF/CNPJ: strip punctuation and validate check digits;
- phone: normalize to accepted Pix phone form;
- email: syntax + length bounds;
- EVP: UUID syntax.

### Ambiguity rule

Never store arbitrary personal data merely because it resembles a key.

`meu telefone é 11999999999` must not auto-save as Pix.

If context suggests possible Pix but is not explicit, ask:

> Quer usar esse número como sua chave Pix?

Direct auto-save requires explicit key/Pix context plus exactly one unambiguous valid candidate.

### Save

When valid and explicit:

1. resolve current store and its `business_id`;
2. update only `balcao_businesses.pix_key` for that business;
3. confirm success, exposing no more of the key than needed;
4. future reminders stop immediately.

Do not create or write a trial-specific Pix table.

`balcao_profiles.pix_key` exists, but it must not become a second write target unless implementation inspection proves a current checkout path still requires it. For this feature, business-level `pix_key` is canonical.

## Editing a trial

Admin edits are server-side and admin-authenticated.

A phone change must atomically:

1. normalize/check the new phone;
2. update `balcao_businesses.phone`;
3. move the `wa_store_bindings` association old -> new;
4. clear/migrate old `whatsapp_sessions` state as appropriate;
5. ensure the old number no longer resolves to this store.

Identity/linkage fields should be edited through the Admin UI, not as the normal workflow through manual Supabase edits.

## Deactivation

Mark business/store inactive and invalidate/remove direct WhatsApp binding. Preserve historical inventory, sales, messages, and audit data.

A deactivated trial must no longer resolve through Rafa.

## Conversion to a normal account

Preserve the same `balcao_businesses.id` and `inventory_v1_stores.id`.

Conversion:

- keeps `account_origin='admin_trial'` as provenance;
- sets `trial_converted_at`;
- attaches the real Auth user as the business owner/member;
- leaves inventory, sales, Rafa history, and integrations in place.

Never create a replacement business and copy data into it.

## Security

- Supabase service-role remains server-only.
- Never expose it to `AdminDashboard.tsx` or any browser bundle.
- Every trial-account mutation requires the existing admin-session check.
- Any new public-schema column/function follows the project's RLS/Data API posture.
- If an atomic privileged DB function is used, revoke default `PUBLIC` execution and do not expose it to `anon`/`authenticated`; call only from the trusted server path.
- Do not use user-editable JWT metadata for authorization.

## Error handling / idempotency

Explicit errors:

- `invalid_phone`
- `phone_already_linked`
- `missing_contact_name`
- `missing_business_name`
- `creation_failed`

A failed store/binding step rolls back the business creation.

Receiving the same Pix key twice is idempotent and does not corrupt state.

An invalid or ambiguous candidate never overwrites an existing key.

## Tests

### Unit

- Brazilian phone normalization
- CPF validator
- CNPJ validator
- email Pix parser
- EVP UUID parser
- explicit Pix intent
- `meu telefone é ...` does not auto-save
- ambiguous/multiple candidate rejection
- reminder formatter

### API / DB

- admin auth required
- create => business + store + binding
- no Auth user created
- `pix_key` starts null
- duplicate phone rejected
- concurrent/retried creation does not duplicate
- phone edit moves binding
- deactivate stops resolution
- transaction rolls back on partial failure

### Rafa integration

- trial phone resolves with `resolveRafaStore`
- empty inventory can still be queried normally
- business answer appears before Pix reminder
- reminder appears while Pix is blank
- explicit valid Pix message stores correct business key
- next normal response has no reminder
- ambiguous phone asks before save
- invalid key does not overwrite data
- Rafa 3.0 and legacy agent stay consistent

## Deployment sequence

1. Reconcile existing normalized-phone collisions found in production.
2. Add lifecycle/contact columns and safe phone uniqueness.
3. Add atomic server trial-account creation service/API.
4. Add `Contas teste` Admin UI.
5. Add shared Pix parser/reminder/storage helper.
6. Wire Rafa 3.0, legacy Rafa, and important direct reply paths.
7. Add tests.
8. Run Supabase DB/security advisors and app test suite.
9. Deploy schema/code in backward-compatible order.
10. Create one internal trial and verify end-to-end before broader use.

## Non-goals

- separate trial database or inventory;
- fake Auth users;
- requiring Pix before Rafa works;
- requiring bank connection;
- SumUp/card onboarding;
- deleting history on conversion/deactivation.

## Acceptance criteria

Feature is complete when the admin can create `Carlos / Mercadinho Avenida / +55...` from `/admin`; Carlos can immediately message Rafa and use normal store functions; Rafa keeps appending the Pix reminder while that business has no key; `minha chave pix é ...` stores one valid key in the correct business; reminders stop on the next response; duplicate WhatsApp identities are prevented; and no fake Auth user or duplicate trial data model is introduced.
