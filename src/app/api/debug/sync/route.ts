// GET /api/debug/sync — รายงานว่า sync เพจไหนเจอ error อะไร
// ใช้ตรวจว่าทำไมแชทไม่โผล่
import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin, getUserIdFromFbToken } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const FB_API = 'https://graph.facebook.com/v19.0'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'no session' }, { status: 401 })
  }
  const userId = await getUserIdFromFbToken(session.accessToken as string, (session as any).fbUserId)
  if (!userId) return NextResponse.json({ error: 'no user' }, { status: 401 })

  const sb = supabaseAdmin()
  const { data: pages } = await sb
    .from('connected_pages')
    .select('id, page_id, page_name, page_access_token, is_active')
    .eq('user_id', userId)

  const report: any[] = []
  for (const p of pages || []) {
    const r: any = {
      uuid: p.id,
      fb_page_id: p.page_id,
      page_name: p.page_name,
      is_active: p.is_active,
      hasPageToken: !!p.page_access_token,
      pageTokenLen: p.page_access_token?.length || 0,
    }

    if (!p.page_access_token) {
      r.problem = '❌ ไม่มี page_access_token — ต้องไปเชื่อมต่อเพจใหม่'
      report.push(r)
      continue
    }

    // 1) ตรวจว่า page_access_token ใช้ได้มั้ย
    try {
      const meRes = await fetch(`${FB_API}/me?fields=id,name&access_token=${p.page_access_token}`)
      const meData = await meRes.json()
      r.tokenCheck = meData.error
        ? { ok: false, error: meData.error.message, code: meData.error.code }
        : { ok: true, page_id: meData.id, name: meData.name }
    } catch (e: any) {
      r.tokenCheck = { ok: false, exception: e.message }
    }

    // 2) ลองดึง conversations
    try {
      const cRes = await fetch(
        `${FB_API}/${p.page_id}/conversations?fields=id,updated_time,unread_count,snippet,participants&limit=5&access_token=${p.page_access_token}`
      )
      const cData = await cRes.json()
      if (cData.error) {
        r.convsCheck = { ok: false, error: cData.error.message, code: cData.error.code }
      } else {
        const convs = cData.data || []
        r.convsCheck = {
          ok: true,
          count: convs.length,
          sample: convs.slice(0, 2).map((c: any) => ({
            id: c.id,
            snippet: (c.snippet || '').slice(0, 30),
            participants: (c.participants?.data || []).map((p: any) => ({
              id: p.id,
              name: p.name,
              isPage: p.id === r.fb_page_id,
            })),
          })),
        }
      }
    } catch (e: any) {
      r.convsCheck = { ok: false, exception: e.message }
    }

    // 3) นับ conversations ใน DB
    const { count: dbCount } = await sb
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('page_id', p.id)
    r.dbConvsCount = dbCount

    report.push(r)
  }

  return NextResponse.json({ pageCount: pages?.length || 0, pages: report })
}
