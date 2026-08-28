# Inventory v9 Product Intake Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship v9 with clear unit-scan product registration/editing plus bulk NF-e XML intake that populates quantity and purchase cost without asking for sale price.

**Architecture:** Keep the current local-first `StoreData` model and Supabase sync. Add a pure NF-e parser module and a small intake application helper, then redesign `InventoryV1.tsx` around two explicit flows: unit scan/detail editor and invoice review/import. Catalog identification continues through `/api/products/lookup`.

**Tech Stack:** Next.js 16, React, TypeScript, Node test runner, Supabase, existing barcode scanner.

**Spec:** `docs/superpowers/specs/2026-08-28-inventory-v9-product-intake-design.md`

## Global Constraints

- Release version is exactly `v9`.
- Do not change the working barcode decoder.
- Name and EAN are read-only after product creation.
- Invoice import populates purchase cost and quantity only; it never asks for sale price.
- Existing local-first + Supabase sync remains the persistence path.
- Scale-label functionality remains out of scope.

---

### Task 1: NF-e XML parser

**Files:**
- Create: `lib/inventory/nfe.ts`
- Create: `tests/nfe.test.ts`

**Interfaces:**
- Produces: `parseNfeXml(xml: string): ParsedNfe`
- Produces: `normalizeInvoiceBarcode(value: string | null | undefined): string`

- [ ] **Step 1: Write failing parser tests**

Cover: `cEAN` item, `cEANTrib` fallback, `SEM GTIN`, quantity, unit cost, total, supplier code, malformed XML and empty invoice.

- [ ] **Step 2: Run tests and confirm RED**

Run: `node --experimental-strip-types --test tests/nfe.test.ts`
Expected: FAIL because `lib/inventory/nfe.ts` does not exist.

- [ ] **Step 3: Implement minimal parser**

Use `DOMParser` in the browser when available and a dependency-free string/XML parsing strategy compatible with Node tests. Return normalized numeric values as integer cents/milli-units to avoid floating-point drift.

- [ ] **Step 4: Run tests and confirm GREEN**

Run: `node --experimental-strip-types --test tests/nfe.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat: parse NF-e XML inventory items`

### Task 2: Invoice intake state transition

**Files:**
- Create: `lib/inventory/intake.ts`
- Create: `tests/intake.test.ts`

**Interfaces:**
- Consumes existing `Product` shape plus v9 app metadata.
- Produces `applyPurchaseLine(product, quantityMilli, unitCostCents)` with weighted average cost and new stock.

- [ ] **Step 1: Write failing weighted-cost tests**

Test empty stock, existing stock, and zero-cost edge cases.

- [ ] **Step 2: Run tests and confirm RED**

Run: `node --experimental-strip-types --test tests/intake.test.ts`
Expected: FAIL because intake helper does not exist.

- [ ] **Step 3: Implement minimal helper**

Use integer arithmetic compatible with existing `stockMilli` and `averageCostCents` fields.

- [ ] **Step 4: Run tests and confirm GREEN**

Run both v9 test files.

- [ ] **Step 5: Commit**

Commit message: `feat: add tested purchase intake math`

### Task 3: Product detail/editor UX

**Files:**
- Modify: `app/inventory-v1/InventoryV1.tsx`
- Modify: `app/inventory-v1/inventory.module.css`

**Interfaces:**
- Existing product scan opens either a new registration view or an existing product editor.
- Existing product editor locks name and EAN.

- [ ] **Step 1: Add product-editor behavior tests where pure rules can be extracted**

Create a small validation helper if needed so mandatory sale price / purchase cost rules are testable without React rendering.

- [ ] **Step 2: Implement scan flow**

Existing SKU → detail/editor. New SKU → catalog lookup → registration.

- [ ] **Step 3: Redesign fields**

Explicit labels + helper text for sale price, purchase cost, initial quantity and minimum stock. Render catalog photo, brand and source when available.

- [ ] **Step 4: Implement edit action on product cards**

Allow changing sale price, purchase cost, minimum stock and stock adjustment. Do not allow name/EAN edits.

- [ ] **Step 5: Verify TypeScript and commit**

Commit message: `feat: redesign unit product registration and editing`

### Task 4: NF-e upload/review/import UX

**Files:**
- Modify: `app/inventory-v1/InventoryV1.tsx`
- Modify: `app/inventory-v1/inventory.module.css`

**Interfaces:**
- Upload `.xml` → `parseNfeXml` → review rows.
- Confirm review → existing items updated; new valid-EAN items created; no-EAN rows remain pending.

- [ ] **Step 1: Implement file selection and parse errors**

No state mutation before successful parse.

- [ ] **Step 2: Enrich valid EAN rows using `/api/products/lookup`**

Prefer catalog official name/photo/brand. Keep invoice `xProd` as fallback description.

- [ ] **Step 3: Render review table/cards**

For each line show product identity, quantity, unit cost, total and status: `Já cadastrado`, `Novo produto`, or `Precisa vincular`.

- [ ] **Step 4: Confirm import transaction in local state**

Existing product: add quantity + weighted cost + purchase movement. New product: create with sale price `0` (pending), invoice cost/quantity, catalog metadata when available. Pending rows without EAN are not imported.

- [ ] **Step 5: Commit**

Commit message: `feat: import NF-e purchase invoices into inventory`

### Task 5: Version v9 and regression verification

**Files:**
- Modify: `lib/inventory/version.ts`

**Interfaces:**
- `INVENTORY_APP_VERSION = 'v9'` is the single version source.

- [ ] **Step 1: Set shared version to v9**

- [ ] **Step 2: Run all inventory tests**

Run scanner policy + NF-e + intake tests.

- [ ] **Step 3: Verify production build**

Confirm Next build, TypeScript, `/inventory-v1`, `/api/products/lookup`, `/api/inventory/state`.

- [ ] **Step 4: Smoke-test product lookup**

Use a known EAN and verify name/photo metadata is returned and cached.

- [ ] **Step 5: Check production runtime logs for new 5xx errors**

- [ ] **Step 6: Commit if needed and report v9 URL**
