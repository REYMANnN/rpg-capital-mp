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

test('management settings expose plan and billing controls', () => {
  const shell = source('components/accounts/ManageShell.tsx')
  assert.match(shell, /Plano e cobrança/)
  assert.match(shell, /\/billing\/settings/)
})

test('billing settings make cancellation an explicit account closure', () => {
  const page = source('app/billing/settings/page.tsx')
  const control = source('components/accounts/BillingAccountClosure.tsx')
  assert.match(page, /R\$ 5,99/)
  assert.match(page, /todo dia 1/i)
  assert.match(control, /Encerrar conta/)
  assert.match(control, /ENCERRAR CONTA/)
  assert.match(control, /não é apenas pausar/i)
})

test('account closure is owner-only, cancels Asaas and disconnects Malvo', () => {
  const route = source('app/api/balcao/billing/asaas/cancel/route.ts')
  assert.match(route, /role !== 'owner'/)
  assert.match(route, /deleteAsaasSubscription/)
  assert.match(route, /disconnectMalvoForAccountClosure/)
  assert.match(route, /ENCERRAR CONTA/)
})

test('account closure deactivates the business surface and allows a future fresh onboarding', () => {
  const server = source('lib/billing/server.ts')
  assert.match(server, /disconnectMalvoForAccountClosure/)
  assert.match(server, /balcao_businesses/)
  assert.match(server, /inventory_v1_stores/)
  assert.match(server, /balcao_business_members/)
  assert.match(server, /balcao_staff_profiles/)
  assert.match(server, /balcao_terminals/)
  assert.match(server, /status:\s*'cancelled'/)
  assert.match(server, /onboarding_completed:\s*false/)
})
