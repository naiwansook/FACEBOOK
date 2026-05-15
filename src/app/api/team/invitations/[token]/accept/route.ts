// POST /api/team/invitations/[token]/accept
// Invitee ที่ login FB แล้วกด accept → ระบบสร้าง page_members rows + mark invitation accepted
import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin, getFbUserIdFromToken } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function POST(_req: Request, { params }: { params: { token: string } }) {
  try {
    const token = params.token
    if (!token || token.length < 32) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.accessToken) {
      return NextResponse.json({ error: 'ต้อง login Facebook ก่อน' }, { status: 401 })
    }

    const fbHint = (session as any).fbUserId as string | undefined
    const fbId = fbHint || await getFbUserIdFromToken(session.accessToken as string)
    if (!fbId) {
      return NextResponse.json({ error: 'ไม่สามารถดึง Facebook ID ได้' }, { status: 401 })
    }

    const sb = supabaseAdmin()

    // 1) Lookup invitation + validate
    const { data: inv } = await sb
      .from('team_invitations')
      .select('*')
      .eq('token', token)
      .single()
    if (!inv) return NextResponse.json({ error: 'ไม่พบคำเชิญ' }, { status: 404 })
    if (inv.revoked_at) return NextResponse.json({ error: 'คำเชิญถูกยกเลิกแล้ว' }, { status: 410 })
    if (inv.accepted_at) return NextResponse.json({ error: 'คำเชิญถูกใช้ไปแล้ว' }, { status: 410 })
    if (new Date(inv.expires_at) < new Date()) {
      return NextResponse.json({ error: 'คำเชิญหมดอายุแล้ว' }, { status: 410 })
    }

    // 2) Upsert invitee user row
    const sessionUser = session.user as any
    const { data: existingUser } = await sb
      .from('users')
      .select('id')
      .eq('facebook_id', fbId)
      .single()

    let inviteeUserId: string
    if (existingUser?.id) {
      inviteeUserId = existingUser.id
      // refresh profile + token
      await sb
        .from('users')
        .update({
          name: sessionUser?.name || null,
          email: sessionUser?.email || null,
          image: sessionUser?.image || null,
          access_token: session.accessToken as string,
        })
        .eq('id', inviteeUserId)
    } else {
      const { data: newUser, error: insertErr } = await sb
        .from('users')
        .insert({
          facebook_id: fbId,
          name: sessionUser?.name || null,
          email: sessionUser?.email || null,
          image: sessionUser?.image || null,
          access_token: session.accessToken as string,
        })
        .select('id')
        .single()
      if (insertErr || !newUser) {
        return NextResponse.json({ error: 'สร้างบัญชีไม่สำเร็จ: ' + (insertErr?.message || 'unknown') }, { status: 500 })
      }
      inviteeUserId = newUser.id
    }

    // 3) ห้าม invitee == owner
    if (inviteeUserId === inv.owner_user_id) {
      return NextResponse.json({ error: 'คุณคือเจ้าของอยู่แล้ว — ไม่ต้องรับคำเชิญ' }, { status: 400 })
    }

    // 4) Bulk insert page_members (ON CONFLICT DO NOTHING ถ้ามีอยู่แล้ว)
    const memberRows = (inv.page_ids || []).map((pageId: string) => ({
      user_id: inviteeUserId,
      page_id: pageId,
      role: inv.role,
      invited_by: inv.owner_user_id,
    }))

    if (memberRows.length > 0) {
      // ใช้ upsert เพื่อ avoid duplicate error; onConflict ที่ unique (user_id, page_id)
      const { error: memberErr } = await sb
        .from('page_members')
        .upsert(memberRows, { onConflict: 'user_id,page_id', ignoreDuplicates: true })
      if (memberErr) {
        return NextResponse.json({ error: 'เพิ่มสมาชิกไม่สำเร็จ: ' + memberErr.message }, { status: 500 })
      }
    }

    // 5) Mark invitation accepted — atomic flip
    const { data: flipped, error: flipErr } = await sb
      .from('team_invitations')
      .update({ accepted_by: inviteeUserId, accepted_at: new Date().toISOString() })
      .eq('id', inv.id)
      .is('accepted_at', null)
      .select('id')

    if (flipErr) {
      return NextResponse.json({ error: 'บันทึกคำเชิญไม่สำเร็จ: ' + flipErr.message }, { status: 500 })
    }
    if (!flipped || flipped.length === 0) {
      // มีคน accept ไปก่อนแล้ว — race condition
      return NextResponse.json({ error: 'คำเชิญถูกใช้ไปแล้ว (race)' }, { status: 410 })
    }

    return NextResponse.json({
      success: true,
      pageCount: memberRows.length,
      redirect: '/dashboard',
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
