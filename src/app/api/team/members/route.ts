// GET /api/team/members — รายการ members ทั้งหมดของเพจที่ owner เป็นเจ้าของ
// DELETE /api/team/members?userId=<id>&pageId=<id?> — revoke membership
//   ถ้าไม่ส่ง pageId = ลบทุกเพจของ owner ที่ user นี้เป็น member
import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { getCurrentUserContext, assertOwner } from '@/lib/team'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.accessToken) return NextResponse.json({ members: [] })

    const ctx = await getCurrentUserContext(session.accessToken as string, (session as any).fbUserId)
    if (!ctx) return NextResponse.json({ members: [] })

    const g = assertOwner(ctx)
    if (!g.ok) return NextResponse.json({ members: [] })

    const ownedIds = Array.from(ctx.ownedPageIds)
    if (ownedIds.length === 0) return NextResponse.json({ members: [] })

    const sb = supabaseAdmin()

    // ดึง members ทั้งหมดในเพจที่ owner เป็นเจ้าของ (ยกเว้น owner เอง)
    const { data: rows } = await sb
      .from('page_members')
      .select(`
        id, role, joined_at,
        user_id,
        page_id,
        users:user_id (id, name, image, email, facebook_id),
        connected_pages!inner (id, page_name, page_picture)
      `)
      .in('page_id', ownedIds)
      .neq('user_id', ctx.userId)
      .order('joined_at', { ascending: false })

    // group by user_id → 1 row per user with list of pages
    const byUser = new Map<string, any>()
    for (const r of (rows || []) as any[]) {
      const uid = r.user_id
      if (!byUser.has(uid)) {
        byUser.set(uid, {
          userId: uid,
          name: r.users?.name || 'ผู้ใช้',
          image: r.users?.image || null,
          email: r.users?.email || null,
          facebookId: r.users?.facebook_id || null,
          role: r.role,
          joinedAt: r.joined_at,
          pages: [],
        })
      }
      byUser.get(uid).pages.push({
        pageId: r.page_id,
        pageName: r.connected_pages?.page_name || '',
        pagePicture: r.connected_pages?.page_picture || null,
      })
    }

    return NextResponse.json({ members: Array.from(byUser.values()) })
  } catch (err: any) {
    return NextResponse.json({ error: err.message, members: [] }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.accessToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const ctx = await getCurrentUserContext(session.accessToken as string, (session as any).fbUserId)
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const g = assertOwner(ctx)
    if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status })

    const { searchParams } = new URL(req.url)
    const memberUserId = searchParams.get('userId')
    const pageId = searchParams.get('pageId')

    if (!memberUserId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
    if (memberUserId === ctx.userId) {
      return NextResponse.json({ error: 'ลบตัวเองไม่ได้' }, { status: 400 })
    }

    const sb = supabaseAdmin()
    const ownedIds = Array.from(ctx.ownedPageIds)

    let q = sb
      .from('page_members')
      .delete()
      .eq('user_id', memberUserId)
      .in('page_id', ownedIds)
      .neq('role', 'owner')  // ห้ามลบ owner row

    if (pageId) q = q.eq('page_id', pageId)

    const { error } = await q
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
