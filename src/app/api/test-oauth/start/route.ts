// GET /api/test-oauth/start
// Manual FB OAuth flow (no NextAuth) — แยกปัญหาว่า NextAuth พังหรือ FB พัง
// Redirects ไป FB OAuth dialog แล้วกลับมาที่ /api/test-oauth/callback
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const url = new URL(req.url)
  // ใช้ host จาก request จริงๆ (ไม่พึ่ง NEXTAUTH_URL ที่อาจมี whitespace)
  const origin = `https://${req.headers.get('host')}`
  const redirectUri = `${origin}/api/test-oauth/callback`

  const state = Math.random().toString(36).slice(2)

  const fbUrl = new URL('https://www.facebook.com/v19.0/dialog/oauth')
  fbUrl.searchParams.set('client_id', process.env.FACEBOOK_CLIENT_ID || '')
  fbUrl.searchParams.set('redirect_uri', redirectUri)
  fbUrl.searchParams.set('state', state)
  // ใช้ scope ที่ตรงกับ Use Cases ที่ FB App มีอยู่
  // (Marketing API + Pages + Messenger) — ไม่รวม public_profile
  // เพราะ App ไม่ได้เพิ่ม "Authentication" use case
  fbUrl.searchParams.set(
    'scope',
    'business_management,ads_management,ads_read,pages_show_list,pages_read_engagement,pages_read_user_content,pages_manage_metadata,pages_manage_posts,pages_messaging'
  )

  const res = NextResponse.redirect(fbUrl.toString())
  // เก็บ state ใน cookie เพื่อตรวจตอน callback
  res.cookies.set('test_oauth_state', state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })
  res.cookies.set('test_oauth_redirect', redirectUri, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })
  return res
}
