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

test('owner management exposes Configurações and reuses bank connections', () => {
  const shell = source('components/accounts/ManageShell.tsx')
  assert.match(shell, /Configurações/)
  assert.match(shell, /BankConnections/)
  assert.doesNotMatch(shell, /const sections = \['Início', 'Vendas', 'Estoque', 'Análises', 'Equipe', 'Mais'\]/)
})

test('Malvo can revoke an item and owner route exposes disconnect', () => {
  const client = source('lib/malvo/client.ts')
  const route = source('app/api/balcao/finance/connections/[id]/route.ts')
  const ui = source('app/inventory-v1/finance/BankConnections.tsx')
  assert.match(client, /deleteMalvoItem/)
  assert.match(client, /method:\s*'DELETE'/)
  assert.match(route, /export async function DELETE/)
  assert.match(route, /deleteMalvoItem/)
  assert.match(route, /authorization[\s\S]*google/)
  assert.match(ui, /Desconectar/)
  assert.match(ui, /confirm/)
})

test('new onboarding has a required fifth bank step and finalizes separately', () => {
  const wizard = source('components/accounts/OnboardingWizard.tsx')
  const onboardingRoute = source('app/api/balcao/onboarding/route.ts')
  const completeRoute = source('app/api/balcao/onboarding/complete/route.ts')
  const managePage = source('app/manage/page.tsx')
  assert.match(wizard, /const total = 5/)
  assert.match(wizard, /Conecte sua conta bancária/)
  assert.match(wizard, /BankConnections/)
  assert.match(wizard, /\/api\/balcao\/onboarding\/complete/)
  assert.doesNotMatch(onboardingRoute, /router\.replace/)
  assert.match(completeRoute, /balcao_finance_connections/)
  assert.match(completeRoute, /onboarding_completed/)
  assert.match(managePage, /getAccountState/)
  assert.match(managePage, /redirect\('\/onboarding'\)/)
})

test('onboarding migration leaves new profiles incomplete until Open Finance completion', () => {
  const migration = source('supabase/migrations/20260902_balcao_onboarding_requires_open_finance.sql')
  assert.match(migration, /balcao_complete_onboarding/)
  assert.match(migration, /onboarding_completed/)
  assert.match(migration, /coalesce\([^)]*onboarding_completed[^)]*,\s*false\)/i)
})
