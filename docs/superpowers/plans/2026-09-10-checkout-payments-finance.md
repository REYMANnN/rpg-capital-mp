# Checkout Payments and Finance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a single checkout `COBRAR` action with Pix, Cartão, and Dinheiro payment choices, persist payment method on each sale, and expose card gross receivable / settlement insights in Finance without double-counting bank deposits as revenue.

**Architecture:** Extend the existing sale snapshot with optional payment metadata so legacy state remains valid. Checkout continues to use the existing `completeSale` stock/cost logic and existing Pix QR endpoint; cash and card only add explicit operator confirmation. Finance derives payment-method totals from persisted sales and classifies strongly recognizable positive bank transactions from acquirers as card settlements, keeping sales and bank cash flow separate.

**Tech Stack:** Next.js 16.2.4, React 19, TypeScript, Node test runner, Supabase-backed inventory state/RPC, Malvo/Open Finance transaction data.

**Spec:** `docs/superpowers/specs/2026-09-10-checkout-payments-finance-design.md`

## Global Constraints

- Checkout exposes exactly one primary `COBRAR` action before payment selection.
- Do not ask for card brand, debit/credit, installments, MDR, acquirer, or settlement date in checkout.
- Existing Pix QR generation remains intact and still requires `PAGAMENTO RECEBIDO` before completing the sale.
- Existing sales without payment metadata remain valid.
- Bank settlements never increase sales revenue or gross profit.
- `Saldo a receber antes das taxas` is gross card value before acquirer fees; it must never be presented as guaranteed net cash.
- Acquirer classification must be conservative and based on recognizable positive transaction descriptors/counterparties.
- No destructive database migration is required; payment metadata lives inside the existing persisted sale JSON.

---

### Task 1: Persist payment method on sale snapshots

**Files:**
- Modify: `lib/inventory/core.ts`
- Test: `tests/accounts/checkoutPayments.test.ts`

**Interfaces:**
- Produces: `PaymentMethod = 'pix' | 'card' | 'cash'`
- Produces: optional `Sale.payment?: { method: PaymentMethod; confirmedAt: string }`
- Produces: `completeSale(products, lines, saleId, payment?)` while preserving current 3-argument callers.

- [ ] **Step 1: Write the failing core test**

```ts
const result = completeSale(products, [{ productId: 'p1', quantityMilli: 1000 }], 's1', {
  method: 'card',
  confirmedAt: '2026-09-10T12:00:00.000Z',
})
assert.equal(result.sale.payment?.method, 'card')
assert.equal(result.products[0].stockMilli, 1000)
```

Also assert the 3-argument legacy call still returns a valid sale with no required payment field.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --experimental-strip-types --test tests/accounts/checkoutPayments.test.ts`
Expected: FAIL because `completeSale` does not accept/persist payment metadata yet.

- [ ] **Step 3: Implement the minimal backward-compatible sale type change**

```ts
export type PaymentMethod = 'pix' | 'card' | 'cash'
export interface SalePayment { method: PaymentMethod; confirmedAt: string }
export interface Sale { /* existing fields */ payment?: SalePayment }
export function completeSale(products: Product[], lines: CartInput[], saleId: string, payment?: SalePayment) {
  // existing arithmetic unchanged
  return { products: nextProducts, sale: { /* existing snapshot */, ...(payment ? { payment } : {}) } }
}
```

- [ ] **Step 4: Re-run focused test and verify GREEN**

Run: `node --experimental-strip-types --test tests/accounts/checkoutPayments.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/inventory/core.ts tests/accounts/checkoutPayments.test.ts
git commit -m "feat: persist checkout payment method"
```

### Task 2: Replace the Pix-only checkout button with the payment selector

**Files:**
- Modify: `app/inventory-v1/InventoryV1.tsx`
- Modify: `app/inventory-v1/inventory.module.css`
- Test: `tests/accounts/checkoutPayments.test.ts`

**Interfaces:**
- Consumes: `PaymentMethod`, `completeSale(..., payment)` from Task 1.
- Produces: checkout flow `COBRAR -> Pix | Cartão | Dinheiro`.

- [ ] **Step 1: Add failing source-level UI acceptance assertions**

```ts
assert.match(source, />COBRAR</)
assert.match(source, /Pix/)
assert.match(source, /Cartão/)
assert.match(source, /Dinheiro/)
assert.match(source, /Pagamento aprovado na maquininha/)
```

Also assert that the old primary checkout action is no longer rendered as `COBRAR NO PIX`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --experimental-strip-types --test tests/accounts/checkoutPayments.test.ts`
Expected: FAIL on the new payment-selector assertions.

- [ ] **Step 3: Parameterize sale completion by payment method**

Change the existing checkout completion handler to accept `method: PaymentMethod`, generate one `confirmedAt`, pass it to `completeSale`, and keep the current stock movement creation unchanged.

```ts
function checkout(method: PaymentMethod) {
  const confirmedAt = new Date().toISOString()
  const result = completeSale(products, lines, uid(), { method, confirmedAt })
  // existing product/sale/movement state update
}
```

- [ ] **Step 4: Add the payment-method modal**

The total card primary action becomes `COBRAR`. Clicking it opens a modal with exactly three large choices. `Pix` closes the selector and invokes the existing `chargePix()`. `Cartão` opens a one-confirmation approval view; confirmation calls `checkout('card')`. `Dinheiro` opens a one-confirmation cash view; confirmation calls `checkout('cash')`.

The existing Pix modal keeps its QR/copy behavior; only `confirmPixPayment()` changes to call `checkout('pix')`.

- [ ] **Step 5: Prevent accidental double submission**

Use a local boolean state for sale confirmation and disable confirmation/payment buttons while the completion action is executing. Clear payment modal state after successful completion; preserve cart on failure.

- [ ] **Step 6: Add focused responsive styles**

Add payment selector cards/buttons to `inventory.module.css` following the current rounded-card language, with a 3-column desktop layout and stacked mobile layout. Do not restructure unrelated inventory styles.

- [ ] **Step 7: Re-run focused tests**

Run: `node --experimental-strip-types --test tests/accounts/checkoutPayments.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add app/inventory-v1/InventoryV1.tsx app/inventory-v1/inventory.module.css tests/accounts/checkoutPayments.test.ts
git commit -m "feat: add checkout payment selector"
```

### Task 3: Derive payment and conservative card-settlement metrics

**Files:**
- Modify: `lib/finance/dashboard.ts`
- Test: `tests/accounts/financeDashboard.test.ts`
- Test: `tests/accounts/checkoutPayments.test.ts`

**Interfaces:**
- Consumes: `InventorySaleInput.payment?.method`.
- Produces: `dashboard.paymentSummary` with card/pix/cash/legacy totals.
- Produces: `dashboard.card` with gross card sales, gross pending before fees, recognized settlement amount, reconciled gross, estimated fee amount/rate, and recognized settlement transaction rows.
- Produces: `dashboard.recentSales` containing sale id/date/method/total/COGS/gross profit.

- [ ] **Step 1: Add failing finance tests**

Create inventory sales for card, Pix, cash, and legacy methods and assert:

```ts
assert.equal(dashboard.paymentSummary.cardSalesCents, 10000)
assert.equal(dashboard.paymentSummary.pixSalesCents, 5000)
assert.equal(dashboard.paymentSummary.cashSalesCents, 3000)
assert.equal(dashboard.card.grossCardSalesCents, 10000)
```

Add a positive bank transaction with `counterpartyName: 'Getnet'` and verify it is recognized as a card settlement but does not change `summary.salesCents` or `summary.grossProfitCents`.

- [ ] **Step 2: Run finance tests and verify RED**

Run: `node --experimental-strip-types --test tests/accounts/financeDashboard.test.ts tests/accounts/checkoutPayments.test.ts`
Expected: FAIL because payment/card summaries do not exist.

- [ ] **Step 3: Extend inventory sale input type**

```ts
type InventorySaleInput = {
  // existing fields
  payment?: { method?: 'pix' | 'card' | 'cash'; confirmedAt?: string }
}
```

- [ ] **Step 4: Add conservative acquirer recognition**

Normalize `description + counterpartyName` accent/case-insensitively. Treat only positive, non-internal transactions containing a strong provider descriptor as recognized settlement. Initial descriptor list: `GETNET`, `STONE`, `CIELO`, `REDE`, `PAGSEGURO`, `PAGBANK`, `MERCADO PAGO`, `MERCADOPAGO`, `SAFRAPAY`, `SUMUP`, `INFINITEPAY`.

- [ ] **Step 5: Add conservative day-bucket reconciliation**

Group card sales by UTC date. For each recognized settlement, inspect unmatched contiguous card-sale day windows ending 0-7 days before the bank posting date. A candidate is eligible only when `settlement <= gross` and the implied fee is between 0% and 10%. Choose the eligible candidate with the smallest fee rate; mark those day buckets matched once. Do not consume arbitrary bank inflows or ambiguous negative/over-gross candidates.

```ts
feeCents = matchedGrossCents - settlementCents
feeRateBps = Math.round(feeCents * 10_000 / matchedGrossCents)
```

Pending gross is the sum of unmatched card-sale buckets. This intentionally favors conservative under-reconciliation over false matching.

- [ ] **Step 6: Add recent sales and payment totals**

Return sales in the selected period sorted newest first, including stored COGS when present and derived historical COGS fallback when necessary.

- [ ] **Step 7: Re-run finance tests and verify GREEN**

Run: `node --experimental-strip-types --test tests/accounts/financeDashboard.test.ts tests/accounts/checkoutPayments.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/finance/dashboard.ts tests/accounts/financeDashboard.test.ts tests/accounts/checkoutPayments.test.ts
git commit -m "feat: derive checkout payment finance metrics"
```

### Task 4: Expose payment insights in the Finance UI

**Files:**
- Modify: `app/inventory-v1/FinanceDashboard.tsx`
- Test: `tests/accounts/financeUi.test.ts`

**Interfaces:**
- Consumes: `dashboard.paymentSummary`, `dashboard.card`, `dashboard.recentSales` from Task 3.
- Produces: visible `Saldo a receber antes das taxas`, payment-method breakdown, recognized settlements, fee estimate, and recent-sales table.

- [ ] **Step 1: Add failing UI acceptance tests**

```ts
assert.match(source, /Saldo a receber antes das taxas/)
assert.match(source, /Vendas por forma de pagamento/)
assert.match(source, /Taxa efetiva estimada/)
assert.match(source, /Últimas vendas/)
```

- [ ] **Step 2: Run the UI test and verify RED**

Run: `node --experimental-strip-types --test tests/accounts/financeUi.test.ts`
Expected: FAIL on new labels.

- [ ] **Step 3: Add overview card**

Add a fourth operational metric card:

```tsx
<MetricCard
  eyebrow="Cartão"
  label="Saldo a receber antes das taxas"
  value={money(dashboard.card.pendingGrossCents)}
  helper="Vendas no cartão ainda não conciliadas. Valor bruto antes das taxas da maquininha."
  icon={WalletCards}
/>
```

- [ ] **Step 4: Add payment breakdown and recent sales to Sales view**

Render Cartão, Pix, Dinheiro, and legacy/unclassified when non-zero. Render recent sales with id/date/payment label/total/COGS/gross profit. Keep this distinct from bank transactions.

- [ ] **Step 5: Add reconciliation summary**

When recognized settlements exist, show settlement received, reconciled gross, estimated fee amount/rate, and settlement rows. Label the rate `Taxa efetiva estimada`; never call it contractual MDR.

- [ ] **Step 6: Re-run UI test and verify GREEN**

Run: `node --experimental-strip-types --test tests/accounts/financeUi.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/inventory-v1/FinanceDashboard.tsx tests/accounts/financeUi.test.ts
git commit -m "feat: show payment and card metrics in finance"
```

### Task 5: Verify integration, merge, and deploy

**Files:**
- No product code expected unless verification reveals a defect.

**Interfaces:**
- Consumes all previous tasks.
- Produces a green branch, merged `master`, and verified Vercel production deployment.

- [ ] **Step 1: Run all relevant account/inventory tests**

Run:

```bash
node --experimental-strip-types --test tests/accounts/*.test.ts
node --experimental-strip-types --test tests/inventory*.test.ts tests/scanner-policy.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run production build**

Run: `npm run build`
Expected: Next.js build completes with no TypeScript/build errors.

- [ ] **Step 3: Open PR and wait for CI**

Create a PR from `feat/checkout-payments-finance` to `master`. Require the repository's existing Balcão/Inventory CI checks to pass before merge.

- [ ] **Step 4: Review the changed-file diff**

Verify no unrelated refactor, no card fee field in checkout, Pix endpoint untouched, and bank settlement is never added to sales/gross profit.

- [ ] **Step 5: Merge to master**

Use squash merge after green CI.

- [ ] **Step 6: Verify Vercel production deployment**

Confirm the production deployment builds from the merged master commit and reaches `READY` with the production target/aliases.

- [ ] **Step 7: Post-deploy smoke checks**

Verify `/inventory-v1` returns HTTP 200, production client output contains `Saldo a receber antes das taxas`, `Cartão`, `Dinheiro`, and the new `COBRAR` selector copy, and scan recent runtime errors after deployment.
