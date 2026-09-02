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
  assert.match(shell, /Contas bancárias/)
  assert.doesNotMatch(shell, /const sections = \['Início', 'Vendas', 'Estoque', 'Análises', 'Equipe', 'Mais'\]/)
})

test('Malvo can revoke an item and management route exposes disconnect', () => {
  const client = source('lib/malvo/client.ts')
  const route = source('app/api/balcao/finance/connections/[id]/route.ts')
  const migration = source('supabase/migrations/20260902_balcao_finance_connections_without_service_role.sql')
  const ui = source('app/inventory-v1/finance/BankConnections.tsx')
  assert.match(client, /deleteMalvoItem/)
  assert.match(client, /method:\s*'DELETE'/)
  assert.match(route, /export async function DELETE/)
  assert.match(route, /deleteMalvoItem/)
  assert.match(route, /balcao_get_finance_connection_for_management/)
  assert.match(route, /balcao_disconnect_finance_connection/)
  assert.match(migration, /balcao_business_members/)
  assert.match(migration, /owner[\s\S]*admin[\s\S]*manager/)
  assert.match(ui, /Desconectar/)
  assert.match(ui, /confirm/)
})

test('new onboarding routes incomplete businesses to a required fifth bank step', () => {
  const page = source('app/onboarding/page.tsx')
  const bankStep = source('components/accounts/OnboardingBankStep.tsx')
  const onboardingRoute = source('app/api/balcao/onboarding/route.ts')
  const completeRoute = source('app/api/balcao/onboarding/complete/route.ts')
  const managePage = source('app/manage/page.tsx')
  assert.match(page, /!state\.onboarded && state\.hasBusiness/)
  assert.match(page, /OnboardingBankStep/)
  assert.match(bankStep, /Etapa 5 de 5/)
  assert.match(bankStep, /BankConnections/)
  assert.match(bankStep, /returnTo="onboarding"/)
  assert.match(bankStep, /\/api\/balcao\/onboarding\/complete/)
  assert.match(onboardingRoute, /balcao_require_open_finance_onboarding/)
  assert.match(completeRoute, /balcao_complete_open_finance_onboarding/)
  assert.match(managePage, /getAccountState/)
  assert.match(managePage, /if \(!state\.onboarded\) redirect\('\/onboarding'\)/)
})

test('onboarding migration requires a real Malvo connection before completion', () => {
  const migration = source('supabase/migrations/20260902_balcao_onboarding_requires_open_finance.sql')
  assert.match(migration, /balcao_require_open_finance_onboarding/)
  assert.match(migration, /onboarding_completed = false/)
  assert.match(migration, /balcao_complete_open_finance_onboarding/)
  assert.match(migration, /balcao_finance_connections/)
  assert.match(migration, /status in \('pending', 'active', 'updating'\)/)
  assert.match(migration, /onboarding_completed = true/)
})
