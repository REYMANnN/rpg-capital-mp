import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

function source(file: string) {
  return fs.readFileSync(file, 'utf8')
}

function productionSources(root: string): string[] {
  const files: string[] = []
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name)
    if (entry.isDirectory()) files.push(...productionSources(full))
    else if (/\.(?:ts|tsx|js|jsx)$/.test(entry.name)) files.push(full)
  }
  return files
}

const removedProductionFiles = [
  'components/accounts/TestGoogleLoginButton.tsx',
  'app/api/balcao/test-magic-link/route.ts',
  'app/auth/test-complete/page.tsx',
  'app/cadastro/page.tsx',
  'app/cadastro/layout.tsx',
  'app/auth/callback/route.ts',
  'app/app/page.tsx',
  'app/u/page.tsx',
  'app/t/page.tsx',
  'app/api/user/setup/route.ts',
  'app/api/user/balance/route.ts',
  'app/api/pay/route.ts',
  'app/api/pix/send/route.ts',
  'app/api/virtual-card/route.ts',
  'app/api/terminal/bind/route.ts',
  'app/api/terminal/heartbeat/route.ts',
  'app/api/invoice/emit/route.ts',
  'lib/rate-limit.ts',
]

test('temporary and disconnected legacy auth/payment surfaces do not ship', () => {
  for (const file of removedProductionFiles) {
    assert.equal(fs.existsSync(file), false, `${file} must not ship in production`)
  }
})

test('production TypeScript does not hardcode personal Gmail or test-account access', () => {
  for (const root of ['app', 'components', 'lib']) {
    for (const file of productionSources(root)) {
      const text = source(file)
      assert.doesNotMatch(text, /[A-Z0-9._%+-]+@gmail\.com/i, `personal Gmail found in ${file}`)
      assert.doesNotMatch(text, /conta de teste|test-magic-link|auth\/test-complete/i, `test access found in ${file}`)
    }
  }
})

test('current Google ID-token authentication remains intact', () => {
  const google = source('components/accounts/GoogleAuthButton.tsx')
  const login = source('app/login/page.tsx')
  const completion = source('app/auth/google/complete/route.ts')

  assert.match(google, /signInWithIdToken/)
  assert.match(google, /provider:\s*['"]google['"]/)
  assert.match(google, /nonce/)
  assert.match(login, /GoogleAuthButton/)
  assert.match(completion, /getCurrentUser/)
  assert.match(completion, /destinationAfterLogin/)
})

test('inventory authorization cannot be disabled by environment configuration', () => {
  const page = source('app/inventory-v1/page.tsx')
  const stateRoute = source('app/api/inventory/state/route.ts')

  assert.doesNotMatch(page, /BALCAO_ACCOUNTS_ENFORCED/)
  assert.doesNotMatch(stateRoute, /BALCAO_ACCOUNTS_ENFORCED/)
  assert.match(page, /authorizeInventoryContext/)
  assert.match(stateRoute, /authorizeInventoryContext/)
})

test('global security headers protect the app while preserving barcode camera access', () => {
  const config = source('next.config.ts')

  assert.match(config, /X-Content-Type-Options/)
  assert.match(config, /nosniff/)
  assert.match(config, /X-Frame-Options/)
  assert.match(config, /DENY/)
  assert.match(config, /Referrer-Policy/)
  assert.match(config, /strict-origin-when-cross-origin/)
  assert.match(config, /Permissions-Policy/)
  assert.match(config, /camera=\(self\)/)
  assert.match(config, /Strict-Transport-Security/)
})

test('Supabase service-role and provider secrets are loaded from server environment variables', () => {
  const admin = source('lib/supabase/admin.ts')
  const malvo = source('lib/malvo/client.ts')
  const asaas = source('lib/asaas/client.ts')

  assert.match(admin, /process\.env\.SUPABASE_SERVICE_ROLE_KEY/)
  assert.match(malvo, /process\.env\[name\]/)
  assert.match(asaas, /process\.env\.ASAAS_API_KEY_balcao/)
  assert.doesNotMatch(admin, /sb_secret_|eyJ[a-zA-Z0-9_-]{20,}/)
})
