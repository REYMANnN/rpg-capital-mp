# BALCÃO Dual WhatsApp Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add auditable WhatsApp opt-in to the existing website onboarding and implement a Meta WhatsApp Cloud API onboarding/linking webhook that creates or securely links the same BALCÃO business/store model.

**Architecture:** Browser onboarding remains Supabase-authenticated. WhatsApp inbound messages are processed by a server-only webhook using a Supabase secret-key client and a small persisted state machine keyed by Meta `wa_id`. Consent events are append-only; current consent/contact state is separate. Existing-account linking requires a logged-in owner/admin approval in the RPG web app.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase Postgres/Auth, `@supabase/supabase-js`, Meta WhatsApp Cloud API, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-16-whatsapp-dual-onboarding-design.md`

## Global Constraints

- Consent checkbox on site is optional and unchecked by default.
- Consent copy must explicitly name RPG Capital and WhatsApp.
- `PARAR` revokes proactive WhatsApp consent immediately.
- Never authorize account linking from an email/business name typed in WhatsApp alone.
- Never expose Supabase secret/service-role or Meta access tokens to the browser.
- WhatsApp-created businesses reuse `balcao_businesses` and `inventory_v1_stores` rather than creating a parallel account model.
- Card data is never collected in WhatsApp.
- Outside the user-initiated 24h window, proactive messages must use approved Meta templates.

---

### Task 1: Consent constants and pure WhatsApp message/state helpers

**Files:**
- Create: `lib/legal/whatsappConsent.ts`
- Create: `lib/whatsapp/types.ts`
- Create: `lib/whatsapp/inbound.ts`
- Test: `tests/accounts/whatsapp-onboarding.test.ts`

**Interfaces:**
- Produces `WHATSAPP_CONSENT_VERSION`, `WHATSAPP_CONSENT_TEXT`, `normalizeWaId()`, `isStopCommand()`, `parseInboundWhatsAppMessages()`, and stable button IDs.

- [ ] Write node tests for normalization, stop commands, text payloads, interactive button replies, and status-only webhook ignoring.
- [ ] Verify tests fail before implementation.
- [ ] Implement minimal pure helpers.
- [ ] Verify tests pass.

### Task 2: Database model and atomic RPCs

**Files:**
- Create: `supabase/migrations/20260916_balcao_whatsapp_dual_onboarding.sql`

**Interfaces:**
- Produces tables `balcao_whatsapp_contacts`, `balcao_whatsapp_consents`, `balcao_whatsapp_link_requests`, `balcao_whatsapp_webhook_events`.
- Produces server-only RPCs for: starting/updating contact state, creating WhatsApp business/store atomically, recording grant/revoke events, creating/consuming link requests, and claiming a WhatsApp-created business from a logged-in owner flow.

- [ ] Add tables, checks, indexes, RLS, explicit grants/revokes.
- [ ] Keep consent events append-only.
- [ ] Make business creation idempotent by `wa_id` and preserve existing active link.
- [ ] Use single-use hashed link tokens with expiry.
- [ ] Apply migration to Supabase production only after code-level SQL review.
- [ ] Run security/performance advisors and test queries.

### Task 3: Server-only Supabase and Meta clients

**Files:**
- Create: `lib/supabase/admin.ts`
- Create: `lib/whatsapp/cloud.ts`

**Interfaces:**
- `createAdminClient()` uses `SUPABASE_SECRET_KEY` or legacy `SUPABASE_SERVICE_ROLE_KEY` only on server.
- `sendWhatsAppText(to, text)` and `sendWhatsAppButtons(to, body, buttons)` call Meta `/messages`.

- [ ] Add environment validation that fails at request time, not build time.
- [ ] Use `META_WHATSAPP_GRAPH_VERSION` with a conservative default and configurable override.
- [ ] Ensure no secret variable uses `NEXT_PUBLIC_`.

### Task 4: Website opt-in and audit persistence

**Files:**
- Modify: `components/accounts/OnboardingWizard.tsx`
- Modify: `lib/accounts/validation.ts`
- Modify: `app/api/balcao/onboarding/route.ts`

**Interfaces:**
- Browser submits `whatsappConsent:boolean`.
- Server records consent only after successful onboarding using authenticated-user permissions/RPC and source `onboarding_site`.

- [ ] Add unchecked consent checkbox alongside phone field.
- [ ] Extend validation schema with boolean default false.
- [ ] Record consent event/current state when true; do not block account creation when false.
- [ ] Preserve current billing/onboarding routing.

### Task 5: WhatsApp webhook and onboarding state machine

**Files:**
- Create: `app/api/whatsapp/webhook/route.ts`
- Create: `lib/whatsapp/handler.ts`

**Interfaces:**
- GET verifies Meta challenge using `META_WHATSAPP_VERIFY_TOKEN`.
- POST receives webhook, deduplicates message id, handles STOP first, then routes by contact state.

- [ ] Unknown sender -> entry buttons.
- [ ] Create button -> ask business name.
- [ ] Business name -> consent buttons.
- [ ] Consent yes/no -> atomically create/link business/store; grant only on yes.
- [ ] Existing-account button -> create secure link request and send app URL.
- [ ] Active account -> send a concise ready/help response for now.
- [ ] Duplicate message ids -> HTTP 200 with no duplicate effects.

### Task 6: Secure web approval for existing-account link

**Files:**
- Create: `app/whatsapp/vincular/page.tsx`
- Create: `app/api/whatsapp/link/route.ts`

**Interfaces:**
- Link token comes from query/body.
- API requires current Supabase user and verifies owner/admin membership before consuming token and linking `wa_id`.

- [ ] Unauthenticated user redirects to existing login with return URL.
- [ ] Authenticated owner/admin can approve link once.
- [ ] Expired/used/invalid token returns safe error.
- [ ] No WhatsApp-provided email is treated as proof.

### Task 7: Billing boundary and compliance copy

**Files:**
- Modify: `app/privacidade/page.tsx` only if necessary to keep `PARAR` statement aligned.
- Modify: `app/termos/page.tsx` / `lib/legal/onboardingTerms.ts` only if necessary; do not rewrite existing legal wording.

- [ ] Ensure current policy/terms still explicitly state `PARAR` opt-out.
- [ ] Keep card capture outside WhatsApp; webhook only points to browser billing in future billing message work.

### Task 8: Verification and release

**Files:**
- Modify: `package.json` if needed to add focused test script.

- [ ] Run focused Node tests.
- [ ] Build Next.js in Vercel preview for the feature branch.
- [ ] Verify webhook GET behavior on preview with wrong/matching token once env is configured.
- [ ] Verify `/whatsapp/vincular` requires auth and builds successfully.
- [ ] Run Supabase security/performance advisors after migration.
- [ ] Review diff for secrets/PII and ensure no tokens were committed.
- [ ] Merge/promote only after all verifications pass.