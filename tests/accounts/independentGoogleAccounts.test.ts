import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

test('different Google accounts may reuse the same business registration data', () => {
  const migration = readFileSync(join(process.cwd(), 'supabase/migrations/20260906_balcao_independent_google_accounts.sql'), 'utf8')
  assert.match(migration, /created_by = v_user_id/)
  assert.doesNotMatch(migration, /BALCAO_CNPJ_ALREADY_REGISTERED/)
  assert.doesNotMatch(migration, /where b\.tax_id = p_tax_id/)
})
