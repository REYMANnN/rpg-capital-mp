/**
 * Núcleo da sincronização da newsletter com o Google Sheets (aba "Destinatários").
 * Sem imports internos do app: roda tanto no servidor Next quanto nos testes com `node --test`.
 * Nunca importar em componente client — usa a chave privada da service account.
 */
import { SignJWT, importPKCS8 } from 'jose'

export const NEWSLETTER_SHEET_DEFAULT_ID = '13CKTkL7nj1TiMRfSUHqAYoTNzx9w9oCGQfJUojP_PlE'
export const NEWSLETTER_SHEET_DEFAULT_TAB = 'Destinatários'
export const ORIGIN_SITE = 'Site RPG'

// Colunas A..L da aba Destinatários (índice 0-based).
const COL = { id: 0, name: 1, email: 2, company: 3, city: 4, origin: 5, createdAt: 6, active: 7, unsubscribed: 8 } as const
const COL_LETTER = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']

export type SheetConfig = {
  spreadsheetId: string
  tab: string
  clientEmail: string
  privateKey: string
  /** Só para testes: pula a assinatura do JWT. */
  accessToken?: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

export type NewsletterSubscriber = {
  id?: string | null
  email: string
  name?: string | null
  company?: string | null
  city?: string | null
  /** `source` do Supabase (site_edu, site_edu_aulas…) ou rótulo final. */
  source?: string | null
  createdAt?: string | Date | null
}

/** 'upsert' = cadastro do site (cria ou atualiza campos seguros). 'missing-only' = recuperação (só cria ausentes). */
export type SyncMode = 'upsert' | 'missing-only'

export type SyncPlan = {
  appends: string[][]
  updates: Array<{ range: string; values: string[][] }>
  /** E-mails que já estavam na planilha (não geraram linha nova). */
  existing: number
  /** Linhas duplicadas já presentes na planilha (só reportadas, nunca apagadas). */
  duplicatesInSheet: string[]
}

export function normalizeEmail(email: unknown): string {
  return String(email ?? '').trim().toLowerCase()
}

export function originLabel(source?: string | null): string {
  const value = (source ?? '').trim()
  if (!value || value.toLowerCase().startsWith('site')) return ORIGIN_SITE
  return value
}

/** "09/10/2026 11:18" no fuso de São Paulo — mesmo formato já usado na planilha. */
export function formatSaoPaulo(input?: string | Date | null): string {
  const date = input ? new Date(input) : new Date()
  const safe = Number.isNaN(date.getTime()) ? new Date() : date
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(safe).map((p) => [p.type, p.value]),
  )
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`
}

function clean(value?: string | null): string {
  return (value ?? '').trim()
}

function quotedTab(tab: string): string {
  return `'${tab.replace(/'/g, "''")}'`
}

export function newRow(sub: NewsletterSubscriber): string[] {
  return [
    clean(sub.id), clean(sub.name), normalizeEmail(sub.email), clean(sub.company), clean(sub.city),
    originLabel(sub.source), formatSaoPaulo(sub.createdAt), 'SIM', 'NÃO', '', '', '',
  ]
}

/**
 * Decide o que escrever, sem tocar na rede. Regras:
 * - e-mail é a chave (trim + lowercase); nunca cria segunda linha para o mesmo e-mail;
 * - nunca escreve Ativo, Descadastrado, Data de descadastro nem Último envio de linha existente;
 * - em 'upsert', atualiza só Nome/Empresa/Cidade (quando vieram preenchidos), Origem e ID vazio.
 */
export function planSync(rows: string[][], subscribers: NewsletterSubscriber[], tab: string, mode: SyncMode): SyncPlan {
  const index = new Map<string, number>() // email -> índice da linha em `rows`
  const duplicatesInSheet: string[] = []
  rows.forEach((row, i) => {
    if (i === 0) return // cabeçalho
    const email = normalizeEmail(row[COL.email])
    if (!email) return
    if (index.has(email)) duplicatesInSheet.push(email)
    else index.set(email, i)
  })

  const plan: SyncPlan = { appends: [], updates: [], existing: 0, duplicatesInSheet }
  const seen = new Set<string>()
  const t = quotedTab(tab)

  for (const sub of subscribers) {
    const email = normalizeEmail(sub.email)
    if (!email || !email.includes('@') || seen.has(email)) continue
    seen.add(email)

    const rowIndex = index.get(email)
    if (rowIndex === undefined) {
      plan.appends.push(newRow({ ...sub, email }))
      continue
    }

    plan.existing++
    if (mode !== 'upsert') continue

    const row = rows[rowIndex]
    const sheetRow = rowIndex + 1
    const wanted: Array<[number, string]> = [
      [COL.name, clean(sub.name)],
      [COL.company, clean(sub.company)],
      [COL.city, clean(sub.city)],
      [COL.origin, originLabel(sub.source)],
    ]
    if (!clean(row[COL.id]) && clean(sub.id)) wanted.push([COL.id, clean(sub.id)])

    for (const [col, value] of wanted) {
      if (!value || clean(row[col]) === value) continue
      plan.updates.push({ range: `${t}!${COL_LETTER[col]}${sheetRow}`, values: [[value]] })
    }
  }
  return plan
}

// ---------------------------------------------------------------- Google API

const tokenCache = new Map<string, { token: string; expiresAt: number }>()

async function getAccessToken(cfg: SheetConfig, doFetch: typeof fetch): Promise<string> {
  if (cfg.accessToken) return cfg.accessToken
  const cached = tokenCache.get(cfg.clientEmail)
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token

  const key = await importPKCS8(cfg.privateKey.replace(/\\n/g, '\n'), 'RS256')
  const now = Math.floor(Date.now() / 1000)
  const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/spreadsheets' })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(cfg.clientEmail)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key)

  const response = await doFetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    signal: AbortSignal.timeout(cfg.timeoutMs ?? 8000),
  })
  const json = (await response.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string }
  if (!response.ok || !json.access_token) throw new Error(`google_token_failed ${response.status} ${json.error ?? ''}`.trim())
  tokenCache.set(cfg.clientEmail, { token: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 })
  return json.access_token
}

async function sheetsCall(cfg: SheetConfig, path: string, init: RequestInit = {}): Promise<unknown> {
  const doFetch = cfg.fetchImpl ?? fetch
  const token = await getAccessToken(cfg, doFetch)
  const response = await doFetch(`https://sheets.googleapis.com/v4/spreadsheets/${cfg.spreadsheetId}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(cfg.timeoutMs ?? 8000),
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`google_sheets_failed ${response.status} ${text.slice(0, 300)}`)
  return text ? JSON.parse(text) : {}
}

export async function readRecipientRows(cfg: SheetConfig): Promise<string[][]> {
  const range = encodeURIComponent(`${quotedTab(cfg.tab)}!A:L`)
  const json = (await sheetsCall(cfg, `/values/${range}?valueRenderOption=FORMATTED_VALUE`)) as { values?: string[][] }
  return json.values ?? []
}

export type SyncResult = { added: number; updated: number; existing: number; duplicatesInSheet: number }

/** Lê a aba, planeja e grava. Escrita sempre em RAW (nada vira fórmula). */
export async function syncSubscribers(cfg: SheetConfig, subscribers: NewsletterSubscriber[], mode: SyncMode): Promise<SyncResult> {
  const rows = await readRecipientRows(cfg)
  const plan = planSync(rows, subscribers, cfg.tab, mode)

  if (plan.updates.length) {
    await sheetsCall(cfg, '/values:batchUpdate', {
      method: 'POST',
      body: JSON.stringify({ valueInputOption: 'RAW', data: plan.updates }),
    })
  }
  if (plan.appends.length) {
    const range = encodeURIComponent(`${quotedTab(cfg.tab)}!A:L`)
    await sheetsCall(cfg, `/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
      method: 'POST',
      body: JSON.stringify({ values: plan.appends }),
    })
  }
  return { added: plan.appends.length, updated: plan.updates.length, existing: plan.existing, duplicatesInSheet: plan.duplicatesInSheet.length }
}

/** Lê credenciais do ambiente. Aceita o JSON inteiro da service account ou e-mail + chave separados. */
export function sheetConfigFromEnv(env: Record<string, string | undefined> = process.env): SheetConfig | null {
  let clientEmail = env.GOOGLE_SHEETS_CLIENT_EMAIL?.trim() ?? ''
  let privateKey = env.GOOGLE_SHEETS_PRIVATE_KEY ?? ''
  const json = env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim()
  if (json) {
    try {
      const parsed = JSON.parse(json) as { client_email?: string; private_key?: string }
      clientEmail = parsed.client_email?.trim() || clientEmail
      privateKey = parsed.private_key || privateKey
    } catch {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON inválido')
    }
  }
  if (!clientEmail || !privateKey) return null
  return {
    spreadsheetId: env.NEWSLETTER_SHEET_ID?.trim() || NEWSLETTER_SHEET_DEFAULT_ID,
    tab: env.NEWSLETTER_SHEET_TAB?.trim() || NEWSLETTER_SHEET_DEFAULT_TAB,
    clientEmail,
    privateKey,
  }
}
