import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const stateStr = searchParams.get('state')
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  if (!code) {
    return NextResponse.redirect(new URL('/cadastro?error=no_code', appUrl))
  }

  try {
    const state = stateStr ? JSON.parse(decodeURIComponent(stateStr)) : {}
    const accountType = state.type || 'pf'
    const userId = state.userId

    // Exchange code for tokens
    const tokenRes = await fetch('https://api.mercadopago.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: process.env.MP_CLIENT_ID,
        client_secret: process.env.MP_CLIENT_SECRET,
        code,
        redirect_uri: process.env.MP_REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    })

    if (!tokenRes.ok) {
      const err = await tokenRes.text()
      console.error('MP token exchange error:', err)
      return NextResponse.redirect(new URL('/cadastro?error=mp_auth_failed', appUrl))
    }

    const tokenData = await tokenRes.json()
    const { access_token, refresh_token, user_id: mpUserId, public_key } = tokenData

    // Save tokens to database
    const admin = createAdminClient()

    if (userId) {
      const expiresAt = new Date(Date.now() + (tokenData.expires_in || 21600) * 1000).toISOString()

      await admin
        .from('users')
        .update({
          mp_user_id: String(mpUserId),
          mp_access_token: access_token,
          mp_refresh_token: refresh_token,
          mp_public_key: public_key,
          mp_token_expires_at: expiresAt,
        })
        .eq('id', userId)
    }

    const redirectPath = accountType === 'pj' ? '/app' : '/u'
    const response = NextResponse.redirect(new URL(redirectPath, appUrl))
    return response
  } catch (err) {
    console.error('Callback error:', err)
    return NextResponse.redirect(new URL('/cadastro?error=callback_failed', appUrl))
  }
}
