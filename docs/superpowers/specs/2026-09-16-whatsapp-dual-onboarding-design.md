# WhatsApp + Site Dual Onboarding Design

## Goal
Allow a merchant to create or connect the same BALCÃO business from either the web onboarding or WhatsApp, while keeping WhatsApp consent auditable and revocable.

## Site entry
The existing onboarding keeps the phone field and gains an optional WhatsApp-consent checkbox. When checked, completion records the business, phone, consent copy/version, source `onboarding_site`, and timestamp. If unchecked, onboarding still completes and no proactive WhatsApp consent exists.

## WhatsApp entry
A webhook identifies the sender by normalized WhatsApp number (`wa_id`). The first message shows two actions: create a new account or connect an existing account. New-account flow asks for store name, creates a BALCÃO business + inventory store owned operationally by that WhatsApp identity, then asks whether proactive stock/daily-summary alerts are allowed. A positive button response records consent with source `whatsapp`; a negative response keeps the account usable without proactive alerts.

For an existing account, the phone is never attached just because it sent a message. The system creates a pending-link request and requires an emailed verification code before setting the WhatsApp identity on the business.

## Consent and revocation
Consent is append/audit oriented. Current state is represented by the newest grant/revoke event per business+phone. The exact copy, policy version, source, timestamps, and Meta message/button identifiers are stored. Inbound `PARAR` (case-insensitive, whitespace-insensitive) revokes proactive messaging immediately. A later explicit opt-in is required to resume.

## Security
Webhook verification uses `WHATSAPP_VERIFY_TOKEN`. POST authenticity is checked using the Meta app secret signature when `META_APP_SECRET` is configured. Server-side database writes use a server secret only; no service secret is exposed to the browser. Public tables use RLS and deny direct anonymous writes.

## Messaging
Replies use WhatsApp Cloud API through `WHATSAPP_PHONE_NUMBER_ID` and `WHATSAPP_ACCESS_TOKEN`. The webhook returns quickly and handles only supported inbound message/button events. Failed outbound calls are logged without leaking tokens.

## Environment
- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `META_APP_SECRET`
- server-side Supabase secret already configured or `SUPABASE_SERVICE_ROLE_KEY`

## Success criteria
- Web onboarding can submit with or without consent.
- A checked web opt-in is persisted against the resulting business.
- First WhatsApp contact receives create/existing-account choices.
- New WhatsApp onboarding creates one business per unlinked number and records opt-in separately.
- `PARAR` creates a revocation event and suppresses proactive eligibility.
- Existing-account linking cannot complete without verification.
- Unit tests cover normalization, commands, consent/revocation, and webhook parsing.
- Next.js production build passes.