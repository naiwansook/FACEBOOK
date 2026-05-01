// Facebook Messenger webhook
// Setup at: developers.facebook.com → App → Webhooks → Page subscription
//   Callback URL: https://YOUR_DOMAIN/api/webhooks/messenger
//   Verify Token: env FB_WEBHOOK_VERIFY_TOKEN
//   Subscription fields: messages, messaging_postbacks, message_deliveries, message_reads
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import {
  verifyWebhookSignature,
  getUserProfile,
  sendTextMessage,
  type WebhookEntry,
  type WebhookMessagingEvent,
} from '@/lib/messenger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// ─────────────────────────────────────────────
// GET — Webhook verification handshake
// ─────────────────────────────────────────────
export async function GET(req: Request) {
  const url = new URL(req.url)
  const mode = url.searchParams.get('hub.mode')
  const token = url.searchParams.get('hub.verify_token')
  const challenge = url.searchParams.get('hub.challenge')

  const verifyToken = process.env.FB_WEBHOOK_VERIFY_TOKEN

  if (mode === 'subscribe' && token === verifyToken && challenge) {
    return new Response(challenge, { status: 200 })
  }
  return new Response('Forbidden', { status: 403 })
}

// ─────────────────────────────────────────────
// POST — Receive events
// ─────────────────────────────────────────────
export async function POST(req: Request) {
  // ต้องอ่าน raw body ก่อน parse JSON เพื่อ verify signature
  const rawBody = await req.text()
  const signature = req.headers.get('x-hub-signature-256')

  // Verify signature (skip ใน dev ถ้ายังไม่ได้ set FACEBOOK_CLIENT_SECRET)
  if (process.env.FACEBOOK_CLIENT_SECRET) {
    if (!verifyWebhookSignature(rawBody, signature)) {
      return new Response('Invalid signature', { status: 401 })
    }
  }

  let body: { object?: string; entry?: WebhookEntry[] }
  try {
    body = JSON.parse(rawBody)
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  if (body.object !== 'page') {
    return NextResponse.json({ ok: true })
  }

  // Process each entry async — return 200 ASAP (FB requires < 20s)
  // We don't await — fire-and-forget (Vercel serverless will keep alive briefly)
  for (const entry of body.entry || []) {
    if (entry.messaging) {
      for (const event of entry.messaging) {
        // Don't await — process in background to respond quickly
        processMessagingEvent(entry.id, event).catch(err => {
          console.error('Webhook processing error:', err)
        })
      }
    }
  }

  return NextResponse.json({ ok: true })
}

// ─────────────────────────────────────────────
// Event processor
// ─────────────────────────────────────────────
async function processMessagingEvent(pageId: string, event: WebhookMessagingEvent) {
  const sb = supabaseAdmin()

  // หา connected_page + user_id
  const { data: page } = await sb
    .from('connected_pages')
    .select('id, user_id, page_access_token, page_name, page_picture')
    .eq('page_id', pageId)
    .single()

  if (!page) {
    console.warn(`Webhook: page ${pageId} not connected`)
    return
  }

  const pageToken = page.page_access_token

  // ─── Handle delivery / read receipts ───
  if (event.delivery || event.read) {
    // ไม่ทำอะไรมาก — ใช้แค่ update read status ถ้าต้องการ
    return
  }

  // ─── Handle messages ───
  if (!event.message) return

  const msg = event.message
  const isEcho = !!msg.is_echo

  // Echo = ข้อความที่ "เพจ" เป็นคนส่ง (อาจส่งจากที่อื่น เช่น FB Page inbox)
  // ถ้า app_id ตรงกับ app เรา แสดงว่าเราส่งเอง (skip ได้ เพราะ /send บันทึกแล้ว)
  const ourAppId = Number(process.env.FACEBOOK_CLIENT_ID || 0)
  if (isEcho && msg.app_id && ourAppId && Number(msg.app_id) === ourAppId) {
    return
  }

  // กำหนด PSID ลูกค้า + direction
  const customerPsid = isEcho ? event.recipient.id : event.sender.id
  const direction: 'inbound' | 'outbound' = isEcho ? 'outbound' : 'inbound'

  // ─── หา/สร้าง conversation ───
  let { data: conv } = await sb
    .from('conversations')
    .select('id, customer_name, unread_count')
    .eq('fb_page_id', pageId)
    .eq('fb_psid', customerPsid)
    .single()

  if (!conv) {
    // สร้าง conversation ใหม่ + ดึงโปรไฟล์ลูกค้า
    const profile = await getUserProfile(customerPsid, pageToken)
    const { data: newConv } = await sb
      .from('conversations')
      .insert({
        user_id: page.user_id,
        page_id: page.id,
        fb_page_id: pageId,
        fb_psid: customerPsid,
        customer_name: profile?.name || 'ลูกค้า',
        customer_picture: profile?.profile_pic,
        last_message: msg.text || '(ไฟล์แนบ)',
        last_message_at: new Date(event.timestamp).toISOString(),
        last_sender: direction === 'inbound' ? 'customer' : 'page',
        unread_count: direction === 'inbound' ? 1 : 0,
      })
      .select('id, customer_name, unread_count')
      .single()
    conv = newConv
  } else {
    // อัปเดต conversation
    await sb
      .from('conversations')
      .update({
        last_message: msg.text || '(ไฟล์แนบ)',
        last_message_at: new Date(event.timestamp).toISOString(),
        last_sender: direction === 'inbound' ? 'customer' : 'page',
        unread_count: direction === 'inbound' ? (conv.unread_count || 0) + 1 : conv.unread_count,
      })
      .eq('id', conv.id)
  }

  if (!conv) return

  // ─── บันทึก message (idempotent ด้วย fb_message_id unique) ───
  const attachments = (msg.attachments || []).map(a => ({
    type: a.type,
    url: a.payload?.url,
  }))

  await sb
    .from('inbox_messages')
    .upsert(
      {
        conversation_id: conv.id,
        fb_message_id: msg.mid,
        fb_sender_id: event.sender.id,
        direction,
        message_text: msg.text || null,
        attachments,
        sent_by: direction === 'inbound' ? 'customer' : 'page_user',
        delivery_status: 'delivered',
        created_at: new Date(event.timestamp).toISOString(),
      },
      { onConflict: 'fb_message_id', ignoreDuplicates: true }
    )

  // ─── Auto-reply (ถ้าเปิด + เป็น inbound + นอกเวลาทำการ หรือ enable auto-reply เสมอ) ───
  if (direction === 'inbound') {
    await maybeAutoReply(page.id, page.user_id, pageId, pageToken, customerPsid)
  }
}

// ─────────────────────────────────────────────
// Auto-reply logic (Phase 4)
// ─────────────────────────────────────────────
async function maybeAutoReply(
  pageDbId: string,
  userId: string,
  fbPageId: string,
  pageToken: string,
  customerPsid: string
) {
  const sb = supabaseAdmin()

  const { data: settings } = await sb
    .from('inbox_settings')
    .select('auto_reply_enabled, auto_reply_message, business_hours_enabled, business_hours, off_hours_message')
    .eq('user_id', userId)
    .eq('page_id', pageDbId)
    .single()

  if (!settings) return

  let replyText: string | null = null

  // ตรวจสอบ business hours ก่อน — ถ้านอกเวลา ตอบ off_hours_message
  if (settings.business_hours_enabled && isOutsideBusinessHours(settings.business_hours)) {
    replyText = settings.off_hours_message
  } else if (settings.auto_reply_enabled) {
    replyText = settings.auto_reply_message
  }

  if (!replyText) return

  // Throttle: อย่าตอบซ้ำถ้าตอบไปแล้วใน 1 ชม.
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { data: convo } = await sb
    .from('conversations')
    .select('id')
    .eq('fb_page_id', fbPageId)
    .eq('fb_psid', customerPsid)
    .single()

  if (convo) {
    const { data: recentAuto } = await sb
      .from('inbox_messages')
      .select('id')
      .eq('conversation_id', convo.id)
      .eq('sent_by', 'page_auto')
      .gte('created_at', oneHourAgo)
      .limit(1)

    if (recentAuto && recentAuto.length > 0) return  // ตอบ auto ไปแล้ว
  }

  // ส่งข้อความ
  const result = await sendTextMessage(pageToken, customerPsid, replyText)
  if (result.success && convo) {
    await sb.from('inbox_messages').insert({
      conversation_id: convo.id,
      fb_message_id: result.message_id,
      fb_sender_id: fbPageId,
      direction: 'outbound',
      message_text: replyText,
      sent_by: 'page_auto',
      delivery_status: 'sent',
    })
    await sb
      .from('conversations')
      .update({
        last_message: replyText,
        last_message_at: new Date().toISOString(),
        last_sender: 'page',
      })
      .eq('id', convo.id)
  }
}

// helper — ดูว่าตอนนี้อยู่นอกเวลาทำการมั้ย (timezone: Asia/Bangkok)
function isOutsideBusinessHours(hours: any): boolean {
  if (!hours) return false
  const now = new Date()
  // แปลงเป็นเวลาไทย
  const bangkokTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }))
  const dayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
  const dayKey = dayKeys[bangkokTime.getDay()]
  const today = hours[dayKey]
  if (!today || today.off) return true
  const hh = bangkokTime.getHours()
  const mm = bangkokTime.getMinutes()
  const cur = hh * 60 + mm
  const [sh, sm] = (today.start || '09:00').split(':').map(Number)
  const [eh, em] = (today.end || '18:00').split(':').map(Number)
  const startMin = sh * 60 + sm
  const endMin = eh * 60 + em
  return cur < startMin || cur > endMin
}
