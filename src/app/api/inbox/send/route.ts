// POST /api/inbox/send
// Body: { conversationId: string, text: string }
import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin, getUserIdFromFbToken } from '@/lib/supabase'
import { sendTextMessage, sendSenderAction } from '@/lib/messenger'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.accessToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = await getUserIdFromFbToken(session.accessToken as string)
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { conversationId, text } = await req.json()
    if (!conversationId || !text || typeof text !== 'string' || !text.trim()) {
      return NextResponse.json({ error: 'Missing conversationId or text' }, { status: 400 })
    }

    const sb = supabaseAdmin()

    // หา conversation + page token
    const { data: conv } = await sb
      .from('conversations')
      .select('id, fb_psid, page_id, fb_page_id')
      .eq('id', conversationId)
      .eq('user_id', userId)
      .single()

    if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })

    const { data: page } = await sb
      .from('connected_pages')
      .select('page_access_token')
      .eq('id', conv.page_id)
      .single()

    if (!page?.page_access_token) {
      return NextResponse.json({ error: 'Page token not found' }, { status: 400 })
    }

    // optimistic typing indicator
    sendSenderAction(page.page_access_token, conv.fb_psid, 'typing_on').catch(() => {})

    // ส่งข้อความ — RESPONSE (ภายใน 24 ชม. ของ last message ลูกค้า)
    // หมายเหตุ: ไม่ใช้ HUMAN_AGENT tag retry เพราะต้องผ่าน FB App Review
    // (error #100 — ใช้ tag นี้ไม่ได้จนกว่าจะได้รับอนุมัติ)
    const result = await sendTextMessage(
      page.page_access_token,
      conv.fb_psid,
      text.trim(),
      'RESPONSE'
    )

    if (!result.success) {
      let userError = result.error || 'Send failed'
      if (result.errorCode === 10) {
        userError = '⚠️ ลูกค้าทักมาเกิน 24 ชม. — Facebook ห้ามตอบ (Messenger 24-hour rule) ต้องรอลูกค้าทักก่อน หรือขอ Human Agent feature จาก FB App Review'
      } else if (result.errorCode === 100) {
        userError = '⚠️ FB App ยังไม่ได้รับอนุมัติ Human Agent feature — submit App Review ที่ developers.facebook.com'
      } else if (result.errorCode === 190) {
        userError = '⚠️ Page token หมดอายุ — กลับไปกด Sync แล้วลองใหม่'
      }
      await sb.from('inbox_messages').insert({
        conversation_id: conv.id,
        fb_sender_id: conv.fb_page_id,
        direction: 'outbound',
        message_text: text.trim(),
        sent_by: 'page_user',
        sent_by_user_id: userId,
        delivery_status: 'failed',
        error_message: userError,
      })
      return NextResponse.json({ error: userError }, { status: 500 })
    }

    // บันทึก message สำเร็จ
    const { data: saved } = await sb
      .from('inbox_messages')
      .insert({
        conversation_id: conv.id,
        fb_message_id: result.message_id,
        fb_sender_id: conv.fb_page_id,
        direction: 'outbound',
        message_text: text.trim(),
        sent_by: 'page_user',
        sent_by_user_id: userId,
        delivery_status: 'sent',
      })
      .select('*')
      .single()

    // อัปเดต conversation last message
    await sb
      .from('conversations')
      .update({
        last_message: text.trim(),
        last_message_at: new Date().toISOString(),
        last_sender: 'page',
        unread_count: 0,
        is_resolved: false,  // มี reply ใหม่ → unresolve
      })
      .eq('id', conv.id)

    return NextResponse.json({ success: true, message: saved })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
