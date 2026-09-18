'use client'

import { useEffect, useMemo, useState } from 'react'

type Candidate = {
  id?: string
  barcode: string
  name: string
  brand?: string
  priceCents?: number
}

type Line = {
  description?: string | null
  supplier_code?: string | null
  ean?: string | null
  quantity?: number | null
  unit_cost_cents?: number | null
  total_cents?: number | null
  unit_package?: string | null
  confidence?: { product?: number; quantity?: number; cost?: number }
  resolution?: {
    status: 'resolved' | 'ambiguous' | 'new' | 'unresolved'
    candidate?: Candidate
    candidates?: Candidate[]
  }
}

type Invoice = {
  id: string
  supplier_name?: string | null
  supplier_cnpj?: string | null
  extraction?: { lines?: Line[] }
  status: string
}

type Decision = {
  index: number
  productId?: string
  barcode?: string
  name?: string
  salePriceCents?: number
  quantity?: number
  unitCostCents?: number
  productConfirmed?: boolean
}

const money = (cents: number) => (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function RafaShelfReviewPage() {
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [decisions, setDecisions] = useState<Record<number, Decision>>({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('rafa_invoice')
    if (!id) {
      setError('Nota não encontrada.')
      return
    }
    fetch(`/api/rafa/invoice?id=${encodeURIComponent(id)}`, { cache: 'no-store' })
      .then(async (response) => ({ response, json: await response.json() }))
      .then(({ response, json }) => {
        if (!response.ok || !json?.ok) throw new Error(json?.error || 'Falha ao carregar a nota.')
        setInvoice(json.invoice)
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Falha ao carregar a nota.'))
  }, [])

  const lines = invoice?.extraction?.lines || []
  const exceptionCount = useMemo(() => lines.filter((line) => {
    const confidence = line.confidence || {}
    return line.resolution?.status !== 'resolved'
      || Number(confidence.product || 0) < 0.85
      || Number(confidence.quantity || 0) < 0.85
      || Number(confidence.cost || 0) < 0.85
  }).length, [lines])

  const identifiedCount = Math.max(0, lines.length - exceptionCount)
  const units = lines.reduce((sum, line, index) => sum + Number(decisions[index]?.quantity ?? line.quantity ?? 0), 0)
  const totalCostCents = lines.reduce((sum, line, index) => {
    const q = Number(decisions[index]?.quantity ?? line.quantity ?? 0)
    const cost = Number(decisions[index]?.unitCostCents ?? line.unit_cost_cents ?? 0)
    return sum + Math.round(q * cost)
  }, 0)

  function patch(index: number, value: Partial<Decision>) {
    setDecisions((current) => ({
      ...current,
      [index]: { ...(current[index] || { index }), ...value, index },
    }))
  }

  function productReady(line: Line, index: number) {
    const resolution = line.resolution
    if (!resolution) return false
    if (resolution.status === 'unresolved') return false
    if (resolution.status === 'new') return Number.isInteger(decisions[index]?.salePriceCents) && Number(decisions[index]?.salePriceCents) >= 0
    if (resolution.status === 'ambiguous') return Boolean(decisions[index]?.productId || decisions[index]?.barcode)
    if (Number(line.confidence?.product || 0) < 0.85) return decisions[index]?.productConfirmed === true
    return true
  }

  const ready = lines.length > 0 && lines.every((line, index) => {
    const q = Number(decisions[index]?.quantity ?? line.quantity)
    const cost = Number(decisions[index]?.unitCostCents ?? line.unit_cost_cents)
    return productReady(line, index) && Number.isFinite(q) && q > 0 && Number.isInteger(cost) && cost >= 0
  })

  async function submit() {
    if (!invoice || !ready || saving) return
    setSaving(true)
    setError('')
    try {
      const response = await fetch('/api/rafa/invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ importId: invoice.id, decisions: Object.values(decisions) }),
      })
      const json = await response.json().catch(() => null)
      if (!response.ok || !json?.ok) throw new Error(json?.error || 'Não consegui adicionar a nota.')
      setDone(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não consegui adicionar a nota.')
    } finally {
      setSaving(false)
    }
  }

  if (error && !invoice) return <main className="mx-auto max-w-2xl p-6"><h1 className="text-2xl font-semibold">Rafa</h1><p className="mt-4">{error}</p></main>
  if (!invoice) return <main className="mx-auto max-w-2xl p-6"><p>Carregando a nota...</p></main>
  if (done) return <main className="mx-auto max-w-2xl p-6"><h1 className="text-2xl font-semibold">Pronto</h1><p className="mt-3">A entrada foi adicionada à prateleira. A Rafa enviou o resumo no WhatsApp.</p></main>

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6">
      <div className="mb-6">
        <p className="text-sm opacity-70">Rafa · Prateleira</p>
        <h1 className="text-2xl font-semibold">
          Nota de {invoice.supplier_name || 'fornecedor'} — {lines.length} itens
        </h1>
        <p className="mt-1">{identifiedCount} identificados · {exceptionCount} precisam de você</p>
      </div>

      <div className="space-y-3">
        {lines.map((line, index) => {
          const resolution = line.resolution
          const lowProduct = Number(line.confidence?.product || 0) < 0.85
          const lowQuantity = Number(line.confidence?.quantity || 0) < 0.85
          const lowCost = Number(line.confidence?.cost || 0) < 0.85
          const candidates = resolution?.status === 'ambiguous'
            ? resolution.candidates || []
            : resolution?.candidate ? [resolution.candidate] : []
          const exception = resolution?.status !== 'resolved' || lowProduct || lowQuantity || lowCost

          return (
            <section key={index} className="rounded-xl border p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <strong>{line.description || 'Produto sem descrição'}</strong>
                  <div className="text-sm opacity-70">
                    {line.supplier_code ? `Cód. fornecedor ${line.supplier_code}` : 'Sem código do fornecedor'}
                    {line.ean ? ` · EAN ${line.ean}` : ''}
                  </div>
                </div>
                <span className="text-sm">{exception ? 'Revisar' : '✓ Identificado'}</span>
              </div>

              {resolution?.status === 'resolved' && resolution.candidate && (
                <div className="mt-3 text-sm">
                  Produto: <b>{resolution.candidate.name}</b>
                  {lowProduct && (
                    <button
                      className="ml-3 rounded-lg border px-3 py-1"
                      onClick={() => patch(index, { productConfirmed: true, productId: resolution.candidate?.id, barcode: resolution.candidate?.barcode, name: resolution.candidate?.name })}
                    >
                      Confirmar produto
                    </button>
                  )}
                </div>
              )}

              {resolution?.status === 'ambiguous' && (
                <label className="mt-3 block text-sm">
                  Qual é o produto?
                  <select
                    className="mt-1 w-full rounded-lg border bg-transparent p-2"
                    value={decisions[index]?.productId || decisions[index]?.barcode || ''}
                    onChange={(event) => {
                      const candidate = candidates.find((item) => (item.id || item.barcode) === event.target.value)
                      if (candidate) patch(index, { productId: candidate.id, barcode: candidate.barcode, name: candidate.name, productConfirmed: true })
                    }}
                  >
                    <option value="">Escolha</option>
                    {candidates.slice(0, 3).map((candidate) => (
                      <option key={candidate.id || candidate.barcode} value={candidate.id || candidate.barcode}>
                        {candidate.name}{candidate.brand ? ` · ${candidate.brand}` : ''}{candidate.priceCents != null ? ` · ${money(candidate.priceCents)}` : ''}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {resolution?.status === 'new' && resolution.candidate && (
                <div className="mt-3">
                  <div className="text-sm">Novo produto: <b>{resolution.candidate.name}</b></div>
                  <label className="mt-2 block text-sm">
                    Preço de venda
                    <input
                      className="mt-1 w-full rounded-lg border bg-transparent p-2"
                      inputMode="decimal"
                      placeholder="0,00"
                      onChange={(event) => {
                        const value = Number(event.target.value.replace(',', '.'))
                        patch(index, {
                          barcode: resolution.candidate?.barcode,
                          name: resolution.candidate?.name,
                          salePriceCents: Number.isFinite(value) ? Math.round(value * 100) : undefined,
                          productConfirmed: true,
                        })
                      }}
                    />
                  </label>
                </div>
              )}

              {resolution?.status === 'unresolved' && (
                <p className="mt-3 text-sm">Não consegui identificar este produto com segurança. Use o cadastro manual para este item.</p>
              )}

              <div className="mt-3 grid grid-cols-2 gap-3">
                <label className="text-sm">
                  Quantidade
                  <input
                    className="mt-1 w-full rounded-lg border bg-transparent p-2"
                    type="number"
                    step="0.001"
                    defaultValue={line.quantity ?? ''}
                    disabled={!lowQuantity && line.quantity != null}
                    onChange={(event) => patch(index, { quantity: Number(event.target.value) })}
                  />
                </label>
                <label className="text-sm">
                  Custo unitário
                  <input
                    className="mt-1 w-full rounded-lg border bg-transparent p-2"
                    inputMode="decimal"
                    defaultValue={line.unit_cost_cents != null ? (line.unit_cost_cents / 100).toFixed(2) : ''}
                    disabled={!lowCost && line.unit_cost_cents != null}
                    onChange={(event) => {
                      const value = Number(event.target.value.replace(',', '.'))
                      patch(index, { unitCostCents: Number.isFinite(value) ? Math.round(value * 100) : undefined })
                    }}
                  />
                </label>
              </div>
            </section>
          )
        })}
      </div>

      <section className="mt-6 rounded-xl border p-4">
        <div>{lines.length} itens · {units.toLocaleString('pt-BR')} unidades</div>
        <strong>Custo total: {money(totalCostCents)}</strong>
      </section>

      {error && <p className="mt-4">{error}</p>}
      <button
        className="mt-4 w-full rounded-xl border px-4 py-3 font-semibold disabled:opacity-50"
        disabled={!ready || saving}
        onClick={submit}
      >
        {saving ? 'Adicionando...' : 'Adicionar à prateleira'}
      </button>
    </main>
  )
}
