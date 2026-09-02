# Owner Open Finance Settings and Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add owner-facing Open Finance settings, real bank revocation, and a required bank-connection step for new onboardings.

**Architecture:** Reuse `BankConnections` in Financeiro, management settings, and onboarding. Keep provider calls server-side through `lib/malvo/client.ts`; introduce explicit disconnect/finalize endpoints and update onboarding persistence so new profiles remain incomplete until a provider item exists.

**Tech Stack:** Next.js 16, React, TypeScript, Supabase/Postgres, Malvo Open Finance API, Vitest/Node test runner used by existing account CI.

**Spec:** `docs/superpowers/specs/2026-09-02-manage-open-finance-onboarding-design.md`

## Global Constraints
- Existing completed accounts must not be retroactively blocked.
- Malvo secrets remain server-side only.
- Only Google-authenticated management may connect or revoke consent.
- Reuse the existing normalized finance tables and BankConnections component.

---

### Task 1: Lock contracts with failing tests
**Files:**
- Create: `tests/accounts/openFinanceSettings.test.ts`
- Modify: `tests/accounts/malvoIntegration.test.ts`

**Produces:** Assertions for Configurações navigation, disconnect helper/route, fifth onboarding step, incomplete-before-bank behavior, and finalization guard.

- [ ] Add source-contract tests against the affected files.
- [ ] Run Accounts CI and confirm RED for missing behavior.

### Task 2: Add Malvo disconnect
**Files:**
- Modify: `lib/malvo/client.ts`
- Create: `app/api/balcao/finance/connections/[id]/route.ts`
- Modify: `app/inventory-v1/finance/BankConnections.tsx`

**Produces:** `deleteMalvoItem(itemId)` plus an owner-authorized DELETE endpoint and confirmation UI.

- [ ] Add `deleteMalvoItem` using `DELETE /items/{id}` via the existing authenticated request helper.
- [ ] Resolve local connection by id, authorize Google management against its business/store, revoke at Malvo, then mark local connection/accounts disconnected.
- [ ] Add a `Desconectar` action with browser confirmation and reload state after success.
- [ ] Run targeted tests.

### Task 3: Add owner Configurações surface
**Files:**
- Modify: `components/accounts/ManageShell.tsx`

**Produces:** Management navigation item `Configurações` with `BankConnections` for the selected store.

- [ ] Replace `Mais` with `Configurações`.
- [ ] Preserve StoreManager and DeviceManager and add an Open Finance section above integrations/configuration cards.
- [ ] Pass the selected store context by opening the store cookie before the connection component is used if required by current API behavior.
- [ ] Run UI/account tests.

### Task 4: Split onboarding creation from completion
**Files:**
- Create: `supabase/migrations/20260902_balcao_onboarding_requires_open_finance.sql`
- Modify: `app/api/balcao/onboarding/route.ts`
- Create: `app/api/balcao/onboarding/complete/route.ts`
- Modify: `app/onboarding/page.tsx`
- Modify: `components/accounts/OnboardingWizard.tsx`
- Modify: `app/manage/page.tsx`

**Produces:** New onboardings create business/store with `onboarding_completed=false`, fifth bank step, server-validated completion, and manage guard.

- [ ] Replace `balcao_complete_onboarding` so it preserves `true` for already-completed profiles but writes `false` for new/incomplete profiles.
- [ ] Return business/store/installation context from onboarding POST and move the wizard to bank step instead of `/manage`.
- [ ] Add fifth step using `BankConnections` in onboarding mode.
- [ ] Add POST `/api/balcao/onboarding/complete` that requires authenticated owner plus at least one non-disconnected Malvo connection, then marks profile completed.
- [ ] Make `/manage` redirect users with incomplete onboarding to `/onboarding`.
- [ ] Make `/onboarding` support returning from OAuth without redirecting away until completion.
- [ ] Run account tests and build.

### Task 5: Validate database, merge, and deploy
**Files:** none beyond migration already created.

- [ ] Apply migration to Supabase and validate existing current user remains completed.
- [ ] Run all three project workflows and production build.
- [ ] Merge the feature branch only with green CI.
- [ ] Wait for Vercel production deployment READY.
- [ ] Smoke test `/manage`, `/onboarding`, finance connection routes unauthenticated behavior, and runtime errors.
