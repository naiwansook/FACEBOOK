// POST /api/team/invite
// Body: { pageIds: string[], note?: string }   role hardcoded เป็น 'agent' (MVP)
// Owner เท่านั้น — สร้าง invite token (7 วัน) สำหรับเชิญ agent เข้าทีม
import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { getCurrentUserContext, assertPageAccess } from '@/lib/team'

export const dynamic = 'force-dynamic'

const INVITE_DAYS = 7

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.accessToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const ctx = await getCurrentUserContext(session.accessToken as string, (session as any).fbUserId)
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const pageIds: string[] = Array.isArray(body.pageIds) ? body.pageIds : []
    const note: string | undefined = typeof body.note === 'string' ? body.note.slice(0, 200) : undefined

    if (pageIds.length === 0) {
      return NextResponse.json({ error: 'ต้องเลือกอย่างน้อย 1 เพจ' }, { status: 400 })
    }

    // ทุก pageId ต้องเป็นเพจที่ผู้ใช้เป็น owner
    for (const pid of pageIds) {
      const g = assertPageAccess(ctx, pid, 'owner')
      if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status })
    }

    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000)

    const sb = supabaseAdmin()
    const { data, error } = await sb
      .from('team_invitations')
      .insert({
        owner_user_id: ctx.userId,
        token,
        role: 'agent',
        page_ids: pageIds,
        note: note || null,
        expires_at: expiresAt.toISOString(),
      })
      .select('id, token, expires_at, page_ids, role, note, created_at')
      .single()

    if (error) throw error

    return NextResponse.json({
      success: true,
      invitation: data,
      url: `/invite/${token}`,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
