'use client'

import type { ParsedNfe } from '@/lib/inventory/nfe'
import type { InvoiceReviewLineV10 } from '@/lib/inventory/invoiceReview'
import InvoiceIntakeV10_1 from './InvoiceIntakeV10_1'

type ProductLike = {
  id: string
  barcode: string
  name: string
  priceCents: number
  unit: 'UN' | 'KG'
  catalogBrand?: string
  catalogImageUrl?: string
  catalogSource?: string
}

type Props = {
  products: ProductLike[]
  onCommit: (invoice: ParsedNfe, lines: InvoiceReviewLineV10[]) => void
  fail: (message: string) => void
  flash: (message: string) => void
}

const STORAGE_KEY = 'rpg-inventory-v1-2026'

function duplicateFromLocalState(invoice: ParsedNfe) {
  if (typeof window === 'undefined') return false
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return false
    const state = JSON.parse(raw)
    if (!Array.isArray(state?.movements)) return false
    const marker = `NF-e:${invoice.accessKey || `${invoice.supplierDocument}:${invoice.number}:${invoice.issuedAt}`}`
    return state.movements.some((movement: any) =>
      movement?.type === 'purchase'
      && ((invoice.accessKey && movement?.invoiceKey === invoice.accessKey) || String(movement?.note || '').includes(marker)),
    )
  } catch {
    return false
  }
}

export default function InvoiceIntakeV10(props: Props) {
  return <InvoiceIntakeV10_1 {...props} isDuplicateInvoice={duplicateFromLocalState} />
}
