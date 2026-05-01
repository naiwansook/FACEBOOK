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

/** ดึง user UUID จาก facebook access token (ใช้บ่อยใน API routes) */
export async function getUserIdFromFbToken(accessToken: string): Promise<string | null> {
  try {
    const r = await fetch(
      `https://graph.facebook.com/v19.0/me?fields=id&access_token=${accessToken}`
    )
    const d = await r.json()
    if (d.error || !d.id) return null

    const sb = supabaseAdmin()
    const { data: user } = await sb
      .from('users')
      .select('id')
      .eq('facebook_id', d.id)
      .single()

    return user?.id || null
  } catch {
    return null
  }
}
