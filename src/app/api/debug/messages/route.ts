// GET /api/debug/messages?convId=<uuid>
// ดึง raw messages จาก FB Graph API ตรงๆ เพื่อดูว่า FB ส่งอะไรมา
// ใช้วินิจฉัย sticker / message-without-content
import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin, getUserIdFromFbToken } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const FB_API = 'https://graph.facebook.com/v19.0'

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) return NextResponse.json({ error: 'no session' }, { status: 401 })

  const userId = await getUserIdFromFbToken(session.accessToken as string, (session as any).fbUserId)
  if (!userId) return NextResponse.json({ error: 'no user' }, { status: 401 })

  const url = new URL(req.url)
  const convId = url.searchParams.get('convId')
  const pageId = url.searchParams.get('pageId')
  const customerName = url.searchParams.get('name')

  const sb = supabaseAdmin()
  let conv: any = null

  if (convId) {
    const { data } = await sb
      .from('conversations')
      .select('id, fb_conversation_id, page_id, customer_name')
      .eq('id', convId)
      .eq('user_id', userId)
      .single()
    conv = data
  } else if (pageId) {
    // ใช้ pageId + name (หรือ recent) — หา conv ล่าสุด
    let q = sb
      .from('conversations')
      .select('id, fb_conversation_id, page_id, customer_name')
      .eq('user_id', userId)
      .eq('page_id', pageId)
      .order('last_message_at', { ascending: false })
      .limit(1)
    if (customerName) q = q.ilike('customer_name', `%${customerName}%`)
    const { data } = await q.maybeSingle()
    conv = data
  }

  if (!conv) {
    return NextResponse.json({ error: 'missing convId or pageId(+name)' }, { status: 400 })
  }

  if (!conv?.fb_conversation_id) {
    return NextResponse.json({ error: 'conv not found or no fb_conversation_id' }, { status: 404 })
  }

  const { data: page } = await sb
    .from('connected_pages')
    .select('page_access_token, page_id')
    .eq('id', conv.page_id)
    .single()

  if (!page?.page_access_token) {
    return NextResponse.json({ error: 'no page token' }, { status: 400 })
  }

  // ดึง raw messages จาก FB — ขอ field มากที่สุดเพื่อดูว่ามีอะไรบ้าง
  const fields = 'id,created_time,from,to,message,sticker,shares,attachments{id,mime_type,name,image_data,file_url,video_data,audio_data,payload}'
  const r = await fetch(
    `${FB_API}/${conv.fb_conversation_id}/messages?fields=${fields}&limit=10&access_token=${page.page_access_token}`
  )
  const fbData = await r.json()

  // ดึง local DB rows เปรียบเทียบ
  const { data: localMsgs } = await sb
    .from('inbox_messages')
    .select('id, fb_message_id, message_text, attachments, direction, created_at, delivery_status, error_message')
    .eq('conversation_id', convId)
    .order('created_at', { ascending: false })
    .limit(10)

  return NextResponse.json({
    conv: { customer_name: conv.customer_name, fb_conversation_id: conv.fb_conversation_id },
    fb: fbData,
    local: localMsgs,
  }, { status: 200 })
}
