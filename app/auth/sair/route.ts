import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { safeNextPath } from '@/lib/accounts/routing'

// Sai da conta Google e volta para uma página do próprio site (ex.: trocar de conta em /conectar-banco).
export async function GET(request: Request) {
  const supabase = await createServerClient()
  await supabase.auth.signOut()
  const url = new URL(request.url)
  return NextResponse.redirect(new URL(safeNextPath(url.searchParams.get('next')) || '/login', url.origin))
}
