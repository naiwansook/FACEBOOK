// GET /api/inbox/settings?pageId=<id>   → ดึงทุก setting ของ user (รวม pages)
// PUT  /api/inbox/settings              → upsert
import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin, getUserIdFromFbToken } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.accessToken) return NextResponse.json({ settings: [] })

    const userId = await getUserIdFromFbToken(session.accessToken as string, (session as any).fbUserId)
    if (!userId) return NextResponse.json({ settings: [] })

    const { searchParams } = new URL(req.url)
    const pageId = searchParams.get('pageId')

    const sb = supabaseAdmin()
    let q = sb.from('inbox_settings').select('*').eq('user_id', userId)
    if (pageId) q = q.eq('page_id', pageId)
    const { data } = await q

    return NextResponse.json({ settings: data || [] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message, settings: [] }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.accessToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const userId = await getUserIdFromFbToken(session.accessToken as string, (session as any).fbUserId)
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { pageId, ...rest } = body
    if (!pageId) return NextResponse.json({ error: 'Missing pageId' }, { status: 400 })

    const allowed: any = { user_id: userId, page_id: pageId }
    for (const k of [
      'ai_assist_enabled', 'ai_auto_categorize', 'ai_tone',
      'auto_reply_enabled', 'auto_reply_message',
      'business_hours_enabled', 'business_hours', 'off_hours_message',
      'knowledge_base',
    ]) {
      if (k in rest) allowed[k] = rest[k]
    }

    const sb = supabaseAdmin()
    const { data, error } = await sb
      .from('inbox_settings')
      .upsert(allowed, { onConflict: 'user_id,page_id' })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ success: true, settings: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
