# BALCÃO Onboarding UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a reliable, guided BALCÃO account-creation flow with Brazilian input masks, CEP autofill, explicit Pix typing, and a fixed onboarding RPC.

**Architecture:** Keep the existing four-step onboarding and Supabase account model. Add focused pure formatting/validation helpers, a server-side CEP lookup route, a more assistive wizard, and a backward-compatible RPC response adapter. Fix the database ambiguity at its source with a transactional migration.

**Tech Stack:** Next.js 16, React 19, TypeScript, Zod, Supabase/Postgres, ViaCEP, Node test runner, GitHub Actions, Vercel.

**Spec:** `docs/superpowers/specs/2026-08-30-balcao-onboarding-ux-design.md`

## Global Constraints

- Keep product/database version in v10.x.
- Preserve Google-only management authentication.
- Preserve legacy inventory-store adoption.
- Do not add billing.
- Do not require employee email/Google login.
- Do not clear user-entered onboarding data after errors.
- Keep the UI plain, fast, mobile-friendly and accessible.

---

### Task 1: Input formatting and Pix typing

**Files:**
- Modify: `lib/accounts/validation.ts`
- Modify: `tests/accounts/validation.test.ts`

**Interfaces:**
- Produces: `formatCep`, `formatPhone`, `formatTaxId`, `PixKeyType`, `formatPixKey`, `normalizePixKey`, `validatePixKeyForType`.

- [ ] Write failing tests for partial/full masks, pasted punctuation, Pix CPF/CNPJ/phone/email/EVP normalization, and malformed inputs.
- [ ] Run account validation tests and confirm RED.
- [ ] Implement pure helpers with no UI dependency.
- [ ] Run account validation tests and confirm GREEN.

### Task 2: RPC ambiguity regression

**Files:**
- Create: `tests/accounts/onboardingMigration.test.ts`
- Create: `supabase/migrations/20260830_balcao_onboarding_rpc_unambiguous.sql`
- Modify: `app/api/balcao/onboarding/route.ts`

**Interfaces:**
- RPC returns `out_business_id`, `out_store_id`, `out_installation_id`.
- API accepts those names and old names during deployment transition.

- [ ] Write failing migration-text test asserting OUT names cannot collide with table column names and API accepts new return shape.
- [ ] Run test and confirm RED.
- [ ] Write `CREATE OR REPLACE FUNCTION` with uniquely named OUT parameters and qualified references.
- [ ] Update API result adapter.
- [ ] Run accounts tests and confirm GREEN.

### Task 3: CEP lookup

**Files:**
- Create: `lib/accounts/cep.ts`
- Create: `app/api/balcao/cep/[cep]/route.ts`
- Create: `tests/accounts/cep.test.ts`

**Interfaces:**
- `normalizeCep(value): string`
- `mapViaCepResponse(input): { street; neighborhood; city; state } | null`
- GET `/api/balcao/cep/:cep`

- [ ] Write mapping/validation tests and confirm RED.
- [ ] Implement pure mapper and server route with timeout/failure handling.
- [ ] Confirm GREEN.

### Task 4: Guided onboarding wizard

**Files:**
- Modify: `components/accounts/OnboardingWizard.tsx`
- Create: `tests/accounts/onboardingUx.test.ts`

**Interfaces:**
- Uses formatting helpers from Task 1 and `/api/balcao/cep/:cep` from Task 3.

- [ ] Write source-level regression tests for required masks, explicit Pix selector, autocomplete attributes, field-specific errors, CEP lookup, and submit locking.
- [ ] Confirm RED.
- [ ] Refactor wizard into four calm steps with field messages, mask-as-you-type, paste normalization, automatic CEP fill, editable address and explicit Pix type.
- [ ] Confirm GREEN.

### Task 5: Login intent and full regression

**Files:**
- Modify only if needed: `app/login/page.tsx`, `components/accounts/GoogleAuthButton.tsx`, `app/auth/google/complete/route.ts`
- Test: `tests/accounts/authIntent.test.ts`

- [ ] Run the existing intent test inherited from `fix-auth-intent-semantics`.
- [ ] Fix any regressions caused by onboarding changes.
- [ ] Run all account tests, inventory tests, and production build.

### Task 6: Database and production deployment

**Files:**
- Apply migration from Task 2 to Supabase project `kftmhqugsswieuxqznfk`.
- Promote tested commit to `master`.

- [ ] Apply migration and inspect the live function definition/security grants.
- [ ] Confirm GitHub CI success for account + inventory workflows.
- [ ] Promote commit to `master`.
- [ ] Wait for Vercel production deployment to become READY.
- [ ] Verify production `/login` returns 200.
- [ ] Verify unauthenticated `/api/balcao/context` returns 401, not 500.
- [ ] Inspect runtime error clusters and ensure no new 5xx regression is introduced by the deployment.