import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
function source(path: string) {
  const full = join(root, path)
  assert.equal(existsSync(full), true, `${path} is missing`)
  return readFileSync(full, 'utf8')
}

test('onboarding cannot finish before at least one bank connection is active', () => {
  const step = source('components/accounts/OnboardingBankStep.tsx')
  const route = source('app/api/balcao/onboarding/complete/route.ts')

  assert.match(step, /activeConnectionCount/)
  assert.match(step, /activeConnectionCount\s*<\s*1/)
  assert.match(step, /Conecte pelo menos uma conta bancária/)
  assert.match(route, /BALCAO_OPEN_FINANCE_REQUIRED/)
})

test('bank connection UI reports only onboarding-eligible Malvo connections back to onboarding', () => {
  const connections = source('app/inventory-v1/finance/BankConnections.tsx')
  assert.match(connections, /onConnectionCountChange/)
  assert.match(connections, /\['pending', 'active', 'updating'\]/)
  assert.match(connections, /onConnectionCountChange\?\./)
})

test('owner settings makes adding and removing bank connections explicit for legacy accounts', () => {
  const manage = source('components/accounts/ManageShell.tsx')
  const connections = source('app/inventory-v1/finance/BankConnections.tsx')

  assert.match(manage, /Contas bancárias/)
  assert.match(manage, /BankConnections/)
  assert.match(connections, /Adicionar conta/)
  assert.match(connections, /Remover conexão/)
})
