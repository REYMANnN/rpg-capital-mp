export const PUBLIC_API_VERSION = 'v1'
export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 200
export function pageSize(url: URL) { const value = Number(url.searchParams.get('limit') ?? DEFAULT_PAGE_SIZE); return Math.min(MAX_PAGE_SIZE, Math.max(1, Number.isFinite(value) ? Math.trunc(value) : DEFAULT_PAGE_SIZE)) }
export function cursorIndex(url: URL) { const raw = url.searchParams.get('cursor'); if (!raw) return 0; try { const value = Number(Buffer.from(raw, 'base64url').toString('utf8')); return Number.isInteger(value) && value >= 0 ? value : 0 } catch { return 0 } }
export function paginate<T>(items: T[], url: URL) { const start = cursorIndex(url); const limit = pageSize(url); const data = items.slice(start, start + limit); const next = start + data.length < items.length ? Buffer.from(String(start + data.length)).toString('base64url') : null; return { data, pagination: { nextCursor: next, limit, total: items.length } } }
