# Admin Trial Accounts + Pix Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an RPG admin create a WhatsApp-ready trial business without Auth/onboarding and let Rafa safely capture a missing Pix key from explicit free text.

**Architecture:** Reuse `balcao_businesses`, `inventory_v1_stores`, `wa_store_bindings`, and the existing Rafa store resolver. Add provenance/contact lifecycle columns plus a transaction-safe trial-creation RPC guarded by canonical phone normalization and an advisory lock; keep existing dirty legacy phone collisions untouched but prevent new collisions. Put Pix parsing/reminder/storage in one shared server helper and wire it into both Rafa paths plus direct inbound routing.

**Tech Stack:** Next.js 16, React 19, TypeScript, Supabase/Postgres, node:test, Evolution WhatsApp.

**Spec:** `docs/superpowers/specs/2026-10-06-admin-trial-accounts-design.md`

## Global Constraints

- Trial create form has only contact name, commerce name, and WhatsApp.
- No fake Auth user, email, password, bank, Pix, inventory seed, coupon, billing, or onboarding.
- `balcao_businesses.pix_key` is the canonical Pix key.
- Existing inventory/sales/Rafa paths remain authoritative; no trial-specific business or inventory model.
- While Pix is missing, answer the real request first, then append the reminder; never block normal operations.
- Auto-save only when Pix/key intent is explicit and exactly one deterministic valid candidate exists.
- Never request or store banking password, token, SMS code, login, or card data.
- Preserve business/store IDs on future conversion.

## Review Focus

- Legacy active businesses that already share one normalized phone must not be silently modified.
- Two concurrent trial-create requests for one phone must produce at most one business.
- A non-Pix sentence such as `meu telefone é 11999999999` must never write `pix_key`.
- A message containing two valid Pix candidates must not auto-save either one.
- Direct/non-agent replies must not append Pix text to confirmation or machine-sensitive responses.

---

### Task 1: Database lifecycle + atomic trial creation

**Files:**
- Create: `supabase/migrations/20261006160000_admin_trial_accounts.sql`
- Test: SQL smoke checks through Supabase after migration

**Interfaces:**
- Produces columns `account_origin`, `primary_contact_name`, `trial_converted_at` on `balcao_businesses`.
- Produces `public.normalize_brazil_phone(text) -> text` and privileged RPC `public.admin_create_trial_account(text,text,text)` returning business/store/phone.

- [ ] Add a pure phone-normalization function for Brazilian E.164 digits.
- [ ] Add lifecycle/contact columns with backward-compatible defaults/checks.
- [ ] Add transaction-safe collision guard using `pg_advisory_xact_lock(hashtext(normalized_phone))` before collision checking; do not reconcile/delete legacy duplicates.
- [ ] Add `admin_create_trial_account` SECURITY DEFINER RPC that atomically inserts business + store + `wa_store_bindings` and raises stable errors.
- [ ] Revoke RPC execution from `PUBLIC`, `anon`, and `authenticated`; allow only trusted server/service-role path.
- [ ] Apply migration and verify existing rows survive unchanged and duplicate trial create is rejected.

### Task 2: Admin trial service/API

**Files:**
- Create: `lib/admin/trial-accounts.ts`
- Create: `app/api/admin/trial-accounts/route.ts`
- Test: `tests/admin-trial-accounts.test.ts`

**Interfaces:**
- Produces `normalizeTrialPhone`, `validateTrialInput`, `createTrialAccount` and admin API POST/PATCH/DELETE behavior.
- Consumes Task 1 RPC and existing `isAdminRequest` / `createAdminClient`.

- [ ] Write failing unit tests for validation/normalization and stable error mapping.
- [ ] Implement minimal service wrappers and admin-authenticated POST.
- [ ] Add PATCH for contact/business/phone edits; phone change updates binding/session safely.
- [ ] Add DELETE-as-deactivate semantics: business/store inactive and binding/session removed; history preserved.
- [ ] Run unit tests and TypeScript/build verification.

### Task 3: Admin dashboard `Contas teste`

**Files:**
- Modify: `lib/admin/metrics.ts`
- Modify: `app/admin/AdminDashboard.tsx`

**Interfaces:**
- Extends `AdminMetrics` with `trialAccounts` containing business/store/contact/phone/Pix/status/lastInteraction/createdAt.
- Consumes Task 2 API.

- [ ] Extend metrics query/model for admin trials and last WhatsApp interaction; use `primary_contact_name` before Auth fallback.
- [ ] Add `Contas teste` tab with exactly 3 create fields and `Criar conta teste`.
- [ ] Add table/statuses plus Editar and Desativar actions.
- [ ] Build-check UI and verify existing tabs are unchanged.

### Task 4: Shared Pix parser/reminder/storage

**Files:**
- Create: `lib/rafa-pix-core.ts`
- Create: `lib/rafa-pix.ts`
- Test: `tests/rafa-pix.test.ts`

**Interfaces:**
- Produces pure `parseExplicitPixKey(text)`, CPF/CNPJ/email/phone/EVP validators, `pixReminder()`.
- Produces server `pixStatusForStore(storeId)`, `savePixForStore(storeId,key)`, `withPixReminder(storeId,body,options?)`.

- [ ] Write failing unit tests for CPF, CNPJ, email, EVP, phone, explicit intent, non-Pix phone text, multiple candidates, and reminder copy.
- [ ] Implement deterministic parser without LLM guessing.
- [ ] Implement business lookup/storage, idempotent same-key save, and missing-key reminder.
- [ ] Run Pix unit tests and existing WhatsApp tests.

### Task 5: Rafa integration + end-to-end verification

**Files:**
- Modify: `lib/whatsapp-inbound.ts`
- Modify: `lib/rafa-agent.ts`
- Modify: `lib/rafa-brain.ts`
- Test: `tests/rafa-pix-integration.test.ts`

**Interfaces:**
- Consumes Task 4 helper.
- Keeps existing store resolution from `resolveRafaStore()` / `phoneStores()`.

- [ ] Intercept explicit valid Pix-key text after store resolution but before normal agent routing; save and reply success without reminder.
- [ ] For explicit but ambiguous/invalid Pix intent, ask/clarify without overwriting an existing key.
- [ ] Wrap normal agent final text replies with shared reminder while key is missing.
- [ ] Apply reminder to safe direct replies only; skip confirmations, menus/links/payload-sensitive messages.
- [ ] Add integration tests: trial resolves, empty inventory still works, reminder while blank, save correct business key, next response no reminder, ambiguous phone not auto-saved, legacy and v3 consistency.
- [ ] Run full relevant tests, lint, build, Supabase security/performance advisors, then review branch diff before merge/deploy.
