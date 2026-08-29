export type OperationalAccessInput = {
  hasInstallationCookie: boolean
  googleMember: boolean
  terminalValid: boolean
  staffSessionValid: boolean
}

export type OperationalAccessDecision = {
  authorized: boolean
  mode: 'google' | 'staff' | null
}

export function decideOperationalAccess(input: OperationalAccessInput): OperationalAccessDecision {
  if (input.googleMember) return { authorized: true, mode: 'google' }
  if (input.terminalValid && input.staffSessionValid) return { authorized: true, mode: 'staff' }
  return { authorized: false, mode: null }
}
