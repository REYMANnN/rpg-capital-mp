import { NextResponse, type NextRequest } from 'next/server'

import { safeNextPath } from '@/lib/accounts/routing'
import { managerStore } from '@/lib/sumup/access'
import { authorizeUrl, encodeState, sumupOAuthConfigured } from '@/lib/sumup/client'

export const dynamic = 'force-dynamic'

// Começa o "Conectar SumUp": confere o dono da loja e manda pro login da SumUp.
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const storeId = url.searchParams.get('loja') || ''
  const next = safeNextPath(url.searchParams.get('next')) || `/conectar-maquininha?loja=${storeId}`
  const back = (erro: string) => NextResponse.redirect(new URL(`/conectar-maquininha?loja=${encodeURIComponent(storeId)}&erro=${erro}`, url.origin))

  if (!sumupOAuthConfigured()) return back('sumup-indisponivel')
  const { user, store } = await managerStore(storeId)
  if (!user) return NextResponse.redirect(new URL(`/login?intent=login&next=${encodeURIComponent(`/conectar-maquininha?loja=${storeId}`)}`, url.origin))
  if (!store) return back('sem-acesso')

  return NextResponse.redirect(authorizeUrl(encodeState({ storeId: store.id, userId: user.id, next })))
}
