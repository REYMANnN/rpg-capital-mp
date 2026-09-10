# Checkout payments and finance design

Date: 2026-09-10

## Goal

Make the Balcão checkout simple for the operator while recording enough payment context for the finance area to distinguish sales, bank cash flow, and card settlement.

The checkout must not ask for card fee, card brand, debit/credit, installments, acquirer, or expected settlement date. Those details are not reliably known at checkout and would damage UX.

## Approved product behavior

### Checkout

Replace the current primary action `COBRAR NO PIX` with one primary action: `COBRAR R$ X,XX`.

When pressed, show a small payment-method modal with three choices:

- Pix
- Cartão
- Dinheiro

The operator chooses only the method.

#### Pix

Keep the existing Pix flow intact:

1. Generate the current Pix charge/QR code.
2. Operator confirms `PAGAMENTO RECEBIDO`.
3. Only then complete the sale.
4. Completing the sale deducts inventory and records the sale.

#### Dinheiro

1. Show a lightweight confirmation that the amount was received in cash.
2. On confirmation, complete the sale immediately.
3. Deduct inventory.
4. Record sale, historical cost, COGS, gross profit, and payment method `cash`.
5. Do not create a bank transaction or a receivable.

#### Cartão

1. Show a lightweight confirmation instructing the operator to confirm only after the terminal displays an approved payment.
2. On confirmation, complete the sale immediately.
3. Deduct inventory.
4. Record sale, historical cost, COGS, gross profit, and payment method `card`.
5. Create an internal gross card receivable amount equal to the sale total.
6. Do not guess the card fee, net settlement, debit/credit, installments, or settlement date.

### Sale persistence

Extend the existing `Sale` model in a backward-compatible way with payment metadata. Existing sales without this field remain valid.

Recommended shape:

```ts
export type PaymentMethod = 'pix' | 'card' | 'cash'

export interface SalePayment {
  method: PaymentMethod
  confirmedAt: string
}

export interface Sale {
  id: string
  createdAt: string
  totalCents: number
  cogsCents: number
  grossProfitCents: number
  items: SaleItem[]
  payment?: SalePayment
}
```

For the first version, gross card receivable is derived from sales where `payment.method === 'card'`; no separate receivables ledger is required.

## Inventory behavior

The inventory effect remains tied to sale completion, not payment-method selection.

For Pix, stock is deducted only after the existing payment-received confirmation.

For cash and card, stock is deducted after the operator confirms the payment/receipt.

Every completed sale must continue to create sale movements for each sold product. Payment metadata must not change stock arithmetic.

## Finance architecture

Keep three concepts separate:

1. Sales data from Balcão checkout.
2. Gross card receivables derived from un-reconciled card sales.
3. Actual bank balances and transactions from Malvo/Open Finance.

A bank settlement is not a new sale and must never be added to revenue or gross profit a second time.

### Core sales metrics

Continue to calculate:

- Sales revenue from Balcão sales.
- COGS from the historical product costs stored on sale items.
- Gross profit = sales revenue - COGS.
- Gross margin from gross profit / sales revenue.

These metrics are independent of whether the customer paid by Pix, card, or cash.

### Payment-method metrics

Add sales breakdown for the selected period:

- Card sales.
- Pix sales.
- Cash sales.
- Unclassified legacy sales if needed.

### Card metric

Expose a finance metric named exactly:

`Saldo a receber antes das taxas`

Definition for v1:

The gross value of card sales that have not yet been reconciled against a recognized card-acquirer bank settlement.

Until automatic reconciliation is reliable, the system must not present this as a guaranteed net amount owed by an acquirer. Helper text should explain that it is the gross card-sale value before terminal/acquirer fees.

## Malvo / bank settlement classification

Malvo remains the source of actual bank accounts, balances, and transactions.

When card-acquirer settlements arrive in the connected account, Balcão may classify them as `Repasse de maquininha` based on transaction descriptors/counterparty signals.

Initial known descriptor rules may include names such as Getnet, Stone, Cielo, Rede, PagSeguro/PagBank, Mercado Pago, SafraPay, SumUp, InfinitePay and similar payment-acquirer/provider descriptors.

Rules must be conservative. A transaction should only be classified automatically when there is a strong recognizable descriptor. Unknown deposits remain normal bank inflows.

## Reconciliation model

The first implementation must keep reconciliation deliberately conservative.

### V1

- Card sales create gross receivable exposure internally.
- Recognized acquirer deposits from Malvo are displayed as card settlements received.
- Finance can calculate observed settlement values and show them separately from sales.
- Do not automatically force an exact many-sales-to-one-deposit match unless the evidence is strong enough.
- Do not decrement gross card receivable using arbitrary bank inflows.

### Effective fee estimate

Where a reconciliation can be established, calculate:

`effective fee = gross reconciled card sales - bank settlement received`

and

`effective fee rate = effective fee / gross reconciled card sales`

Label this as `Taxa efetiva estimada` because bank settlement data alone may not expose every commercial rule behind the deduction.

The finance area may later use historical reconciliations to estimate the merchant's average effective card cost. This estimate must remain distinct from actual contractual MDR.

## Finance UI

### Overview

Keep the current separation between operational and bank metrics.

Show at minimum:

- Vendas
- Lucro bruto
- Saldo bancário
- Saldo a receber antes das taxas

The card-receivable card should include helper copy such as:

`Vendas no cartão ainda não conciliadas. Valor bruto antes das taxas da maquininha.`

### Sales view

Add a payment-method breakdown:

- Cartão
- Pix
- Dinheiro

Add a recent-sales list/table showing, where available:

- Sale identifier/date
- Payment method
- Sale total
- COGS
- Gross profit

### Card / reconciliation information

Show, when data exists:

- Card sales gross value
- `Saldo a receber antes das taxas`
- Recognized card settlements received in the bank
- Estimated effective fee / rate for reconciled amounts

Do not label bank settlement as revenue or gross profit.

## UX requirements

- Checkout must stay fast enough for a counter operator.
- Exactly one primary `COBRAR` button before payment selection.
- No card-detail form in the checkout.
- Pix QR flow keeps its current working behavior.
- Cash and card each need only one explicit confirmation before sale completion.
- After successful completion, clear the cart and show the existing success feedback.
- Prevent double submission while a payment action is being processed.
- Payment modal must be keyboard and mobile friendly.

## Backward compatibility

- Existing sales without payment metadata must continue loading.
- Existing persisted inventory state remains valid.
- No destructive migration of historical inventory/sales data.
- Existing finance sales/COGS calculations must keep working for legacy sales.
- Existing Pix endpoint and QR implementation must remain intact.

## Error handling

- If Pix charge generation fails, do not complete the sale or change inventory.
- If a cash/card confirmation has not occurred, do not complete the sale.
- If sale completion fails, retain the cart and show an error.
- If cloud persistence temporarily fails after local state update, preserve the existing offline/sync behavior.
- Malvo classification/reconciliation failures must not affect checkout or inventory.

## Testing

Use TDD for implementation.

Core tests:

- Sale can persist `pix`, `card`, and `cash` payment methods.
- Legacy sales remain valid.
- Cash confirmation deducts inventory exactly once.
- Card confirmation deducts inventory exactly once and records card method.
- Pix still requires payment confirmation before sale completion.
- Card sales contribute to gross `Saldo a receber antes das taxas`.
- Pix and cash sales do not contribute to that metric.
- Payment-method sales totals are correct.
- Bank/acquirer settlements do not increase sales or gross profit.
- Effective fee estimate is calculated only from valid reconciled data.
- Unknown bank inflows are not treated as card settlements automatically.

UI tests:

- Checkout exposes `COBRAR`, not only `COBRAR NO PIX`.
- Payment selector exposes Pix, Cartão, and Dinheiro.
- Pix selection opens the existing Pix flow.
- Cash/card confirmations complete the sale.
- Finance renders `Saldo a receber antes das taxas` and payment-method breakdown.

## Scope exclusions for this implementation

Do not add:

- Card-brand entry.
- Debit/credit entry.
- Installment entry.
- Manual MDR entry.
- Acquirer account configuration in checkout.
- Guaranteed net receivable forecasts.
- Full card-receivables registry integration.
- Automatic exact reconciliation when transaction evidence is ambiguous.

These can be added later without changing the simplified checkout model.
