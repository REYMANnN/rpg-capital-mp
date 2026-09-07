import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function proxy(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()

  if (!supabaseUrl || !supabaseAnonKey) {
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
    },
  )

  // Refresh/validate Supabase auth only on current account and operational routes.
  // Authorization decisions themselves remain inside server pages and route handlers.
  await supabase.auth.getUser()
  return supabaseResponse
}

export const config = {
  matcher: [
    '/login/:path*',
    '/auth/:path*',
    '/onboarding/:path*',
    '/manage/:path*',
    '/work/:path*',
    '/inventory-v1/:path*',
    '/activate/:path*',
    '/api/balcao/:path*',
    '/api/inventory/:path*',
    '/api/products/:path*',
  ],
}
