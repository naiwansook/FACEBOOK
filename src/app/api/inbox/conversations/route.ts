// GET /api/inbox/conversations
// Query: ?pageId=<connected_pages.id>&filter=unread|all|archived&q=<search>&limit=50
import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { getCurrentUserContext } from '@/lib/team'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.accessToken) {
      return NextResponse.json({ conversations: [], pages: [] })
    }

    const ctx = await getCurrentUserContext(session.accessToken as string, (session as any).fbUserId)
    if (!ctx) return NextResponse.json({ conversations: [], pages: [] })

    const accessible = Array.from(ctx.accessiblePageIds)
    if (accessible.length === 0) {
      return NextResponse.json({ conversations: [], pages: [], totalUnread: 0, totalNeedsReply: 0, unreadByPage: {} })
    }

    const { searchParams } = new URL(req.url)
    const pageId = searchParams.get('pageId') || ''
    const filter = searchParams.get('filter') || 'all'
    const q = (searchParams.get('q') || '').trim()
    const limit = Math.min(Number(searchParams.get('limit') || 50), 200)

    // ถ้า client filter ด้วย pageId ต้องเป็นเพจที่เข้าถึงได้
    if (pageId && !ctx.accessiblePageIds.has(pageId)) {
      return NextResponse.json({ conversations: [], pages: [], totalUnread: 0, totalNeedsReply: 0, unreadByPage: {} })
    }

    const sb = supabaseAdmin()

    // ดึง pages ที่ user เข้าถึงได้ (สำหรับ filter dropdown)
    const { data: pages } = await sb
      .from('connected_pages')
      .select('id, page_id, page_name, page_picture')
      .in('id', accessible)
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
      .in('page_id', accessible)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(limit)

    if (pageId) query = query.eq('page_id', pageId)
    if (filter === 'unread') query = query.gt('unread_count', 0).eq('is_archived', false)
    else if (filter === 'archived') query = query.eq('is_archived', true)
    else if (filter === 'starred') query = query.eq('is_starred', true).eq('is_archived', false)
    else if (filter === 'unresolved') query = query.eq('is_resolved', false).eq('is_archived', false)
    else if (filter === 'needs_reply') query = query.eq('last_sender', 'customer').eq('is_archived', false)
    else query = query.eq('is_archived', false)  // default = active

    if (q) {
      query = query.or(`customer_name.ilike.%${q}%,last_message.ilike.%${q}%`)
    }

    const { data: conversations, error } = await query
    if (error) {
      console.error('[inbox/conversations] query error:', error)
      throw error
    }
    console.log(`[inbox/conversations] pageId=${pageId || 'all'} filter=${filter} → ${conversations?.length || 0} convs`)

    // นับ unread รวม (สำหรับ badge)
    const { count: totalUnread } = await sb
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .in('page_id', accessible)
      .gt('unread_count', 0)
      .eq('is_archived', false)

    // นับ needs_reply
    const { count: totalNeedsReply } = await sb
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .in('page_id', accessible)
      .eq('last_sender', 'customer')
      .eq('is_archived', false)

    // นับ unread ต่อเพจ
    const { data: unreadRows } = await sb
      .from('conversations')
      .select('page_id, unread_count')
      .in('page_id', accessible)
      .gt('unread_count', 0)
      .eq('is_archived', false)
    const unreadByPage: Record<string, number> = {}
    for (const r of (unreadRows || []) as Array<{ page_id: string; unread_count: number }>) {
      unreadByPage[r.page_id] = (unreadByPage[r.page_id] || 0) + (r.unread_count || 0)
    }

    return NextResponse.json({
      conversations: conversations || [],
      pages: pages || [],
      totalUnread: totalUnread || 0,
      totalNeedsReply: totalNeedsReply || 0,
      unreadByPage,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message, conversations: [], pages: [] }, { status: 500 })
  }
}
