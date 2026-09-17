# BALCÃO Dual Onboarding (Site + WhatsApp) Design

## Goal

Make the website and WhatsApp two entry points into the same BALCÃO business/store model, with auditable WhatsApp consent, secure account linking, opt-out by `PARAR`, and a clean path to billing.

## Approved product behavior

### Website onboarding

The current Google-authenticated onboarding stays the primary browser flow. The phone step includes an optional, unchecked WhatsApp consent checkbox that clearly names RPG Capital. Submitting onboarding stores the business phone as today and, when checked, records an immutable consent event with the phone, business, authenticated user, exact consent text, policy version, source, and timestamp.

Not accepting WhatsApp alerts never blocks account creation.

### WhatsApp onboarding

An inbound WhatsApp message identifies the sender by Meta `wa_id` / `message.from`. For a number not yet linked to a BALCÃO business, the bot replies with two buttons:

- `Criar minha conta`
- `Já tenho conta`

`Criar minha conta` asks for the store name, then asks:

> Posso te mandar avisos de estoque baixo e o resumo do dia por aqui?

with buttons:

- `Sim, pode mandar`
- `Agora não`

The store/business is created after that choice. The inbound WhatsApp number is saved as the WhatsApp identity for the business. A positive answer records the same consent audit shape used by the website; `Agora não` creates the business without proactive-message consent.

The initial WhatsApp-created business may have no `created_by` Google user and no `balcao_business_members` row. That is intentional: operations performed through the WhatsApp webhook are authorized by the verified WhatsApp identity, not by a browser session.

### Existing account linking

`Já tenho conta` must never attach a phone to a business merely because the sender knows an email or business name. The bot creates a short-lived link request and returns a URL to the RPG app. The user must sign in with the existing Google account in the site and approve the pending WhatsApp number. The server then verifies the logged-in user is an active owner/admin of the selected business before linking the `wa_id`.

This gives the requested “code/app confirmation” property without trusting a WhatsApp-provided email.

### Opt-out

Incoming `PARAR` (and conservative equivalents such as `STOP` and `CANCELAR`) immediately revokes proactive WhatsApp consent for that number/business and records the revocation timestamp. The bot confirms the opt-out. Operational replies to a new user-initiated conversation remain possible, but proactive alerts are not sent until the user explicitly opts in again.

### Identity and account model

- Browser identity: Supabase Auth user (Google).
- WhatsApp identity: normalized Meta `wa_id`.
- Shared account: `balcao_businesses` and the store(s) under it.
- A WhatsApp identity can be linked to at most one active business at a time.
- A business may exist with only a WhatsApp identity and later gain a browser owner/admin.
- A website-created business may later gain a WhatsApp identity through the secure linking flow.

## Data model

### `balcao_whatsapp_contacts`

Current-state record per WhatsApp identity:

- `wa_id` primary key, digits only
- `phone_e164`
- optional `business_id`
- optional `user_id`
- `state` for onboarding/link state machine
- `pending_business_name`
- `consent_current` boolean
- `consent_version`
- `consent_updated_at`
- `created_at`, `updated_at`

RLS enabled. No direct anon/authenticated writes. Reads are restricted to authenticated users who are members of the linked business. Backend webhook access uses a server-only Supabase secret key.

### `balcao_whatsapp_consents`

Append-only audit events:

- `business_id`
- optional authenticated `user_id`
- `wa_id`
- `phone_e164`
- `status` = `granted` or `revoked`
- exact `consent_text`
- `policy_version`
- `source` (`onboarding_site`, `onboarding_whatsapp`, `whatsapp_reoptin`, `whatsapp_stop`)
- `event_at`

### `balcao_whatsapp_link_requests`

Short-lived website approval tokens:

- random token hash, never raw token
- `wa_id`
- expiry
- `used_at`
- optional final `business_id` / approving `user_id`

The bot receives the raw one-time token only long enough to construct the HTTPS approval URL. The database stores only the hash.

## Server components

### Supabase admin client

Create a server-only Supabase client using `SUPABASE_SECRET_KEY` (preferred) or legacy `SUPABASE_SERVICE_ROLE_KEY` as fallback. It must never use a `NEXT_PUBLIC_` variable.

### WhatsApp Cloud API client

Server-only helper reads:

- `META_WHATSAPP_ACCESS_TOKEN`
- `META_WHATSAPP_PHONE_NUMBER_ID`
- `META_WHATSAPP_GRAPH_VERSION` (default can be overridden)
- `META_WHATSAPP_VERIFY_TOKEN`

It sends text and interactive reply-button messages using the Cloud API `/messages` endpoint.

### Webhook route

`GET /api/whatsapp/webhook` implements Meta verification (`hub.mode`, `hub.verify_token`, `hub.challenge`).

`POST /api/whatsapp/webhook`:

1. Extract inbound messages only; ignore status-only webhooks.
2. Deduplicate by Meta message id.
3. Normalize `wa_id`.
4. Process `PARAR` before normal state handling.
5. Resolve current WhatsApp contact state.
6. Run the onboarding/link state machine.
7. Persist state changes before/with the reply so retries are safe.

A webhook delivery table stores processed message ids for idempotency.

## State machine

- `new` / no row -> show entry buttons; save `awaiting_entry_choice`.
- `awaiting_entry_choice` + create button -> `awaiting_business_name`.
- `awaiting_business_name` + text -> save name, move to `awaiting_consent`, show consent buttons.
- `awaiting_consent` + yes/no -> atomically create business/store if needed, link `wa_id`, optionally record consent, move to `active`.
- `awaiting_entry_choice` + existing-account button -> create link request, move to `awaiting_link`, send secure app URL.
- `awaiting_link` -> normal messages explain that approval is pending; site approval moves state to `active`.
- `active` -> normal product assistant can handle inventory/sales in later feature work; this implementation returns a simple ready/help response for unrelated messages.

## Website linking page

`/whatsapp/vincular?token=...` requires the existing Google login. After authentication it resolves the token, determines the user’s active businesses, and allows/executes approval only for a business where the user is owner/admin. The API consumes the request exactly once and links the WhatsApp identity.

## Billing/trial boundary

This change records a WhatsApp onboarding source and creates the same business/store model used by billing. It does not collect card data inside WhatsApp. A future/scheduled billing message must use an approved WhatsApp template outside the 24-hour service window and link to the existing RPG/Asaas browser billing flow. Until paid, policy enforcement can keep the WhatsApp channel read-only; the data model must not require a second business/account.

## Security and compliance

- Never trust an email typed in WhatsApp to authorize linking.
- Never expose Supabase secret/service-role keys client-side.
- RLS on all public tables.
- Webhook idempotency by Meta message id.
- Link tokens are random, short-lived, hashed at rest, single-use.
- Consent events are append-only.
- `PARAR` is processed before any other command/state.
- Do not request card data or sensitive identity documents over WhatsApp.
- Proactive messages require current consent; messages outside the 24h user-initiated window use approved templates.

## Success criteria

1. Existing web onboarding still succeeds with or without the optional checkbox.
2. Checked web consent writes an audit event and current consent state.
3. First inbound WhatsApp message receives Create/Existing buttons.
4. Create flow produces one business/store and links the sender number without an OTP.
5. Consent yes/no is persisted correctly.
6. `PARAR` revokes consent immediately and idempotently.
7. Existing-account linking cannot succeed without a logged-in owner/admin approval in the site.
8. Duplicate webhook deliveries do not create duplicate businesses or consent events.
9. Build/tests pass and the webhook route can complete Meta GET verification when configured.