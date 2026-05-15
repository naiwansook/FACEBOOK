// GET /api/team/invitations/[token] — public preview (ไม่ต้อง login)
// คืนข้อมูล non-sensitive สำหรับหน้า /invite/[token] ก่อน accept
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: { token: string } }) {
  try {
    const token = params.token
    if (!token || token.length < 32) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 400 })
    }

    const sb = supabaseAdmin()
    const { data: inv } = await sb
      .from('team_invitations')
      .select('id, role, page_ids, note, expires_at, accepted_at, revoked_at, owner_user_id')
      .eq('token', token)
      .single()

    if (!inv) return NextResponse.json({ error: 'ไม่พบคำเชิญ' }, { status: 404 })

    // ตรวจ status
    if (inv.revoked_at) {
      return NextResponse.json({ error: 'คำเชิญถูกยกเลิกแล้ว', status: 'revoked' }, { status: 410 })
    }
    if (inv.accepted_at) {
      return NextResponse.json({ error: 'คำเชิญถูกใช้ไปแล้ว', status: 'accepted' }, { status: 410 })
    }
    if (new Date(inv.expires_at) < new Date()) {
      return NextResponse.json({ error: 'คำเชิญหมดอายุแล้ว', status: 'expired' }, { status: 410 })
    }

    // ดึง owner name + pages preview
    const [{ data: owner }, { data: pages }] = await Promise.all([
      sb.from('users').select('name, image').eq('id', inv.owner_user_id).single(),
      sb.from('connected_pages').select('page_name, page_picture').in('id', inv.page_ids || []),
    ])

    return NextResponse.json({
      status: 'pending',
      role: inv.role,
      ownerName: owner?.name || 'เจ้าของเพจ',
      ownerImage: owner?.image || null,
      note: inv.note,
      pages: pages || [],
      expiresAt: inv.expires_at,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
