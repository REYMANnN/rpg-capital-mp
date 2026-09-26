import assert from 'node:assert/strict'
import test from 'node:test'
import { randomBytes, scryptSync } from 'node:crypto'
import { readFileSync } from 'node:fs'

import { couponLink, createAdminSession, newCouponCode, normalizeCouponCode, verifyAdminSession, verifyPasswordHash } from '../../lib/admin/core.ts'

process.env.BALCAO_LINK_SECRET = '0123456789abcdef0123456789abcdef0123456789abcdef'

function hash(password: string) {
  const salt = randomBytes(16)
  const value = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 })
  return `scrypt$16384$8$1$${salt.toString('base64')}$${value.toString('base64')}`
}

test('admin password hash accepts only the right password', () => {
  const stored = hash('senha-certa')
  assert.equal(verifyPasswordHash('senha-certa', stored), true)
  assert.equal(verifyPasswordHash('senha-errada', stored), false)
  assert.equal(verifyPasswordHash('senha-certa', 'lixo'), false)
})

test('admin session is signed and expires', () => {
  const now = Date.now()
  const token = createAdminSession(now)
  assert.equal(verifyAdminSession(token, now + 1000), true)
  assert.equal(verifyAdminSession(token, now + 13 * 60 * 60 * 1000), false)
  const [payload, signature] = token.split('.')
  const forged = Buffer.from(JSON.stringify({ exp: now + 10 ** 12 })).toString('base64url')
  assert.equal(verifyAdminSession(`${forged}.${signature}`, now), false)
  assert.equal(verifyAdminSession(`${payload}.x${signature.slice(1)}`, now), false)
  assert.equal(verifyAdminSession(undefined, now), false)
})

test('coupon codes are well formed and normalized', () => {
  for (let i = 0; i < 50; i += 1) assert.match(newCouponCode(), /^RPG-[A-HJ-NP-Z2-9]{6}$/)
  assert.equal(normalizeCouponCode(' rpg-ab12cd '), 'RPG-AB12CD')
  assert.equal(normalizeCouponCode('RPG-123'), null)
  assert.equal(normalizeCouponCode("RPG-ABCDEF'; drop"), null)
  assert.equal(couponLink('RPG-AB12CD'), 'https://www.rpgcapital.com.br/c/RPG-AB12CD')
})

test('coupon migration: single use, courtesy unlocks bank and onboarding', () => {
  const sql = readFileSync('supabase/migrations/20260926_rpg_admin_coupons.sql', 'utf8')
  assert.match(sql, /for update/)
  assert.match(sql, /v_coupon\.status <> 'available'/)
  assert.match(sql, /'courtesy', 'courtesy_ending'/)
  assert.match(sql, /revoke all on table public\.balcao_coupons from public, anon, authenticated/)
  assert.match(sql, /revoke all on table public\.rpg_admin_settings from public, anon, authenticated/)
})
