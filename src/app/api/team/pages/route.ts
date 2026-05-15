// GET /api/team/pages — เฉพาะเพจที่ user เป็น owner (สำหรับ invite modal)
import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { getCurrentUserContext, assertOwner } from '@/lib/team'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.accessToken) return NextResponse.json({ pages: [] })

    const ctx = await getCurrentUserContext(session.accessToken as string, (session as any).fbUserId)
    if (!ctx) return NextResponse.json({ pages: [] })

    const g = assertOwner(ctx)
    if (!g.ok) return NextResponse.json({ pages: [] })

    const ownedIds = Array.from(ctx.ownedPageIds)
    if (ownedIds.length === 0) return NextResponse.json({ pages: [] })

    const sb = supabaseAdmin()
    const { data: pages } = await sb
      .from('connected_pages')
      .select('id, page_id, page_name, page_picture')
      .in('id', ownedIds)
      .eq('is_active', true)
      .order('page_name')

    return NextResponse.json({ pages: pages || [] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message, pages: [] }, { status: 500 })
  }
}
