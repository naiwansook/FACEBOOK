// GET /api/inbox/conversations/[id]   → conversation detail + messages
// PATCH                                  → update flags (mark read, archive, resolve, star, tags)
import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { getCurrentUserContext } from '@/lib/team'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.accessToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const ctx = await getCurrentUserContext(session.accessToken as string, (session as any).fbUserId)
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const sb = supabaseAdmin()

    const { data: conversation } = await sb
      .from('conversations')
      .select(`
        *,
        connected_pages!inner(id, page_id, page_name, page_picture)
      `)
      .eq('id', params.id)
      .single()

    if (!conversation) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (!ctx.accessiblePageIds.has(conversation.page_id)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const { data: messages } = await sb
      .from('inbox_messages')
      .select('*')
      .eq('conversation_id', params.id)
      .order('created_at', { ascending: true })
      .limit(200)

    // Mark conversation as read (reset unread count)
    if (conversation.unread_count > 0) {
      await sb
        .from('conversations')
        .update({ unread_count: 0 })
        .eq('id', params.id)
    }

    return NextResponse.json({ conversation, messages: messages || [] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.accessToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const ctx = await getCurrentUserContext(session.accessToken as string, (session as any).fbUserId)
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const sb = supabaseAdmin()

    // ensure access
    const { data: conv } = await sb
      .from('conversations')
      .select('id, page_id')
      .eq('id', params.id)
      .single()
    if (!conv) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (!ctx.accessiblePageIds.has(conv.page_id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const allowed: Record<string, any> = {}
    for (const k of ['is_archived', 'is_resolved', 'is_starred', 'unread_count', 'tags', 'ai_category', 'ai_sentiment', 'ai_summary']) {
      if (k in body) allowed[k] = body[k]
    }

    const { error } = await sb
      .from('conversations')
      .update(allowed)
      .eq('id', params.id)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
