// Centralized Supabase client (server-side, service role)
import { createClient, SupabaseClient } from '@supabase/supabase-js'

let _admin: SupabaseClient | null = null

/** Service-role client — bypasses RLS. Server-only. */
export function supabaseAdmin(): SupabaseClient {
  if (_admin) return _admin
  _admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
  return _admin
}

/** ดึง FB user_id จาก access token — มี fallback ผ่าน debug_token
 * (กัน rate limit บน /me ที่เกิดบ่อยช่วง dev) */
export async function getFbUserIdFromToken(accessToken: string): Promise<string | null> {
  // ลอง /me ก่อน
  try {
    const r = await fetch(
      `https://graph.facebook.com/v19.0/me?fields=id&access_token=${accessToken}`
    )
    const d = await r.json()
    if (!d.error && d.id) return d.id
  } catch {}
  // Fallback: debug_token ผ่าน APP_TOKEN (แยก rate limit จาก user)
  try {
    if (!process.env.FACEBOOK_CLIENT_ID || !process.env.FACEBOOK_CLIENT_SECRET) return null
    const appToken = `${process.env.FACEBOOK_CLIENT_ID}|${process.env.FACEBOOK_CLIENT_SECRET}`
    const r = await fetch(
      `https://graph.facebook.com/v19.0/debug_token?input_token=${accessToken}&access_token=${appToken}`
    )
    const d = await r.json()
    return d?.data?.user_id || null
  } catch {
    return null
  }
}

/** ดึง user UUID จาก facebook access token (ใช้บ่อยใน API routes) */
export async function getUserIdFromFbToken(accessToken: string): Promise<string | null> {
  const fbId = await getFbUserIdFromToken(accessToken)
  if (!fbId) return null
  const sb = supabaseAdmin()
  const { data: user } = await sb
    .from('users')
    .select('id')
    .eq('facebook_id', fbId)
    .single()
  return user?.id || null
}
