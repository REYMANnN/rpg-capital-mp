export function destinationAfterLogin(state: { onboarded: boolean; hasBusiness: boolean }): '/onboarding' | '/manage' {
  return state.onboarded && state.hasBusiness ? '/manage' : '/onboarding'
}

// Só caminhos do próprio site. Barra invertida, espaços/controle e "//" viram outro site em alguns navegadores.
export function safeNextPath(value: string | null | undefined): string | null {
  if (!value || value.length > 300 || !value.startsWith('/') || value.startsWith('//')) return null
  if (/[\\\s\u0000-\u001f\u007f]/.test(value)) return null
  try {
    const parsed = new URL(value, 'https://local.invalid')
    if (parsed.origin !== 'https://local.invalid') return null
  } catch {
    return null
  }
  return value
}
