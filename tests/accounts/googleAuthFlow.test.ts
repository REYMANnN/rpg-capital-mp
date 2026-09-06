import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const buttonSource = readFileSync(new URL('../../components/accounts/GoogleAuthButton.tsx', import.meta.url), 'utf8')
const homeSource = readFileSync(new URL('../../app/home/page.tsx', import.meta.url), 'utf8')
const loginSource = readFileSync(new URL('../../app/login/page.tsx', import.meta.url), 'utf8')

test('Google login stays inside BALCAO instead of depending on Supabase redirect URLs', () => {
  assert.match(buttonSource, /signInWithIdToken/)
  assert.doesNotMatch(buttonSource, /signInWithOAuth/)
  assert.match(buttonSource, /accounts\.google\.com\/gsi\/client/)
  assert.equal(existsSync(new URL('../../app/auth/google/complete/route.ts', import.meta.url)), true)
})

test('Criar Conta always starts a fresh Google signup instead of reusing the active BALCAO session', () => {
  const resetRoute = new URL('../../app/auth/signup/reset/route.ts', import.meta.url)
  assert.equal(existsSync(resetRoute), true, 'expected a signup reset route that clears the current BALCAO session')
  const resetSource = readFileSync(resetRoute, 'utf8')

  assert.match(homeSource, /href="\/auth\/signup\/reset"/)
  assert.match(loginSource, /intent === 'signup'[\s\S]*redirect\('\/auth\/signup\/reset'\)/)
  assert.match(resetSource, /auth\.signOut\(\)/)
  assert.match(resetSource, /\/login\?intent=signup/)
})
