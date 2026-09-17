import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { createHmac, timingSafeEqual } from 'node:crypto'
import vm from 'node:vm'

// Only external boundaries are replaced: Next's scheduler, Supabase and HTTP.
// The route and WhatsApp transport below execute their actual TypeScript code.
const sources = globalThis.__sources ?? {
  route: readFileSync('app/api/whatsapp/webhook/route.ts', 'utf8'),
  client: readFileSync('lib/whatsapp.ts', 'utf8'),
}
function evaluate(source, names, bindings) {
  const js = stripTypeScriptTypes(source.replace(/^import .*$/gm, '').replace(/^export /gm, ''))
  return vm.runInNewContext('(function(){' + js + '\nreturn {' + names.join(',') + '}})()', {
    Request, Response, URL, Buffer, AbortSignal, Date, ...bindings,
  })
}
const env = {
  WHATSAPP_APP_SECRET: 'private-app-secret',
  WHATSAPP_TOKEN: 'private-access-token',
  WHATSAPP_VERIFY_TOKEN: 'private-verify-token',
  WHATSAPP_PHONE_NUMBER_ID: '123456789',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'private-service-role',
}
function harness({ missingDatabase = false, databaseError = null, graphError = false, optedOut = false } = {}) {
  const events = [], logs = [], scheduled = [], clients = []
  const runtimeEnv = { ...env }
  if (missingDatabase) delete runtimeEnv.SUPABASE_SERVICE_ROLE_KEY
  const database = {
    from(table) {
      const result = Promise.resolve({ data: optedOut ? { opted_out: true } : null, error: databaseError })
      const chain = {
        upsert(row) { events.push({ kind: 'db', table, row }); return result },
        insert(row) { events.push({ kind: 'db', table, row }); return result },
        update(row) { events.push({ kind: 'db', table, row }); return { eq: () => result } },
        select() { events.push({ kind: 'lookup' }); return { eq: () => ({ maybeSingle: () => result }) } },
      }
      return chain
    },
  }
  function createAdminClient() {
    if (!runtimeEnv.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured')
    return database
  }
  const common = {
    process: { env: runtimeEnv },
    console: { error: (...args) => logs.push(args) },
    createAdminClient,
    createClient: (url, key, options) => { clients.push({ url, key, options }); return database },
    fetch: async (_url, options) => {
      const body = JSON.parse(options.body)
      events.push({ kind: body.type === 'text' ? 'send' : 'read', body })
      return new Response(JSON.stringify(graphError ? { error: { message: 'Meta access denied', code: 190 } } : { messages: [{ id: 'outbound' }] }), { status: graphError ? 401 : 200 })
    },
  }
  const client = evaluate(sources.client, ['sendText', 'markAsRead'], common)
  const route = evaluate(sources.route, ['POST', 'GET'], {
    ...common, ...client, createHmac, timingSafeEqual, after: (fn) => scheduled.push(fn),
  })
  async function post(messages = [{ id: 'wamid.private', from: '5511999999999', type: 'text', text: { body: 'Minha mensagem privada' } }], signatureValid = true, statuses = []) {
    const raw = JSON.stringify({ entry: [{ changes: [{ value: { contacts: [{ wa_id: '5511999999999', profile: { name: 'Nome Privado' } }], messages, statuses } }] }] })
    const signature = 'sha256=' + createHmac('sha256', env.WHATSAPP_APP_SECRET).update(raw).digest('hex')
    const eventsBefore = events.length
    const response = await route.POST(new Request('https://example.test/api/whatsapp/webhook', {
      method: 'POST', body: raw, headers: { 'x-hub-signature-256': signatureValid ? signature : 'sha256=invalid' },
    }))
    assert.equal(response.status, 200)
    assert.equal(events.length, eventsBefore, 'Meta acknowledgment must precede work')
    for (const task of scheduled.splice(0)) await task()
  }
  return { events, logs, clients, post, client, route, runtimeEnv }
}
const cases = [
  ['missing database credentials cannot prevent a reply', async () => {
    const h = harness({ missingDatabase: true })
    await h.post()
    assert.equal(h.events.filter(x => x.kind === 'send').length, 1)
    assert.match(JSON.stringify(h.logs), /SUPABASE_SERVICE_ROLE_KEY/)
  }],
  ['send precedes persistence and Supabase errors retain diagnostic fields', async () => {
    const h = harness({ databaseError: { name: 'PostgrestError', message: 'column missing', code: '42703', details: 'schema mismatch', hint: 'check migration' } })
    await h.post()
    assert.equal(h.events[0].kind, 'send')
    assert.match(JSON.stringify(h.logs), /42703/)
    assert.match(JSON.stringify(h.logs), /schema mismatch/)
    assert.match(JSON.stringify(h.logs), /check migration/)
  }],
  ['database failures do not skip later messages or status records', async () => {
    const h = harness({ databaseError: { message: 'database unavailable', code: '08006' } })
    await h.post([
      { id: 'one', from: '5511999999999', type: 'text', text: { body: 'oi' } },
      { id: 'two', from: '5511888888888', type: 'text', text: { body: 'oi' } },
    ], true, [{ id: 'outgoing', status: 'delivered', timestamp: '1789667600' }])
    assert.equal(h.events.filter(x => x.kind === 'send').length, 2)
    assert.ok(h.events.some(x => x.table === 'whatsapp_message_status'))
  }],
  ['invalid signature is acknowledged without processing', async () => {
    const h = harness()
    await h.post(undefined, false)
    assert.equal(h.events.length, 0)
  }],
  ['immediate STOP acknowledgment works and persists opt-out', async () => {
    const h = harness({ optedOut: true })
    await h.post([{ id: 'stop', from: '5511999999999', type: 'text', text: { body: 'PARAR' } }])
    assert.equal(h.events[0].kind, 'send')
    assert.ok(h.events.some(x => x.table === 'whatsapp_contacts' && x.row.opted_out === true))
  }],
  ['VOLTAR confirms reactivation and persists consent', async () => {
    const h = harness({ optedOut: true })
    await h.post([{ id: 'resume', from: '5511999999999', type: 'text', text: { body: 'VOLTAR' } }])
    assert.equal(h.events[0].kind, 'send')
    assert.ok(h.events.some(x => x.table === 'whatsapp_contacts' && x.row.opted_in === true && x.row.opted_out === false))
  }],
  ['proactive send retains opt-out protection and fails closed without database', async () => {
    for (const options of [{ optedOut: true }, { missingDatabase: true }]) {
      const h = harness(options)
      const result = await h.client.sendText('5511999999999', 'proactive')
      assert.equal(result.ok, false)
      assert.equal(h.events.filter(x => x.kind === 'send').length, 0)
    }
  }],
  ['Meta failures are logged and do not discard inbound persistence', async () => {
    const h = harness({ graphError: true })
    await h.post()
    assert.match(JSON.stringify(h.logs), /Meta access denied/)
    assert.ok(h.events.some(x => x.table === 'whatsapp_inbound_messages'))
  }],
  ['diagnostics preserve stack but redact secrets and message PII', async () => {
    const failure = new Error('failure private-access-token private-app-secret private-service-role 5511999999999 Nome Privado Minha mensagem privada wamid.private')
    const h = harness({ databaseError: failure })
    await h.post()
    const logged = JSON.stringify(h.logs)
    assert.match(logged, /stack/)
    assert.match(logged, /failure/)
    for (const secret of ['private-access-token', 'private-app-secret', 'private-service-role', '5511999999999', 'Nome Privado', 'Minha mensagem privada', 'wamid.private']) assert.ok(!logged.includes(secret), secret)
  }],
  ['database client reads runtime env and is never cached across requests', async () => {
    const h = harness()
    await h.post()
    h.runtimeEnv.SUPABASE_SERVICE_ROLE_KEY = 'rotated-service-role'
    await h.post()
    assert.equal(h.clients[0].url, env.SUPABASE_URL)
    assert.equal(h.clients[0].key, env.SUPABASE_SERVICE_ROLE_KEY)
    assert.ok(h.clients.some(x => x.key === 'rotated-service-role'))
  }],
]
let failures = 0
for (const [name, run] of cases) {
  try { await run(); console.log('PASS ' + name) }
  catch (error) { failures++; console.error('FAIL ' + name + ': ' + error.message) }
}
if (failures) process.exitCode = 1
