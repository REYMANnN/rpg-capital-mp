# WhatsApp Dual Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add shared, auditable WhatsApp consent to the existing site onboarding and a WhatsApp-first onboarding/linking webhook.

**Architecture:** Keep web auth and WhatsApp identity separate but map both to `balcao_businesses`. Add append-only consent events plus WhatsApp onboarding/link sessions. A server-only webhook parses Meta events, updates Supabase, and sends interactive Cloud API replies.

**Tech Stack:** Next.js 16 Route Handlers, TypeScript, Supabase/Postgres, WhatsApp Cloud API, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-16-whatsapp-dual-onboarding-design.md`

## Global Constraints
- Site consent is optional and must not block onboarding.
- `PARAR` revokes proactive WhatsApp permission immediately.
- Existing-account linking requires a verification code; sender number alone is insufficient.
- Server secrets never enter client bundles.
- RLS enabled on all new public tables; anon/authenticated direct writes denied unless explicitly required.

---

### Task 1: Pure WhatsApp behavior
**Files:** Create `lib/whatsapp/onboarding.ts`; Test `tests/accounts/whatsapp-onboarding.test.ts`.

- [ ] Write tests for Brazilian phone normalization, `PARAR`, button IDs, and Meta inbound parsing.
- [ ] Run the test and verify it fails because the module does not exist.
- [ ] Implement minimal pure helpers and constants.
- [ ] Run tests and verify green.

### Task 2: Consent/session schema
**Files:** Create `supabase/migrations/20260916_balcao_whatsapp_dual_onboarding.sql`.

- [ ] Add append-only `balcao_whatsapp_consents`.
- [ ] Add `balcao_whatsapp_sessions` for conversation state and `balcao_whatsapp_link_codes` for existing-account verification.
- [ ] Add indexes, checks, RLS, and grants.
- [ ] Add authenticated RPC for web consent and server-oriented data shape for webhook writes.
- [ ] Run Supabase security/performance advisors after applying the migration.

### Task 3: Site onboarding consent
**Files:** Modify `components/accounts/OnboardingWizard.tsx`; Modify `app/api/balcao/onboarding/route.ts`.

- [ ] Port the existing optional consent checkbox from the Meta branch.
- [ ] Send `whatsappConsent` with onboarding data.
- [ ] After business creation, call `balcao_record_whatsapp_consent` only when checked, using source `onboarding_site` and current copy/version.
- [ ] Verify unchecked onboarding remains unchanged.

### Task 4: Server-only WhatsApp client and webhook
**Files:** Create `lib/supabase/admin.ts`, `lib/whatsapp/cloudApi.ts`, `app/api/whatsapp/webhook/route.ts`.

- [ ] Implement GET verification using `WHATSAPP_VERIFY_TOKEN`.
- [ ] Verify POST signature with `META_APP_SECRET` when configured.
- [ ] Parse inbound text/button events using Task 1 helpers.
- [ ] Implement states: welcome -> create/existing; create -> ask store name -> consent; existing -> issue verification-code flow.
- [ ] Handle `PARAR` before all other states and append revoke event.
- [ ] Send interactive buttons and text via Cloud API.

### Task 5: Verification and promotion
**Files:** Existing CI/build configuration only.

- [ ] Run account tests and production build through GitHub/Vercel.
- [ ] Verify webhook route builds and legal/site routes remain healthy.
- [ ] Apply the reviewed migration to production Supabase and run test queries.
- [ ] Merge/promote the feature branch only after checks are green.