// Junta três versões do estado da loja: a base (última lida da nuvem), a local (o que a tela mudou)
// e a remota (o que está na nuvem agora, ex.: mudado pela Rafa no WhatsApp). Puro e testável.
//
// Regras:
// • Vendas e movimentações só crescem: fica a união por id (nada some).
// • Produto: campo que a tela mudou vence; o que a tela não mudou fica como está na nuvem.
// • Estoque é somado pela diferença: nuvem + (local − base). Assim uma venda na tela e uma
//   entrada pela Rafa ao mesmo tempo contam as duas.
// • Produto novo na tela entra; produto apagado na tela (sumiu da lista) sai.

type WithId = { id: string }
type Row = WithId & Record<string, unknown>
type Loose = { products: Row[]; sales: WithId[]; movements: WithId[]; [key: string]: unknown }

function same(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b)
}

function unionById<T extends WithId>(remote: T[], base: T[], local: T[]) {
  const seen = new Set(remote.map((item) => item.id))
  const baseIds = new Set(base.map((item) => item.id))
  const added = local.filter((item) => !baseIds.has(item.id) && !seen.has(item.id))
  const removedLocally = new Set(base.filter((item) => !local.some((row) => row.id === item.id)).map((item) => item.id))
  return [...remote.filter((item) => !removedLocally.has(item.id)), ...added]
}

export function mergeStoreStates<T extends { products: WithId[]; sales: WithId[]; movements: WithId[] }>(baseIn: T, localIn: T, remoteIn: T): T {
  const base = baseIn as unknown as Loose
  const local = localIn as unknown as Loose
  const remote = remoteIn as unknown as Loose
  const baseById = new Map(base.products.map((product) => [product.id, product]))
  const localById = new Map(local.products.map((product) => [product.id, product]))
  const products: Row[] = []

  for (const remoteProduct of remote.products) {
    const before = baseById.get(remoteProduct.id)
    const mine = localById.get(remoteProduct.id)
    if (!before) { products.push(remoteProduct); continue } // novo na nuvem
    if (!mine) continue // apagado na tela
    const merged: Record<string, unknown> = { ...remoteProduct }
    const keys = new Set([...Object.keys(before), ...Object.keys(mine), ...Object.keys(remoteProduct)])
    for (const key of keys) {
      if (key === 'stockMilli') continue
      if (!same(mine[key], before[key])) merged[key] = mine[key]
    }
    merged.stockMilli = Number(remoteProduct.stockMilli) + (Number(mine.stockMilli) - Number(before.stockMilli))
    products.push(merged as Row)
  }
  for (const mine of local.products) {
    if (!baseById.has(mine.id) && !products.some((product) => product.id === mine.id)) products.push(mine)
  }

  const otherKeys: Record<string, unknown> = {}
  for (const key of Object.keys(local)) {
    if (key === 'products' || key === 'sales' || key === 'movements') continue
    otherKeys[key] = same(local[key], base[key]) ? remote[key] ?? local[key] : local[key]
  }

  return {
    ...remote,
    ...otherKeys,
    products,
    sales: unionById(remote.sales, base.sales, local.sales),
    movements: unionById(remote.movements, base.movements, local.movements),
  } as unknown as T
}
