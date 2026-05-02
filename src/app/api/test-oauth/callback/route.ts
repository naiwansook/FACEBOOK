// GET /api/test-oauth/callback
// Manual FB OAuth callback — รายงานทุก step ที่เกิดขึ้นเป็น JSON
// ใช้แทน NextAuth callback เพื่อแยกปัญหา
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const steps: any[] = []
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')
  const errorReason = url.searchParams.get('error_reason')
  const errorDescription = url.searchParams.get('error_description')

  steps.push({
    step: '1_received_callback',
    code: code ? `${code.slice(0, 10)}...` : null,
    state: state ? `${state.slice(0, 6)}...` : null,
    fb_error: error,
    fb_error_reason: errorReason,
    fb_error_description: errorDescription,
  })

  if (error) {
    return NextResponse.json({
      ok: false,
      problem: 'FB returned error in callback URL',
      steps,
    })
  }

  if (!code) {
    return NextResponse.json({
      ok: false,
      problem: 'No code in callback URL',
      steps,
    })
  }

  // Verify state cookie
  const cookieHeader = req.headers.get('cookie') || ''
  const cookies = Object.fromEntries(
    cookieHeader.split(';').map(c => {
      const [k, ...v] = c.trim().split('=')
      return [k, v.join('=')]
    })
  )
  const expectedState = cookies['test_oauth_state']
  const expectedRedirect = cookies['test_oauth_redirect']

  steps.push({
    step: '2_verify_state',
    cookieState: expectedState ? `${expectedState.slice(0, 6)}...` : null,
    queryState: state ? `${state.slice(0, 6)}...` : null,
    match: state === expectedState,
  })

  if (state !== expectedState) {
    return NextResponse.json({
      ok: false,
      problem: 'State mismatch — cookie missing or different (browser cookie issue?)',
      steps,
    })
  }

  // Exchange code for token
  const origin = `https://${req.headers.get('host')}`
  const redirectUri = expectedRedirect || `${origin}/api/test-oauth/callback`

  steps.push({ step: '3_exchange_code', redirectUri })

  let tokenData: any = null
  try {
    const tokenUrl = new URL('https://graph.facebook.com/v19.0/oauth/access_token')
    tokenUrl.searchParams.set('client_id', process.env.FACEBOOK_CLIENT_ID || '')
    tokenUrl.searchParams.set('client_secret', process.env.FACEBOOK_CLIENT_SECRET || '')
    tokenUrl.searchParams.set('redirect_uri', redirectUri)
    tokenUrl.searchParams.set('code', code)

    const r = await fetch(tokenUrl.toString())
    tokenData = await r.json()
    steps.push({
      step: '3_token_response',
      status: r.status,
      hasAccessToken: !!tokenData?.access_token,
      tokenType: tokenData?.token_type,
      expiresIn: tokenData?.expires_in,
      error: tokenData?.error,
    })
  } catch (e: any) {
    steps.push({ step: '3_exception', error: e.message })
    return NextResponse.json({ ok: false, problem: 'Token exchange threw', steps })
  }

  if (!tokenData?.access_token) {
    return NextResponse.json({
      ok: false,
      problem: 'Token exchange failed',
      steps,
      tokenData,
    })
  }

  // Fetch user profile
  let profile: any = null
  try {
    // ใช้ /me?fields=id,name (ไม่เอา email เพราะอาจไม่มี email scope)
    const r = await fetch(
      `https://graph.facebook.com/v19.0/me?fields=id,name&access_token=${tokenData.access_token}`
    )
    profile = await r.json()
    steps.push({
      step: '4_profile_response',
      status: r.status,
      id: profile?.id,
      name: profile?.name,
      hasEmail: !!profile?.email,
      error: profile?.error,
    })
  } catch (e: any) {
    steps.push({ step: '4_exception', error: e.message })
  }

  return NextResponse.json({
    ok: true,
    message: '✅ Manual OAuth flow ทำงานได้สมบูรณ์! → ปัญหาอยู่ที่ NextAuth config ไม่ใช่ FB',
    steps,
    profile,
  })
}
