import test from 'node:test'
import assert from 'node:assert/strict'
import { buildBillingPlan, billingAllowsAccess, type BillingStatus } from '../../lib/billing/policy'

test('customer created on day 1 pays R$ 5.99 on day 1 with no catch-up charge', () => {
  assert.deepEqual(buildBillingPlan('2026-09-01'), {
    initialCharge: null,
    recurring: { amountCents: 599, firstDueDate: '2026-09-01' },
  })
})

test('customer created after day 1 pays R$ 11.98 next day 1 then R$ 5.99 monthly', () => {
  assert.deepEqual(buildBillingPlan('2026-09-17'), {
    initialCharge: { amountCents: 1198, dueDate: '2026-10-01', maxPayments: 1 },
    recurring: { amountCents: 599, firstDueDate: '2026-11-01' },
  })
})

test('calendar logic crosses year boundary without proration', () => {
  assert.deepEqual(buildBillingPlan('2026-12-31'), {
    initialCharge: { amountCents: 1198, dueDate: '2027-01-01', maxPayments: 1 },
    recurring: { amountCents: 599, firstDueDate: '2027-02-01' },
  })
})

test('only configured or paid billing states can use the system', () => {
  const allowed: BillingStatus[] = ['configured', 'active']
  const blocked: BillingStatus[] = ['pending_payment_method', 'past_due', 'cancelled']
  for (const status of allowed) assert.equal(billingAllowsAccess(status), true, status)
  for (const status of blocked) assert.equal(billingAllowsAccess(status), false, status)
})
