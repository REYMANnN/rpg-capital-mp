# BALCÃO Asaas Billing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Asaas billing at R$5.99 per connected bank account, protect Malvo cost creation behind paid entitlements, and bypass billing for `renanguadalupe05@gmail.com`.

**Architecture:** Add a focused billing domain (`lib/billing`) and Asaas client (`lib/asaas`), persist billing state in Supabase, insert a payment step into the existing onboarding, and enforce billing server-side before Malvo connect/sync. Payment webhooks are authoritative and idempotent.

**Tech Stack:** Next.js 16, React 19, TypeScript, Supabase/Postgres, Asaas REST API, Malvo existing integration, node:test source-contract tests.

**Spec:** `docs/superpowers/specs/2026-09-04-balcao-asaas-billing-design.md`

## Global Constraints
- Price defaults to exactly 599 cents per bank account/month.
- `renanguadalupe05@gmail.com` bypasses billing server-side.
- No card PAN/CVV persistence.
- No Malvo connect token for non-bypass businesses without a paid entitlement.
- Adding a bank charges before Malvo; removing reduces only the next cycle.
- No direct writes to `master`; implementation branch is `feat/balcao-asaas-billing-v2`.

---

### Task 1: Billing contract tests
**Files:**
- Create: `tests/accounts/billingIntegration.test.ts`

**Interfaces:**
- Consumes: repository source files.
- Produces: source-level regression contract for schema, Asaas client, bypass, onboarding, Malvo entitlement and UI.

- [ ] Write assertions for the migration, `lib/billing`, `lib/asaas`, onboarding billing component, `/billing`, webhook, and Malvo gate.
- [ ] Verify the test is red because production files are missing.

### Task 2: Billing persistence and pricing policy
**Files:**
- Create: `supabase/migrations/20260904_balcao_asaas_billing.sql`
- Create: `lib/billing/config.ts`
- Create: `lib/billing/access.ts`

**Interfaces:**
- Produces: `BANK_PRICE_CENTS`, `isBillingBypassEmail(email)`, `getBusinessBillingState(...)`, `assertPaidBankEntitlement(...)`.

- [ ] Create billing account, slot, operation and webhook tables with indexes/RLS.
- [ ] Add billing RPCs for member-readable state and atomic slot reservation/attachment/retirement.
- [ ] Centralize 599-cent price and normalized bypass list.
- [ ] Implement server billing state lookup and bypass handling.

### Task 3: Asaas server client
**Files:**
- Create: `lib/asaas/client.ts`

**Interfaces:**
- Produces: `ensure/create customer`, `tokenizeCreditCard`, `createSubscription`, `createCardPayment`, `updateSubscriptionValue`.

- [ ] Implement sandbox/production base URL selection.
- [ ] Use `access_token` header, JSON requests, sanitized provider errors and >=60s request timeout.
- [ ] Never log card data.

### Task 4: Initial onboarding payment
**Files:**
- Create: `app/api/balcao/billing/onboarding/pay/route.ts`
- Create: `components/accounts/OnboardingBillingStep.tsx`
- Modify: `app/onboarding/page.tsx`

**Interfaces:**
- POST consumes card/holder fields and current authenticated business.
- Success persists Asaas customer/subscription/token metadata, ACTIVE billing state and one AVAILABLE slot.

- [ ] Require owner/member and existing business.
- [ ] For bypass email return success without Asaas.
- [ ] Create customer/token/subscription with `nextDueDate=today` and value 5.99.
- [ ] Persist provider identifiers with admin client.
- [ ] Add UI step before existing bank step.

### Task 5: Billing status/paywall
**Files:**
- Create: `app/billing/page.tsx`
- Create: `app/api/balcao/billing/route.ts`
- Modify: `app/manage/page.tsx`

**Interfaces:**
- GET returns safe billing summary only; never card token.

- [ ] Redirect non-bypass non-active businesses from `/manage` to `/billing`.
- [ ] Keep bypass account allowed.
- [ ] Render current/next amount and status.

### Task 6: Malvo paid-entitlement gate
**Files:**
- Modify: `app/api/balcao/finance/malvo/connect-token/route.ts`
- Modify: `app/api/balcao/finance/malvo/complete/route.ts`
- Modify: `app/api/balcao/finance/malvo/sync/route.ts`

**Interfaces:**
- `connect-token` atomically reserves an AVAILABLE slot for non-bypass users.
- `complete` attaches reserved slot to saved finance connection.

- [ ] Reject unpaid/no-slot requests with HTTP 402.
- [ ] Bypass owner test email skips entitlement requirement.
- [ ] Reject manual sync for past-due/blocked businesses.

### Task 7: Add-bank immediate charge
**Files:**
- Create: `app/api/balcao/billing/banks/add/route.ts`
- Modify: `app/inventory-v1/finance/BankConnections.tsx`

**Interfaces:**
- POST creates an idempotent ADD_BANK operation, charges 599 cents via stored token, creates AVAILABLE slot and updates future subscription amount.

- [ ] Show explicit R$5.99 confirmation before payment.
- [ ] Only call Malvo after billing endpoint succeeds.
- [ ] On provider failure, do not call Malvo.

### Task 8: Remove-bank next-cycle reduction
**Files:**
- Modify: `app/api/balcao/finance/connections/[id]/route.ts`
- Modify: `app/inventory-v1/finance/BankConnections.tsx`

**Interfaces:**
- After successful Malvo deletion, retire linked slot and update future Asaas subscription amount.

- [ ] No refund/current-period change.
- [ ] UI copy states next monthly reduction of R$5.99.
- [ ] Retired slot is never reusable.

### Task 9: Asaas webhook
**Files:**
- Create: `app/api/balcao/billing/asaas/webhook/route.ts`

**Interfaces:**
- Validates `asaas-access-token` against `ASAAS_WEBHOOK_TOKEN`.
- Journals unique event ID and updates billing state/operations idempotently.

- [ ] `PAYMENT_CONFIRMED`/`PAYMENT_RECEIVED` activate matching payment state.
- [ ] `PAYMENT_OVERDUE`/capture refusal mark past due and block new Malvo activity.
- [ ] Refund/chargeback mark blocked for safety.

### Task 10: Verification
- [ ] Run billing contract test.
- [ ] Run existing accounts/Malvo tests.
- [ ] Run TypeScript/Next build through available CI/deployment status.
- [ ] Inspect changed files and verify no secret/card data entered source control.
- [ ] Open a draft PR only after verification passes or clearly document any environment-only blocker.
