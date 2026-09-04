# BALCÃO Asaas Billing Design

## Goal
Add paid access to BALCÃO at R$5.99/month per connected bank account while ensuring no new Malvo variable cost is created without corresponding paid revenue.

## Commercial rules
- Price: R$5.99 per connected bank account per month.
- One Asaas subscription per business; subscription amount = bank count for next cycle × R$5.99.
- Initial onboarding charges R$5.99 before the first Malvo connection is allowed.
- Adding a bank after onboarding charges R$5.99 immediately; only after payment confirmation may a new Malvo connection be created. Future monthly subscription increases by R$5.99.
- Removing a bank revokes the Malvo connection immediately, gives no prorated refund for the current period, and reduces only the next monthly subscription by R$5.99.
- Retired/removed paid capacity from a current period is not reusable for a replacement bank; a replacement bank requires a fresh R$5.99 charge.
- Past-due businesses lose application access and may not create/sync Malvo connections. Existing financial and inventory data is retained.

## Test-account bypass
`renanguadalupe05@gmail.com` is the owner test account and must bypass the billing/paywall flow. Billing tables and APIs may still exist, but this email must be treated as allowed without requiring payment. The bypass must be centralized in server-side billing policy and not implemented only in the UI.

## Architecture
- Asaas: customer, card tokenization, recurring subscription, immediate additional-bank charges, payment webhooks.
- Supabase: billing state, payment method token metadata, billing operations, slots/entitlements, webhook journal.
- BALCÃO server: authoritative billing access checks and payment orchestration.
- Malvo: remains Open Finance provider. The existing Malvo connect-token endpoint receives an entitlement check before minting a token.

## Core invariant
For every new Malvo connection created by a non-bypass business there must be a paid billing entitlement. A business without valid billing access must not be able to create a Malvo connect token or manually synchronize Malvo.

## Onboarding flow
1. Existing business onboarding creates business/store as today.
2. If current user is the bypass email, skip payment and show the bank step.
3. Otherwise, if no confirmed initial billing exists, show the billing step.
4. Billing step collects card + holder data and calls a server endpoint.
5. Server ensures Asaas customer, tokenizes card, creates monthly subscription with first due date today and R$5.99 value.
6. Confirmation makes one paid slot available and onboarding refreshes to the bank step.
7. First Malvo connection consumes that slot.
8. Existing onboarding completion still requires at least one bank connection.

## Post-onboarding add bank
- UI button shows R$5.99 immediate charge and the resulting next monthly amount.
- Server creates an idempotent ADD_BANK operation and charges the stored Asaas card token.
- On confirmed payment, server creates an AVAILABLE slot and updates future subscription value.
- Malvo connect-token reserves one available slot before returning a Malvo token.
- Malvo complete attaches the resulting finance connection to the reserved slot and marks it CONNECTED.

## Remove bank
- Existing delete route revokes the remote Malvo Item first.
- Billing slot becomes RETIRED and is not reusable.
- `next_bank_count` is recalculated from non-retired continuing connections.
- Asaas subscription future value is updated; existing current-cycle charge is not refunded.

## Access gate
- `/manage` redirects a non-bypass business without billing access to `/billing`.
- Billing page remains reachable when blocked.
- API-level checks protect Malvo connect and sync; UI hiding alone is insufficient.
- Staff/terminal access should inherit the business block once the server-wide gate is expanded.

## Asaas configuration
Secrets only:
- `ASAAS_API_KEY`
- `ASAAS_WEBHOOK_TOKEN`
- `ASAAS_ENV` (`sandbox` or `production`)
- `BILLING_BYPASS_EMAILS` optional; default includes `renanguadalupe05@gmail.com`
- `BILLING_PRICE_PER_BANK_CENTS` optional; default `599`

Asaas base URLs:
- Sandbox: `https://api-sandbox.asaas.com/v3`
- Production: `https://api.asaas.com/v3`

## Tables
- `balcao_billing_accounts`: one row/business; Asaas IDs, status, counts, amounts, period state, masked payment method metadata.
- `balcao_billing_slots`: paid entitlements with AVAILABLE/RESERVED/CONNECTED/RETIRED states and optional finance connection link.
- `balcao_billing_operations`: idempotent initial/add-bank/monthly/recovery operations.
- `balcao_billing_webhook_events`: unique Asaas event journal.

## Billing status
`pending_setup`, `pending_payment`, `active`, `past_due`, `blocked`, `canceled`.

## Webhooks
Validate `asaas-access-token` using `ASAAS_WEBHOOK_TOKEN`, journal by unique event id, then process payment events idempotently. `PAYMENT_CONFIRMED`/`PAYMENT_RECEIVED` activate confirmed operations. `PAYMENT_OVERDUE`, capture refusal, refund or chargeback move the business into a non-active state as appropriate.

## Security
- Card number/CVV are only accepted transiently by the payment endpoint over HTTPS and sent to Asaas; never persist them.
- Persist only Asaas `creditCardToken`, brand/last4/expiry metadata; token is server-only and never returned to ordinary clients.
- The bypass is server-side and email-normalized.

## V1 UI
- New `OnboardingBillingStep` matching the existing onboarding card/progress visual style.
- New `/billing` page summarizing status, number of billed accounts, current/next amount and payment recovery message.
- `BankConnections` button becomes billing-aware: existing paid available slot opens Malvo; otherwise asks for an immediate R$5.99 add-bank charge before opening Malvo.
- Removal confirmation explains no current-period refund and next-cycle reduction.

## Acceptance criteria
- Bypass email never sees the paywall and can use the existing test flow.
- A new non-bypass account sees payment before the first bank connection.
- No non-bypass user can receive a Malvo connect token without ACTIVE billing and an available/reserved paid slot.
- Adding a bank charges R$5.99 before Malvo and increases next subscription value.
- Removing a bank does not refund current period and decreases next subscription value.
- Duplicate webhook/click processing cannot create duplicate billing effects.
