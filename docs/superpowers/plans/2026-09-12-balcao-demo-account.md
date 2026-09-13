# BALCÃO Demo Account Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a public, isolated BALCÃO manager demo with realistic mock operations and a prominent landing-page test-account CTA.

**Architecture:** Add a pure demo-data module and a `/demo` route. Reuse `InventoryV1` and `FinanceDashboard` through explicit demo props so the production path remains unchanged. Demo persistence is session-only and all external side effects are replaced with local simulations. A dedicated demo automation view provides the manager-facing experience without invoking production automation APIs.

**Tech Stack:** Next.js 16.2.4, React 19.2.4, TypeScript, existing BALCÃO inventory/finance modules, browser `sessionStorage`.

**Spec:** `docs/superpowers/specs/2026-09-12-balcao-demo-account-design.md`

## Global Constraints

- Production manager behavior must remain unchanged when demo mode is off.
- Demo must never call production inventory persistence, Pix, Open Finance or automation mutation endpoints.
- Demo users must not receive administrator-only pages or controls.
- Demo state is isolated per browser session/tab.
- The two scanner showcase EANs are `7891000100103` and `7891022638004`.
- Production build and existing test suites must pass before merge.

---

### Task 1: Demo seed and finance model

**Files:**
- Create: `lib/demo/balcao.ts`
- Test: `tests/demo-balcao.test.ts`

**Interfaces:**
- Produces: `createDemoStoreData()`, `createDemoFinanceDashboard(days, storeData)`, `DEMO_STORAGE_KEY`, `DemoStoreData`.
- Consumes: inventory `Sale`, `ScaleRule`, finance `buildFinanceDashboard`.

- [ ] **Step 1: Write failing tests** for seeded products, known EANs, referential integrity, historical sales and finance metrics.
- [ ] **Step 2: Run tests and verify RED** because the demo module does not exist yet.
- [ ] **Step 3: Implement deterministic demo seed and finance builder** with coherent products, sales, movements and mock bank inputs.
- [ ] **Step 4: Run tests and verify GREEN.**

### Task 2: Session-isolated demo route and operational state

**Files:**
- Create: `app/demo/page.tsx`
- Modify: `app/inventory-v1/InventoryV1.tsx`

**Interfaces:**
- `InventoryV1({ demoMode?: boolean })`
- Demo mode loads/saves `DemoStoreData` only from `sessionStorage` and skips `/api/inventory/state`.

- [ ] **Step 1: Extend tests where pure helpers are needed for demo state cloning/reset.**
- [ ] **Step 2: Verify RED.**
- [ ] **Step 3: Add `/demo` and explicit demo-mode state adapter.**
- [ ] **Step 4: Verify demo never reads/writes the production inventory-state endpoint.**

### Task 3: Safe demo checkout and Financeiro

**Files:**
- Modify: `app/inventory-v1/InventoryV1.tsx`
- Modify: `app/inventory-v1/FinanceDashboard.tsx`

**Interfaces:**
- `FinanceDashboard({ demoStore?: FinanceInventoryState })`
- Checkout receives `demoMode` and simulates Pix without calling `/api/balcao/checkout/pix`.

- [ ] **Step 1: Add behavior tests to the pure demo Pix helper/data path where possible.**
- [ ] **Step 2: Verify RED.**
- [ ] **Step 3: Wire current demo store into the Financeiro dashboard and render mock finance data.**
- [ ] **Step 4: Replace real Pix/Open Finance side effects with clear demo-only simulations.**
- [ ] **Step 5: Run unit tests and build.**

### Task 4: Demo Automações

**Files:**
- Create: `app/inventory-v1/DemoAutomationsHub.tsx`
- Modify: `app/inventory-v1/InventoryV1.tsx`

**Interfaces:**
- Demo-only nav tab `automations` renders local mock automations.
- No calls to `/api/balcao/automations/*`.

- [ ] **Step 1: Add demo tab to the InventoryV1 tab type and navigation only when `demoMode` is true.**
- [ ] **Step 2: Implement local automation cards, toggle/run interactions and demo activity.**
- [ ] **Step 3: Verify production navigation remains unchanged.**

### Task 5: Landing-page CTA

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/landing.module.css`

**Interfaces:**
- Header CTA: `Conta de teste` → `/demo`.
- Hero CTA: `Testar conta demo` → `/demo`.

- [ ] **Step 1: Add prominent demo CTA in header and hero while preserving existing signup/login actions.**
- [ ] **Step 2: Add responsive styling consistent with current landing design.**

### Task 6: Verification and deployment

**Files:** no production source beyond fixes discovered by verification.

- [ ] **Step 1: Run demo unit tests.**
- [ ] **Step 2: Run existing BALCÃO account/inventory tests.**
- [ ] **Step 3: Run `npm run build`.**
- [ ] **Step 4: Review diff for accidental production side effects.**
- [ ] **Step 5: Merge only after checks pass.**
- [ ] **Step 6: Verify the linked Vercel production deployment becomes READY.**
- [ ] **Step 7: Smoke-check `/` and `/demo` on the public domain.**
