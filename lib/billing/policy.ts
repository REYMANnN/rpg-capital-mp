export type BillingStatus = 'pending_payment_method' | 'configured' | 'active' | 'past_due' | 'cancelled'

export type BillingPlan = {
  initialCharge: null | { amountCents: 1198; dueDate: string; maxPayments: 1 }
  recurring: { amountCents: 599; firstDueDate: string }
}

const MONTHLY_AMOUNT_CENTS = 599 as const
const CATCH_UP_AMOUNT_CENTS = 1198 as const

function parseCalendarDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) throw new Error('Billing date must use YYYY-MM-DD')
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error('Billing date is invalid')
  }
  return { year, month, day }
}

function firstOfShiftedMonth(year: number, month: number, offsetMonths: number) {
  const date = new Date(Date.UTC(year, month - 1 + offsetMonths, 1))
  return `${String(date.getUTCFullYear()).padStart(4, '0')}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`
}

export function buildBillingPlan(createdDate: string): BillingPlan {
  const { year, month, day } = parseCalendarDate(createdDate)
  if (day === 1) {
    return {
      initialCharge: null,
      recurring: { amountCents: MONTHLY_AMOUNT_CENTS, firstDueDate: createdDate },
    }
  }

  return {
    initialCharge: {
      amountCents: CATCH_UP_AMOUNT_CENTS,
      dueDate: firstOfShiftedMonth(year, month, 1),
      maxPayments: 1,
    },
    recurring: {
      amountCents: MONTHLY_AMOUNT_CENTS,
      firstDueDate: firstOfShiftedMonth(year, month, 2),
    },
  }
}

export function billingAllowsAccess(status: BillingStatus | null | undefined) {
  return status === 'configured' || status === 'active'
}

export const BALCAO_MONTHLY_AMOUNT_CENTS = MONTHLY_AMOUNT_CENTS
