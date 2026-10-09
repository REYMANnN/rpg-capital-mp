import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import test from 'node:test'

import { formatSaoPaulo, planSync, sheetConfigFromEnv, syncSubscribers, type SheetConfig } from '../lib/newsletter/sheets-core.ts'

const HEADER = ['ID', 'Nome', 'E-mail', 'Empresa', 'Cidade', 'Origem', 'Data de cadastro', 'Ativo', 'Descadastrado', 'Data de descadastro', 'Último envio', 'Observações']
const TAB = 'Destinatários'

/** Planilha falsa em memória que imita os 3 endpoints usados (get, batchUpdate, append). */
function fakeSheet(initial: string[][], opts: { failWith?: number } = {}) {
  const rows = initial.map((r) => [...r])
  const calls: string[] = []
  const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
    const url = decodeURIComponent(String(input))
    calls.push(`${init?.method ?? 'GET'} ${url}`)
    if (opts.failWith) return new Response('{"error":{"message":"backend error"}}', { status: opts.failWith })
    const body = init?.body ? JSON.parse(String(init.body)) : {}
    if (url.includes(':append')) {
      assert.match(url, /valueInputOption=RAW/)
      for (const v of body.values) rows.push([...v])
      return Response.json({})
    }
    if (url.endsWith('values:batchUpdate')) {
      assert.equal(body.valueInputOption, 'RAW')
      for (const { range, values } of body.data) {
        const m = /!([A-L])(\d+)$/.exec(range)!
        const col = m[1].charCodeAt(0) - 65
        const row = Number(m[2]) - 1
        while (rows[row].length <= col) rows[row].push('')
        rows[row][col] = values[0][0]
      }
      return Response.json({})
    }
    return Response.json({ values: rows.map((r) => [...r]) })
  }) as typeof fetch
  const cfg: SheetConfig = { spreadsheetId: 'sheet', tab: TAB, clientEmail: 'sa@x.iam.gserviceaccount.com', privateKey: '', accessToken: 't', fetchImpl }
  return { rows, calls, cfg }
}

const countEmail = (rows: string[][], email: string) => rows.filter((r) => (r[2] ?? '').trim().toLowerCase() === email).length

test('Teste 1 — e-mail novo entra uma vez com Origem Site RPG, Ativo SIM, Descadastrado NÃO', async () => {
  const email = `teste-newsletter-${Date.now()}@example.com`
  const s = fakeSheet([HEADER])
  const r = await syncSubscribers(s.cfg, [{ id: 'uuid-1', email, name: 'Ana', source: 'site_edu', createdAt: '2026-10-09T14:18:00Z' }], 'upsert')
  assert.deepEqual(r, { added: 1, updated: 0, existing: 0, duplicatesInSheet: 0 })
  assert.equal(countEmail(s.rows, email), 1)
  assert.deepEqual(s.rows[1], ['uuid-1', 'Ana', email, '', '', 'Site RPG', '09/10/2026 11:18', 'SIM', 'NÃO', '', '', ''])
})

test('Teste 2 — mesmo e-mail de novo (maiúsculas/espaços) não cria segunda linha', async () => {
  const s = fakeSheet([HEADER])
  await syncSubscribers(s.cfg, [{ email: 'joao@example.com', name: 'João' }], 'upsert')
  const r = await syncSubscribers(s.cfg, [{ email: '  JOAO@Example.com ', name: 'João Silva' }], 'upsert')
  assert.equal(r.added, 0)
  assert.equal(countEmail(s.rows, 'joao@example.com'), 1)
  assert.equal(s.rows[1][1], 'João Silva', 'nome é campo seguro e é atualizado')
})

test('Teste 3 — descadastrado continua SIM, status e último envio intocados, sem linha nova', async () => {
  const row = ['id-9', 'Bia', 'bia@example.com', 'Mercadinho', 'SJC', 'site_edu', '01/10/2026 10:00', 'SIM', 'SIM', '05/10/2026', '06/10/2026', 'pediu pra sair']
  const s = fakeSheet([HEADER, row])
  const r = await syncSubscribers(s.cfg, [{ id: 'id-9', email: 'bia@example.com', name: 'Bia', source: 'site_edu' }], 'upsert')
  assert.equal(r.added, 0)
  assert.equal(s.rows.length, 2)
  assert.deepEqual(s.rows[1].slice(6), row.slice(6), 'data, Ativo, Descadastrado, data descadastro, último envio, obs preservados')
  assert.equal(s.rows[1][5], 'Site RPG')
  assert.equal(s.rows[1][3], 'Mercadinho', 'empresa vazia no formulário não apaga a existente')
})

test('Teste 3b — nome vazio no formulário não apaga nome existente', () => {
  const plan = planSync([HEADER, ['', 'Carla', 'carla@example.com', '', '', 'Site RPG']], [{ email: 'carla@example.com', name: '', source: 'site_edu' }], TAB, 'upsert')
  assert.deepEqual(plan.updates, [])
})

test('Teste 4 — falha do Google lança erro (o cadastro no Supabase já foi gravado antes e não é desfeito)', async () => {
  const s = fakeSheet([HEADER], { failWith: 503 })
  await assert.rejects(syncSubscribers(s.cfg, [{ email: 'x@example.com' }], 'upsert'), /google_sheets_failed 503/)
  assert.ok(s.calls.every((c) => c.startsWith('GET')), 'nenhuma escrita tentada após a falha de leitura')
})

test('Teste 5 — recuperação adiciona só ausentes, é idempotente e preserva status', async () => {
  const kept = ['id-1', 'Ana', 'ana@example.com', '', '', 'site_edu', '07/10/2026 18:10', 'NÃO', 'SIM', '', '08/10/2026', '']
  const s = fakeSheet([HEADER, kept])
  const subs = [
    { id: 'id-1', email: 'ana@example.com', name: 'Ana Nova', source: 'site_edu' },
    { id: 'id-2', email: 'beto@example.com', name: null, source: 'site_edu_aulas', createdAt: '2026-10-08T12:00:00Z' },
    { id: 'id-3', email: 'caio@example.com', name: 'Caio', source: 'site_edu' },
  ]
  const first = await syncSubscribers(s.cfg, subs, 'missing-only')
  assert.deepEqual(first, { added: 2, updated: 0, existing: 1, duplicatesInSheet: 0 })
  for (let i = 0; i < 100; i++) {
    const again = await syncSubscribers(s.cfg, subs, 'missing-only')
    assert.equal(again.added, 0)
    assert.equal(again.updated, 0)
  }
  assert.equal(s.rows.length, 4)
  assert.deepEqual(s.rows[1], kept, 'linha existente intacta (nem o nome muda na recuperação)')
  assert.equal(s.rows[2][5], 'Site RPG')
})

test('texto com cara de fórmula é gravado em RAW (não executa)', async () => {
  const s = fakeSheet([HEADER])
  await syncSubscribers(s.cfg, [{ email: 'f@example.com', name: '=IMPORTXML("http://x","//a")' }], 'upsert')
  assert.equal(s.rows[1][1], '=IMPORTXML("http://x","//a")')
  assert.ok(s.calls.some((c) => c.includes('valueInputOption=RAW')))
})

test('duplicatas pré-existentes na planilha são reportadas e não aumentam', () => {
  const plan = planSync([HEADER, ['', '', 'd@example.com'], ['', '', 'D@example.com ']], [{ email: 'd@example.com' }], TAB, 'missing-only')
  assert.equal(plan.appends.length, 0)
  assert.deepEqual(plan.duplicatesInSheet, ['d@example.com'])
})

test('autenticação: assina JWT da service account e troca por access token', async () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
  let tokenRequest = ''
  const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.startsWith('https://oauth2.googleapis.com/token')) {
      tokenRequest = String(init?.body)
      return Response.json({ access_token: 'real-token', expires_in: 3600 })
    }
    assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer real-token')
    return Response.json({ values: [HEADER] })
  }) as typeof fetch
  const cfg = sheetConfigFromEnv({ GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: 'sa@p.iam.gserviceaccount.com', private_key: pem }) })!
  assert.equal(cfg.spreadsheetId, '13CKTkL7nj1TiMRfSUHqAYoTNzx9w9oCGQfJUojP_PlE')
  assert.equal(cfg.tab, 'Destinatários')
  await syncSubscribers({ ...cfg, fetchImpl }, [], 'missing-only')
  const params = new URLSearchParams(tokenRequest)
  assert.equal(params.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer')
  const payload = JSON.parse(Buffer.from(params.get('assertion')!.split('.')[1], 'base64url').toString())
  assert.equal(payload.iss, 'sa@p.iam.gserviceaccount.com')
  assert.equal(payload.scope, 'https://www.googleapis.com/auth/spreadsheets')
})

test('sem credenciais → config nula (cadastro segue, sync é pulada)', () => {
  assert.equal(sheetConfigFromEnv({}), null)
})

test('data em horário de São Paulo', () => {
  assert.equal(formatSaoPaulo('2026-10-07T21:10:06Z'), '07/10/2026 18:10')
})
