import { NextResponse, type NextRequest } from 'next/server'

import { getCurrentUser } from '@/lib/accounts/currentUser'
import { setSumUpOnboarding } from '@/lib/sumup/access'
import { decodeState, exchangeCode, fetchMerchantCode, fetchMerchantCountry, saveOAuth } from '@/lib/sumup/client'

export const dynamic = 'force-dynamic'

// Volta do login da SumUp: troca o código pelo token e salva a conta na loja.
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const state = decodeState(url.searchParams.get('state') || '')
  const fail = (erro: string, storeId?: string) => NextResponse.redirect(new URL(`/conectar-maquininha?${storeId ? `loja=${encodeURIComponent(storeId)}&` : ''}erro=${erro}`, url.origin))
  if (!state) return fail('link-expirado')
  if (url.searchParams.get('error')) return fail('autorizacao-negada', state.storeId)

  const user = await getCurrentUser()
  if (!user || user.id !== state.userId) return fail('outra-conta', state.storeId)

  const code = url.searchParams.get('code')
  if (!code) return fail('sem-codigo', state.storeId)

  try {
    const tokens = await exchangeCode(code)
    const [merchantCode, country] = await Promise.all([fetchMerchantCode(tokens.access_token), fetchMerchantCountry(tokens.access_token)])
    await saveOAuth({ storeId: state.storeId, userId: user.id, tokens, merchantCode, country })
    await setSumUpOnboarding(state.storeId, 'connected')
  } catch (error) {
    console.error('sumup oauth callback failed', error instanceof Error ? error.message : error)
    return fail('falha-sumup', state.storeId)
  }

  const next = new URL(state.next, url.origin)
  next.searchParams.set('sumup', 'conectada')
  return NextResponse.redirect(next)
}
