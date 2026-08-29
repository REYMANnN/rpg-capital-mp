import bcrypt from 'bcryptjs'

function assertPin(pin: string) {
  if (!/^\d{4}$/.test(pin)) throw new Error('O PIN deve ter 4 dígitos.')
}

export async function hashPin(pin: string): Promise<string> {
  assertPin(pin)
  return bcrypt.hash(pin, 10)
}

export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  if (!/^\d{4}$/.test(pin)) return false
  return bcrypt.compare(pin, hash)
}
