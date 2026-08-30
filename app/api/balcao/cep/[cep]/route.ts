import { NextResponse } from 'next/server'
import { mapViaCepResponse, normalizeCep } from '@/lib/accounts/cep'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ cep: string }> }) {
  const { cep: rawCep } = await params
  const cep = normalizeCep(rawCep)

  if (!/^\d{8}$/.test(cep)) {
    return NextResponse.json({ error: 'Informe um CEP com 8 números.' }, { status: 400 })
  }

  try {
    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(4500),
      headers: { accept: 'application/json' },
    })

    if (!response.ok) {
      return NextResponse.json({ error: 'Não conseguimos consultar este CEP agora. Você pode preencher o endereço manualmente.' }, { status: 503 })
    }

    const address = mapViaCepResponse(await response.json().catch(() => null))
    if (!address) return NextResponse.json({ error: 'CEP não encontrado. Confira os números ou preencha o endereço manualmente.' }, { status: 404 })

    return NextResponse.json({ ok: true, cep, ...address })
  } catch {
    return NextResponse.json({ error: 'Não conseguimos consultar o CEP agora. Você pode preencher o endereço manualmente.' }, { status: 503 })
  }
}
