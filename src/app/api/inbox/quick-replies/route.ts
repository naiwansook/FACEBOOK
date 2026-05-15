// CRUD quick replies
// GET — page member ทุก role อ่านได้ (agent ใช้ quick replies ของ owner)
// POST/DELETE — owner-only
import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { getCurrentUserContext, assertOwner, getOwnerUserIdOfPage, assertPageAccess } from '@/lib/team'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.accessToken) return NextResponse.json({ replies: [] })

    const ctx = await getCurrentUserContext(session.accessToken as string, (session as any).fbUserId)
    if (!ctx) return NextResponse.json({ replies: [] })

    if (ctx.memberships.length === 0) return NextResponse.json({ replies: [] })

    const sb = supabaseAdmin()

    const ownerIds = Array.from(new Set(ctx.memberships.map(m => m.ownerUserId).filter(Boolean)))
    const accessiblePages = Array.from(ctx.accessiblePageIds)

    // 2 queries แล้ว merge — ดู readable + ปลอดภัยกับ empty arrays
    const pageScoped = accessiblePages.length > 0
      ? (await sb.from('quick_replies').select('*').in('page_id', accessiblePages)).data || []
      : []
    const globalForOwners = ownerIds.length > 0
      ? (await sb.from('quick_replies').select('*').is('page_id', null).in('user_id', ownerIds)).data || []
      : []

    const seen = new Set<string>()
    const merged = [...pageScoped, ...globalForOwners]
      .filter(r => { if (seen.has(r.id)) return false; seen.add(r.id); return true })
      .sort((a, b) => (b.use_count || 0) - (a.use_count || 0))

    return NextResponse.json({ replies: merged })
  } catch (err: any) {
    return NextResponse.json({ error: err.message, replies: [] }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.accessToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const ctx = await getCurrentUserContext(session.accessToken as string, (session as any).fbUserId)
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const og = assertOwner(ctx)
    if (!og.ok) return NextResponse.json({ error: og.error }, { status: og.status })

    const { shortcut, title, message, pageId } = await req.json()
    if (!shortcut || !title || !message) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    // ถ้าผูกกับเพจ → ต้องเป็นเพจที่ user เป็น owner
    let user_id = ctx.userId
    if (pageId) {
      const pg = assertPageAccess(ctx, pageId, 'owner')
      if (!pg.ok) return NextResponse.json({ error: pg.error }, { status: pg.status })
      user_id = getOwnerUserIdOfPage(ctx, pageId) || ctx.userId
    }

    const sb = supabaseAdmin()
    const { data, error } = await sb
      .from('quick_replies')
      .insert({ user_id, page_id: pageId || null, shortcut, title, message })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ success: true, reply: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.accessToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const ctx = await getCurrentUserContext(session.accessToken as string, (session as any).fbUserId)
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const og = assertOwner(ctx)
    if (!og.ok) return NextResponse.json({ error: og.error }, { status: og.status })

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const sb = supabaseAdmin()
    await sb.from('quick_replies').delete().eq('id', id).eq('user_id', ctx.userId)
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
