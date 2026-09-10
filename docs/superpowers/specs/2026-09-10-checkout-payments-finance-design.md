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
5. Add the sale total to the internal gross card amount represented by `Saldo a receber antes das taxas`.
6. Do not guess the card fee, net settlement, debit/credit, installments, or settlement date.

### Sale persistence

Extend the existing `Sale` model in a backward-compatible way with payment metadata. Existing sales without this field remain valid.

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

The sale remains the source of truth for revenue, historical product cost, COGS, gross profit, and payment method.

## Inventory behavior

The inventory effect remains tied to sale completion, not payment-method selection.

For Pix, stock is deducted only after the existing payment-received confirmation.

For cash and card, stock is deducted after the operator confirms the payment/receipt.

Every completed sale must continue to create sale movements for each sold product. Payment metadata must not change stock arithmetic.

## Finance architecture

Keep four concepts separate:

1. Sales data from Balcão checkout.
2. Gross card balance before fees, derived from card sales that are not yet reconciled.
3. Card-settlement reconciliations linking recognized acquirer deposits to card sales.
4. Actual bank balances and transactions from Malvo/Open Finance.

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

Definition:

The gross total of card sales that have not yet been included in a confirmed card-settlement reconciliation.

Helper text:

`Vendas no cartão ainda não conciliadas. Valor bruto antes das taxas da maquininha.`

This is intentionally a gross operational estimate, not a guaranteed net amount owed by an acquirer.

## Card reconciliation persistence

A separate reconciliation record is required so the system can reduce gross pending card sales without altering or deleting historical sales.

Recommended logical model:

```ts
export interface CardReconciliation {
  id: string
  bankTransactionId: string
  providerLabel?: string
  receivedCents: number
  grossMatchedCents: number
  matchedSaleIds: string[]
  effectiveFeeCents: number
  effectiveFeeBps: number | null
  status: 'suggested' | 'confirmed'
  createdAt: string
  confirmedAt?: string
}
```

The exact persistence location may follow the existing finance/Supabase patterns discovered during implementation, but it must be company-scoped, durable, and idempotent by bank transaction ID.

A card sale is considered reconciled only when its ID belongs to a `confirmed` reconciliation. Suggested matches do not reduce `Saldo a receber antes das taxas`.

## Malvo / bank settlement classification

Malvo remains the source of actual bank accounts, balances, and transactions.

When card-acquirer settlements arrive in the connected account, Balcão classifies candidate deposits as `Repasse de maquininha` based on transaction descriptors/counterparty signals.

Initial known descriptor rules may include names such as Getnet, Stone, Cielo, Rede, PagSeguro/PagBank, Mercado Pago, SafraPay, SumUp, InfinitePay and similar payment-acquirer/provider descriptors.

Rules must be conservative:

- Only positive bank inflows are candidates.
- A strong recognizable provider/counterparty descriptor is required for automatic card-settlement classification.
- Unknown deposits remain normal bank inflows.
- Classification must be idempotent; re-reading the same Malvo transaction cannot create a duplicate reconciliation.

## Reconciliation behavior

The system separates **classification** from **matching**.

### Classification

A recognized bank credit such as a strongly identified Getnet/Stone/Cielo settlement becomes a card-settlement candidate.

### Matching

The system tries to match the candidate against unreconciled card sales from a bounded lookback window. A match is acceptable only when:

- all candidate sales occurred before the bank settlement;
- gross matched sales are greater than or equal to the net bank settlement;
- the implied fee is non-negative;
- the implied effective fee rate is within a conservative plausible range of 0% to 15%; and
- there is one clearly better candidate grouping than alternatives.

When these conditions produce a unique high-confidence match, the system may create a `confirmed` reconciliation automatically.

When the match is ambiguous, create/display a `suggested` reconciliation and show a lightweight Finance review action. The suggestion must not reduce `Saldo a receber antes das taxas` until confirmed.

The review UI does not ask the operator to reconstruct installments or MDR. It shows the bank deposit, proposed gross card sales, implied difference/fee, and `Confirmar conciliação` / `Ignorar`.

### Effective fee estimate

For a confirmed reconciliation:

`effective fee = gross matched card sales - bank settlement received`

`effective fee rate = effective fee / gross matched card sales`

Label this as `Taxa efetiva estimada` because bank settlement data alone may not expose every commercial rule behind the deduction.

The merchant-level average card fee is calculated only from confirmed reconciliations, weighted by gross matched card value:

`average effective fee rate = total confirmed effective fees / total confirmed gross matched card sales`

This is distinct from contractual MDR.

## Finance UI

### Overview

Keep the current separation between operational and bank metrics.

Show at minimum:

- Vendas
- Lucro bruto
- Saldo bancário
- Saldo a receber antes das taxas

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
- `Taxa efetiva estimada`
- Pending reconciliation suggestions that need review

Do not label bank settlement as revenue or gross profit. A card settlement only converts an existing receivable into bank cash and may reveal the effective card fee.

## UX requirements

- Checkout must stay fast enough for a counter operator.
- Exactly one primary `COBRAR` button before payment selection.
- No card-detail form in the checkout.
- Pix QR flow keeps its current working behavior.
- Cash and card each need only one explicit confirmation before sale completion.
- After successful completion, clear the cart and show the existing success feedback.
- Prevent double submission while a payment action is being processed.
- Payment modal must be keyboard and mobile friendly.
- Reconciliation complexity belongs only in Finance, never in Checkout.

## Backward compatibility

- Existing sales without payment metadata must continue loading.
- Existing persisted inventory state remains valid.
- No destructive migration of historical inventory/sales data.
- Existing finance sales/COGS calculations must keep working for legacy sales.
- Existing Pix endpoint and QR implementation must remain intact.
- Existing Malvo bank transactions remain the source of bank inflow/outflow and balance.

## Error handling

- If Pix charge generation fails, do not complete the sale or change inventory.
- If a cash/card confirmation has not occurred, do not complete the sale.
- If sale completion fails, retain the cart and show an error.
- If cloud persistence temporarily fails after local state update, preserve the existing offline/sync behavior.
- Malvo classification/reconciliation failures must not affect checkout or inventory.
- A failed or ambiguous reconciliation must leave the card sale pending rather than silently clearing it.

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
- Confirmed reconciliations remove matched card sales from gross pending balance.
- Suggested reconciliations do not remove them.
- Payment-method sales totals are correct.
- Bank/acquirer settlements do not increase sales or gross profit.
- Effective fee estimate is calculated only from confirmed reconciliations.
- Average effective fee rate is weighted by reconciled gross card sales.
- Unknown bank inflows are not treated as card settlements automatically.
- Duplicate processing of the same bank transaction is idempotent.

UI tests:

- Checkout exposes `COBRAR`, not only `COBRAR NO PIX`.
- Payment selector exposes Pix, Cartão, and Dinheiro.
- Pix selection opens the existing Pix flow.
- Cash/card confirmations complete the sale.
- Finance renders `Saldo a receber antes das taxas` and payment-method breakdown.
- Finance exposes reconciliation review only for ambiguous card-settlement candidates.

## Scope exclusions for this implementation

Do not add:

- Card-brand entry.
- Debit/credit entry.
- Installment entry.
- Manual MDR entry.
- Acquirer account configuration in checkout.
- Guaranteed net receivable forecasts.
- Full card-receivables registry integration.
- Automatic reconciliation when transaction evidence is ambiguous.

These can be added later without changing the simplified checkout model.
