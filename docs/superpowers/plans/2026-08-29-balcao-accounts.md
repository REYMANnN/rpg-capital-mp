# BALCÃO Accounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Google-authenticated management, onboarding, multi-business/multi-store ownership, staff PIN access, authorized devices, permissions and audit, excluding billing.

**Architecture:** Supabase Auth provides Google identity and SSR session cookies. Management access is tied to business memberships; operational access is a separate server-validated terminal + staff-session model. Existing `inventory_v1_*` data stays authoritative and `inventory_v1_stores` is extended rather than replaced.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase Auth/Postgres, `@supabase/ssr`, bcryptjs, Zod, Node test runner/tsx.

**Spec:** `docs/superpowers/specs/2026-08-29-balcao-accounts-design.md`

## Global Constraints
- Remain on BALCÃO v10.x.
- Billing/subscriptions are out of scope.
- Google is the only administrative sign-in provider.
- Staff require no email/Google account.
- PIN is 4 numeric digits and only valid on an authorized terminal.
- UI is mobile-first, plain-language and accessibility-conscious.
- Existing inventory/catalog behavior must keep working.

---

### Task 1: Core access domain and validation
**Files:**
- Create: `lib/accounts/access.ts`
- Create: `lib/accounts/validation.ts`
- Test: `tests/accounts/access.test.ts`
- Test: `tests/accounts/validation.test.ts`

**Interfaces:**
- Produces `permissionsForRole`, `can`, `nextPinLock`, `normalizeDigits`, `isValidCpf`, `isValidCnpj`, `validatePixKey`, onboarding schema helpers.

- [ ] Write tests for role permissions, custom permissions, PIN lock progression, CPF/CNPJ and onboarding validation.
- [ ] Run the account tests and confirm they fail because modules do not exist.
- [ ] Implement minimal pure functions.
- [ ] Run tests and confirm green.
- [ ] Commit.

### Task 2: Database schema and RLS foundation
**Files:**
- Create: `supabase/migrations/20260829_balcao_accounts.sql`

**Interfaces:**
- Produces the tables/entities from the design spec and extends `inventory_v1_stores`.

- [ ] Write migration with constraints, indexes, update timestamps and safe nullable extension for legacy stores.
- [ ] Add RLS policies for Google-authenticated business members; terminal/staff writes stay server-side using service-role APIs.
- [ ] Apply migration through Supabase migration API.
- [ ] Query information_schema to verify every table/column/index required by the spec.
- [ ] Commit migration file.

### Task 3: Google Auth + onboarding
**Files:**
- Create: `app/login/page.tsx`
- Create: `components/accounts/GoogleAuthButton.tsx`
- Create: `app/auth/google/callback/route.ts`
- Create: `app/onboarding/page.tsx`
- Create: `components/accounts/OnboardingWizard.tsx`
- Create: `app/api/balcao/onboarding/route.ts`
- Create: `lib/accounts/currentUser.ts`
- Modify: `app/page.tsx`

**Interfaces:**
- Admin session via Supabase SSR cookies.
- Onboarding POST creates/updates profile, business, owner membership and first store and returns management destination.

- [ ] Add route/domain tests for redirect decisions and onboarding payload validation.
- [ ] Confirm RED.
- [ ] Implement Google OAuth button/callback and server auth helper.
- [ ] Implement accessible multi-step onboarding with resume-safe server API.
- [ ] Confirm tests and build.
- [ ] Commit.

### Task 4: Management UI and business/store switching
**Files:**
- Create: `app/manage/page.tsx`
- Create: `components/accounts/ManageShell.tsx`
- Create: `app/api/balcao/context/route.ts`
- Create: `app/api/balcao/stores/route.ts`

**Interfaces:**
- Management context returns user, business memberships and stores.
- Store creation is Google-authenticated and audited.

- [ ] Test context authorization and store-input validation.
- [ ] Confirm RED.
- [ ] Implement management shell with responsive navigation and progressive disclosure.
- [ ] Implement store list/create API.
- [ ] Confirm tests/build.
- [ ] Commit.

### Task 5: Staff profiles, roles and PIN reset
**Files:**
- Create: `lib/accounts/pin.ts`
- Create: `app/api/balcao/staff/route.ts`
- Create: `app/api/balcao/staff/[id]/route.ts`
- Create: `app/api/balcao/staff/[id]/pin/route.ts`
- Create: `components/accounts/TeamManager.tsx`

**Interfaces:**
- CRUD for staff; roles stock/cashier/manager/custom.
- PIN hashes use bcrypt; API never returns hashes/raw old PIN.

- [ ] Test permission checks, PIN hashing/verifying and reset rules.
- [ ] Confirm RED.
- [ ] Implement staff APIs and UI.
- [ ] Confirm tests/build.
- [ ] Commit.

### Task 6: Device activation and staff session
**Files:**
- Create: `lib/accounts/terminal.ts`
- Create: `app/api/balcao/terminals/route.ts`
- Create: `app/api/balcao/terminals/invite/route.ts`
- Create: `app/api/balcao/terminals/activate/route.ts`
- Create: `app/api/balcao/staff/login/route.ts`
- Create: `app/api/balcao/staff/logout/route.ts`
- Create: `app/activate/[token]/page.tsx`
- Create: `app/work/page.tsx`
- Create: `components/accounts/StaffLogin.tsx`
- Create: `components/accounts/DeviceManager.tsx`

**Interfaces:**
- One-use 15-minute invite token.
- HttpOnly terminal credential cookie.
- Staff-session cookie bound to terminal and staff.

- [ ] Test token hashing/expiry/one-use decisions and terminal/staff session parsing.
- [ ] Confirm RED.
- [ ] Implement device invite/activation/revocation and staff login with progressive PIN lockout.
- [ ] Implement operational staff selector/PIN UI.
- [ ] Confirm tests/build.
- [ ] Commit.

### Task 7: Inventory integration + authorization context
**Files:**
- Create: `lib/accounts/requestContext.ts`
- Modify: `app/inventory-v1/page.tsx`
- Modify: `app/inventory-v1/InventoryV1.tsx` only where necessary to hide unauthorized operational surfaces.
- Modify inventory mutation APIs to derive/validate effective store context before writes.

**Interfaces:**
- `getOperationalContext()` resolves Google management context or staff-terminal context.
- Role permissions decide whether inventory/checkout/management UI is available.

- [ ] Test request-context authorization decisions.
- [ ] Confirm RED.
- [ ] Gate inventory route and server mutation endpoints without breaking existing catalog lookup.
- [ ] Pass effective permissions to inventory UI and hide disallowed actions.
- [ ] Confirm full existing inventory tests plus new account tests and build.
- [ ] Commit.

### Task 8: Audit, accessibility pass, version and deployment
**Files:**
- Create: `lib/accounts/audit.ts`
- Modify sensitive routes to write audit events.
- Modify: `lib/inventory/version.ts`
- Update CI workflow for account tests.

**Interfaces:**
- `writeAuditEvent` is best-effort for non-critical telemetry but mandatory for security-sensitive mutations.

- [ ] Add audit tests.
- [ ] Verify accessibility basics in rendered markup: labels, focus, touch size, status text.
- [ ] Run all account tests and all existing inventory tests.
- [ ] Run production build.
- [ ] Apply/verify DB migration.
- [ ] Bump to `v10.6`.
- [ ] Merge branch to master and wait for Vercel production READY.
- [ ] Verify `/login`, `/onboarding`, `/manage`, `/work`, `/inventory-v1`, catalog lookup and production version.
