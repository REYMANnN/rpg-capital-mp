import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// Páginas públicas que, no endereço *.vercel.app de produção, devem ir para o domínio oficial
// (assim o Google para de indexar as cópias da Vercel). Webhooks, API, login e app não são redirecionados.
const PUBLIC_MARKETING_PATHS = ['/', '/integracoes', '/credito', '/cultura', '/edu', '/privacidade', '/termos']
const CANONICAL_ORIGIN = 'https://www.rpgcapital.com.br'

function vercelHostResponse(request: NextRequest) {
  const host = request.headers.get('host') || ''
  if (process.env.VERCEL_ENV !== 'production' || !host.endsWith('.vercel.app')) return null

  const { pathname, search } = request.nextUrl
  const isMarketing = PUBLIC_MARKETING_PATHS.includes(pathname) || pathname.startsWith('/edu/')
  if (isMarketing && (request.method === 'GET' || request.method === 'HEAD')) {
    return NextResponse.redirect(new URL(pathname + search, CANONICAL_ORIGIN), 308)
  }
  return 'noindex' as const
}

export async function proxy(request: NextRequest) {
  const vercelHost = vercelHostResponse(request)
  if (vercelHost && vercelHost !== 'noindex') return vercelHost
  const response = await handleSession(request)
  if (vercelHost === 'noindex') response.headers.set('X-Robots-Tag', 'noindex, nofollow')
  return response
}

async function handleSession(request: NextRequest) {
  const protectedPaths = ['/u', '/app']
  const isProtected = protectedPaths.some(p => request.nextUrl.pathname.startsWith(p))
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()

  // The inventory preview is intentionally local-first and does not require Supabase.
  // If the legacy app has no Supabase environment yet, keep public routes usable.
  if (!supabaseUrl || !supabaseAnonKey) {
    if (isProtected) return NextResponse.redirect(new URL('/cadastro', request.url))
    return NextResponse.next({ request })
  }

  let supabaseResponse = NextResponse.next({ request })
  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (isProtected && !user) {
    return NextResponse.redirect(new URL('/cadastro', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public|site/|brand/).*)'],
}
