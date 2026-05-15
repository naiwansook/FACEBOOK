// GET /api/team/invitations — รายการ invitation ทั้งหมดของ owner
// DELETE /api/team/invitations?id=<invitationId> — revoke invitation
import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { getCurrentUserContext, assertOwner } from '@/lib/team'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.accessToken) return NextResponse.json({ invitations: [] })

    const ctx = await getCurrentUserContext(session.accessToken as string, (session as any).fbUserId)
    if (!ctx) return NextResponse.json({ invitations: [] })

    const g = assertOwner(ctx)
    if (!g.ok) return NextResponse.json({ invitations: [] })

    const sb = supabaseAdmin()
    const { data: invitations } = await sb
      .from('team_invitations')
      .select('id, token, role, page_ids, note, expires_at, accepted_by, accepted_at, revoked_at, created_at')
      .eq('owner_user_id', ctx.userId)
      .order('created_at', { ascending: false })
      .limit(100)

    // join page names
    const allPageIds = Array.from(new Set((invitations || []).flatMap(i => i.page_ids || [])))
    const { data: pages } = allPageIds.length > 0
      ? await sb.from('connected_pages').select('id, page_name, page_picture').in('id', allPageIds)
      : { data: [] }
    const pageMap = new Map((pages || []).map(p => [p.id, p]))

    // join accepted_by user
    const acceptedIds = Array.from(new Set((invitations || []).map(i => i.accepted_by).filter(Boolean)))
    const { data: acceptedUsers } = acceptedIds.length > 0
      ? await sb.from('users').select('id, name, image').in('id', acceptedIds)
      : { data: [] }
    const userMap = new Map((acceptedUsers || []).map(u => [u.id, u]))

    const enriched = (invitations || []).map(inv => ({
      ...inv,
      pages: (inv.page_ids || []).map((pid: string) => pageMap.get(pid)).filter(Boolean),
      acceptedUser: inv.accepted_by ? userMap.get(inv.accepted_by) || null : null,
      status: inv.revoked_at
        ? 'revoked'
        : inv.accepted_at
          ? 'accepted'
          : new Date(inv.expires_at) < new Date()
            ? 'expired'
            : 'pending',
    }))

    return NextResponse.json({ invitations: enriched })
  } catch (err: any) {
    return NextResponse.json({ error: err.message, invitations: [] }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.accessToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const ctx = await getCurrentUserContext(session.accessToken as string, (session as any).fbUserId)
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const sb = supabaseAdmin()
    // revoke = soft delete (keep audit trail)
    const { error } = await sb
      .from('team_invitations')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', id)
      .eq('owner_user_id', ctx.userId)
      .is('accepted_at', null) // ถ้า accept แล้วห้าม revoke (ต้องใช้ /members ลบแทน)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
