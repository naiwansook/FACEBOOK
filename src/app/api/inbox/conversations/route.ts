// GET /api/inbox/conversations
// Query: ?pageId=<connected_pages.id>&filter=unread|all|archived&q=<search>&limit=50
import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin, getUserIdFromFbToken } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.accessToken) {
      return NextResponse.json({ conversations: [], pages: [] })
    }

    const userId = await getUserIdFromFbToken(session.accessToken as string)
    if (!userId) return NextResponse.json({ conversations: [], pages: [] })

    const { searchParams } = new URL(req.url)
    const pageId = searchParams.get('pageId') || ''
    const filter = searchParams.get('filter') || 'all'
    const q = (searchParams.get('q') || '').trim()
    const limit = Math.min(Number(searchParams.get('limit') || 50), 200)

    const sb = supabaseAdmin()

    // ดึง pages ของ user (เพื่อ filter dropdown)
    const { data: pages } = await sb
      .from('connected_pages')
      .select('id, page_id, page_name, page_picture')
      .eq('user_id', userId)
      .eq('is_active', true)

    let query = sb
      .from('conversations')
      .select(`
        id, fb_psid, customer_name, customer_picture,
        last_message, last_message_at, last_sender, unread_count,
        ai_category, ai_sentiment, is_archived, is_resolved, is_starred, tags,
        page_id,
        connected_pages!inner(id, page_name, page_picture)
      `)
      .eq('user_id', userId)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(limit)

    if (pageId) query = query.eq('page_id', pageId)
    if (filter === 'unread') query = query.gt('unread_count', 0).eq('is_archived', false)
    else if (filter === 'archived') query = query.eq('is_archived', true)
    else if (filter === 'starred') query = query.eq('is_starred', true).eq('is_archived', false)
    else if (filter === 'unresolved') query = query.eq('is_resolved', false).eq('is_archived', false)
    else query = query.eq('is_archived', false)  // default = active

    if (q) {
      query = query.or(`customer_name.ilike.%${q}%,last_message.ilike.%${q}%`)
    }

    const { data: conversations, error } = await query
    if (error) throw error

    // นับ unread รวม (สำหรับ badge)
    const { count: totalUnread } = await sb
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gt('unread_count', 0)
      .eq('is_archived', false)

    return NextResponse.json({
      conversations: conversations || [],
      pages: pages || [],
      totalUnread: totalUnread || 0,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message, conversations: [], pages: [] }, { status: 500 })
  }
}
