import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const source = readFileSync(join(process.cwd(), 'components/accounts/OnboardingWizard.tsx'), 'utf8')

test('onboarding masks Brazilian structured fields while allowing paste', () => {
  assert.match(source, /formatCep/)
  assert.match(source, /formatPhone/)
  assert.match(source, /formatTaxId/)
  assert.match(source, /inputMode="numeric"/)
  assert.match(source, /autoComplete="postal-code"/)
  assert.match(source, /autoComplete="tel"/)
})

test('CEP lookup automatically assists the address without locking manual editing', () => {
  assert.match(source, /\/api\/balcao\/cep\//)
  assert.match(source, /Buscando endereço/)
  assert.match(source, /Endereço encontrado/)
  assert.match(source, /addressNumberRef/)
})

test('Pix is optional and uses an explicit type selector with type-specific formatting', () => {
  assert.match(source, /pixType/)
  assert.match(source, /CPF/)
  assert.match(source, /CNPJ/)
  assert.match(source, /Telefone/)
  assert.match(source, /E-mail/)
  assert.match(source, /Chave aleatória/)
  assert.match(source, /formatPixKey/)
  assert.match(source, /opcional/i)
})

test('validation is field-specific and submit is protected from double click', () => {
  assert.match(source, /fieldErrors/)
  assert.match(source, /aria-invalid/)
  assert.match(source, /focusFirstInvalid/)
  assert.match(source, /if \(busy\) return/)
  assert.match(source, /disabled=\{busy\}/)
})
