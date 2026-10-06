export type TrialInputError = 'missing_contact_name' | 'missing_business_name' | 'invalid_phone'

export function normalizeTrialPhone(value: string) {
  let phone = String(value || '').replace(/\D/g, '')
  if (phone.startsWith('55') && (phone.length === 12 || phone.length === 13)) {
    // already normalized
  } else if (phone.length === 10 || phone.length === 11) {
    phone = `55${phone}`
  } else {
    return null
  }
  const local = phone.slice(2)
  if (!/^[1-9]{2}[2-9][0-9]{7,8}$/.test(local)) return null
  return phone
}

export function validateTrialInput(input: { contactName?: unknown; businessName?: unknown; phone?: unknown }) {
  const contactName = typeof input.contactName === 'string' ? input.contactName.trim().replace(/\s+/g, ' ') : ''
  const businessName = typeof input.businessName === 'string' ? input.businessName.trim().replace(/\s+/g, ' ') : ''
  const phone = typeof input.phone === 'string' ? normalizeTrialPhone(input.phone) : null

  if (!contactName) return { ok: false as const, error: 'missing_contact_name' as const }
  if (!businessName) return { ok: false as const, error: 'missing_business_name' as const }
  if (!phone) return { ok: false as const, error: 'invalid_phone' as const }

  return {
    ok: true as const,
    value: {
      contactName: contactName.slice(0, 120),
      businessName: businessName.slice(0, 160),
      phone,
    },
  }
}
