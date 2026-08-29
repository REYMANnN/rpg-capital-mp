# Inventory v10.1 Intake State Machine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a strict two-stage invoice intake: resolve every uncertain product/unit decision first, then show the complete editable purchase review and allow stock confirmation.

**Architecture:** Extend the NF-e parser with purchase unit data; centralize review-line state and package math in `invoiceReview.ts`; centralize deterministic identity resolution in a resolver module that prioritizes local products, supplier aliases, then catalog; keep UI as a state machine with `idle → resolving → questions → review`; persist supplier aliases and package factors globally in Supabase.

**Tech Stack:** Next.js 16, React, TypeScript, Node test runner via `tsx`, Supabase/Postgres, Vercel.

**Spec:** `docs/superpowers/specs/2026-08-29-inventory-v10-1-intake-state-machine-design.md`

## Global Constraints
- Release version is exactly `v10.1`.
- Do not create `v11` without explicit user instruction.
- Final review must never render while any line still requires a decision.
- Valid explicit EAN identifies the product; missing local sale price is not an identity question.
- Product matching must prioritize current-store products before global catalog products.
- Package units require a known factor or explicit decision before final review.
- Alias conflicts must never be overwritten silently.

---

### Task 1: NF-e units and package math

**Files:**
- Modify: `lib/inventory/nfe.ts`
- Modify: `lib/inventory/invoiceReview.ts`
- Test: `tests/nfe.test.ts`
- Test: `tests/invoiceReview.test.ts`

**Interfaces:**
- `ParsedNfeItem.purchaseUnit: string`
- `InvoiceReviewLineV10.packageFactor: number`
- `InvoiceReviewLineV10.stockQuantityMilli: number`
- `InvoiceReviewLineV10.inventoryUnitCostCents: number`
- `normalizePurchaseUnit(unit: string): string`
- `requiresPackageFactor(unit: string): boolean`
- `recalculateInvoiceLine(line): InvoiceReviewLineV10`

- [ ] Add failing parser tests proving `<uCom>CX</uCom>` is preserved and `<uCom>UN</uCom>` defaults correctly when absent.
- [ ] Add failing review math tests proving `6 CX × factor 6` produces `36 UN` stock and a `R$60/CX` purchase cost becomes `R$10/UN` average-cost input.
- [ ] Implement parser and package math.
- [ ] Run `npx tsx --test tests/nfe.test.ts tests/invoiceReview.test.ts` and require PASS.

### Task 2: Explicit identity/store state machine

**Files:**
- Create: `lib/inventory/invoiceResolver.ts`
- Modify: `lib/inventory/invoiceReview.ts`
- Test: `tests/invoiceResolver.test.ts`

**Interfaces:**
- `IdentityStatus = 'ean' | 'alias' | 'suggested' | 'manual' | 'unresolved' | 'conflict'`
- `StoreStatus = 'existing-priced' | 'existing-unpriced' | 'new'`
- `DecisionState = 'resolved' | 'needs-identity' | 'needs-package-factor' | 'excluded'`
- `resolveInvoiceLine(input): ResolvedInvoiceLine`

- [ ] Write failing tests for existing EAN+price, existing EAN without price, new EAN, known alias, local suggestion priority, ambiguous candidate, unresolved line, alias/EAN conflict, package-factor pending, and excluded line.
- [ ] Implement deterministic resolver with local-candidate preference and explicit separation of identity status from store status.
- [ ] Run `npx tsx --test tests/invoiceResolver.test.ts` and require PASS.

### Task 3: Supplier alias + package-factor persistence

**Files:**
- Modify: `app/api/inventory/supplier-alias/route.ts`
- Test: `tests/supplierAliasContract.test.ts`
- Supabase migration: add `purchase_unit` and `package_factor` to `inventory_v1_supplier_product_aliases`; update confirmation RPC to accept them.

**Interfaces:**
- GET alias returns `barcode`, `canonicalName`, `observedDescription`, `purchaseUnit`, `packageFactor`, `confirmations`, `revisions`.
- POST accepts optional `purchaseUnit` and `packageFactor` and returns `{ ok, learned }`.

- [ ] Add contract tests for alias payload parsing and conflict-safe persistence metadata.
- [ ] Apply Supabase migration scoped only to `inventory_v1_*` objects.
- [ ] Update API route.
- [ ] Verify SQL readback of a test row inside a transaction/rollback or clean it after verification.

### Task 4: Strict questions-before-review UI

**Files:**
- Modify: `app/inventory-v1/InvoiceIntakeV10.tsx`
- Modify: `app/inventory-v1/inventory.module.css`

**Behavior:**
- `questions` renders `IDENTIFICAÇÃO DE PRODUTOS`, `Pendência X de Y`, and copy saying final review comes later.
- `review` cannot render until all lines have `decisionState` of `resolved` or `excluded`.
- Suggested lines offer accept/correct; unresolved lines offer search, scan, typed EAN, or exclude.
- Package-factor pending lines ask `1 <unidade> contém quantas unidades?` before review.
- Local store suggestions are visually labeled `Já cadastrado neste mercado` and show local sale price status.
- Review lines show `Preço de venda pendente` for existing-unpriced/new products without asking identity questions.
- Excluded lines remain visible and unchecked.

- [ ] Replace `currentQuestion = !confirmed` with a decision-state selector.
- [ ] Add a progress counter and hard render gate.
- [ ] Add package-factor question branch.
- [ ] Add local-price badges and exclusion state to final review.
- [ ] Preserve edit/search/scan/manual-EAN functionality.

### Task 5: Stock commit uses converted quantity/cost

**Files:**
- Modify: `app/inventory-v1/InventoryV1.tsx`
- Test: `tests/purchaseMath.test.ts`

**Behavior:**
- Existing product: add `stockQuantityMilli` and calculate weighted average using `inventoryUnitCostCents`.
- New product: create with correct `unit` (`UN` or `KG`), price `0`, then apply converted stock/cost.
- Quantity/cost edits change only that invoice line.
- Supplier alias updates happen only when identity/package decision is explicitly confirmed.

- [ ] Add/extend purchase tests for package conversion and existing/new product paths.
- [ ] Update `confirmInvoiceV10` to consume converted fields.
- [ ] Run purchase tests and require PASS.

### Task 6: Comprehensive synthetic test invoice

**Files:**
- Create: `tests/fixtures/nfe-v10-1-all-scenarios.xml`
- Create: `tests/v10_1ScenarioMatrix.test.ts`
- Modify: `app/api/inventory/nfe/by-key/route.ts`

**Behavior:**
The demo fixture includes lines for direct known EAN, known EAN/no local price, new known EAN, explicit EAN alias conflict, known supplier alias, strong local-name suggestion, ambiguous/no-match item, package unit with known factor, and package unit without factor.

- [ ] Add the fixture and matrix assertions.
- [ ] Make the existing fictitious key return this comprehensive fixture payload.
- [ ] Run matrix tests and require PASS.

### Task 7: Version, CI, verification, production

**Files:**
- Modify: `lib/inventory/version.ts`
- Create/modify: `.github/workflows/inventory-v10-1-ci.yml`

- [ ] Set version to `v10.1`.
- [ ] CI runs `npx tsx --test tests/nfeKey.test.ts tests/nfe.test.ts tests/purchaseMath.test.ts tests/productMatcher.test.ts tests/invoiceReview.test.ts tests/invoiceResolver.test.ts tests/supplierAliasContract.test.ts tests/v10_1ScenarioMatrix.test.ts`.
- [ ] CI runs `npm run build` after tests.
- [ ] Only after green CI, promote the tested tree to `master`.
- [ ] Wait for Vercel production deploy to reach READY.
- [ ] Verify `/api/inventory/state` reports `v10.1`, the demo NF-e endpoint returns the scenario matrix, catalog search works, supplier alias GET works, and `/inventory-v1` returns HTTP 200.