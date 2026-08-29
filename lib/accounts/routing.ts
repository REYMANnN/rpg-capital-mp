export function destinationAfterLogin(state: { onboarded: boolean; hasBusiness: boolean }): '/onboarding' | '/manage' {
  return state.onboarded && state.hasBusiness ? '/manage' : '/onboarding'
}

export function safeNextPath(value: string | null | undefined): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return null
  return value
}
