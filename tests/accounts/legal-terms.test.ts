import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const root = process.cwd()

function read(path: string) {
  return readFileSync(join(root, path), 'utf8')
}

test('billing onboarding requires the four legal acceptances before payment', () => {
  const termsPath = join(root, 'lib/legal/onboardingTerms.ts')
  assert.ok(existsSync(termsPath), 'expected lib/legal/onboardingTerms.ts')

  const terms = read('lib/legal/onboardingTerms.ts')
  for (const title of ['Termos de Uso', 'Termos Comerciais', 'Dados e Privacidade (LGPD)', 'Termos de IA']) {
    assert.match(terms, new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }

  const billing = read('components/accounts/OnboardingBillingStep.tsx')
  assert.match(billing, /onboardingTerms/)
  assert.match(billing, /allLegalAccepted/)
  assert.match(billing, /Ler termo/)
})

test('public legal pages and legal footer expose the official company identity', () => {
  for (const path of ['app/privacidade/page.tsx', 'app/termos/page.tsx', 'components/LegalFooter.tsx']) {
    assert.ok(existsSync(join(root, path)), `expected ${path}`)
  }

  const expectedCnpj = '57.114.756/0001-89'
  const expectedName = '57.114.756 RENAN PANGONI GUADALUPE'
  assert.match(read('components/LegalFooter.tsx'), new RegExp(expectedCnpj.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.match(read('components/LegalFooter.tsx'), new RegExp(expectedName))
})

test('sitemap lists the two public legal routes', () => {
  const sitemap = read('public/sitemap.xml')
  assert.match(sitemap, /https:\/\/rpgcapital\.com\.br\/privacidade/)
  assert.match(sitemap, /https:\/\/rpgcapital\.com\.br\/termos/)
})
