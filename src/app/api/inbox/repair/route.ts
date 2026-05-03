// POST /api/inbox/repair — refetch ข้อความใน DB ที่ message_text=null + attachments=[]
// (มัก เกิดจาก sync เก่าที่ไม่ดึง sticker URL)
// Body: { pageId?: string }  ถ้าไม่ส่ง = ทำทุกเพจของ user
import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin, getUserIdFromFbToken } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const FB_API = 'https://graph.facebook.com/v19.0'

// Allow GET ด้วย (เปิด URL ตรงได้ ไม่ต้องใช้ console paste)
export async function GET(req: Request) {
  return POST(req)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = await getUserIdFromFbToken(session.accessToken as string, (session as any).fbUserId)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // รับ pageId จาก body (POST) หรือ query (GET)
  const url = new URL(req.url)
  const queryPageId = url.searchParams.get('pageId') || undefined
  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
  const onlyPageId: string | undefined = body.pageId || queryPageId

  const sb = supabaseAdmin()

  // 1) หา empty messages — null text + empty attachments
  let q = sb
    .from('inbox_messages')
    .select('id, fb_message_id, conversation_id, conversations!inner(page_id, user_id)')
    .is('message_text', null)
    .or('attachments.is.null,attachments.eq.[]')
    .not('fb_message_id', 'is', null)
    .limit(100)
  const { data: emptyMsgs, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // กรอง: เฉพาะ user นี้ + (optional) เฉพาะเพจ
  const filtered = (emptyMsgs || []).filter((m: any) => {
    if (m.conversations?.user_id !== userId) return false
    if (onlyPageId && m.conversations?.page_id !== onlyPageId) return false
    return true
  })

  if (filtered.length === 0) {
    return NextResponse.json({ repaired: 0, total: 0, message: 'no empty messages found' })
  }

  // 2) ดึง page_access_tokens ของแต่ละเพจที่เกี่ยวข้อง
  const pageIds = Array.from(new Set(filtered.map((m: any) => m.conversations.page_id)))
  const { data: pages } = await sb
    .from('connected_pages')
    .select('id, page_access_token')
    .in('id', pageIds)
  const tokenMap = new Map((pages || []).map((p: any) => [p.id, p.page_access_token]))

  // 3) refetch แต่ละ message
  const fields = 'id,message,sticker,shares,attachments{id,mime_type,name,image_data,file_url,video_data,audio_data,payload}'
  const result: any[] = []
  let repaired = 0

  for (const m of filtered) {
    const pageId = (m as any).conversations.page_id
    const token = tokenMap.get(pageId)
    if (!token) {
      result.push({ id: m.id, status: 'no_token' })
      continue
    }
    try {
      const r = await fetch(
        `${FB_API}/${m.fb_message_id}?fields=${fields}&access_token=${token}`
      )
      const data: any = await r.json()
      if (data.error) {
        result.push({ id: m.id, status: 'fb_error', error: data.error.message?.slice(0, 100) })
        continue
      }
      const newText = data.message || null
      const attachments: any[] = []
      if (data.sticker) attachments.push({ type: 'image', url: data.sticker, name: 'sticker' })
      for (const s of (data.shares?.data || []) as any[]) {
        if (s.link) attachments.push({ type: 'file', url: s.link, name: s.description || 'ลิงก์' })
      }
      for (const a of (data.attachments?.data || []) as any[]) {
        const url = a.image_data?.url || a.file_url || a.video_data?.url || a.audio_data?.url || a.payload?.url
        const isImage = a.mime_type?.startsWith('image/') || !!a.image_data || a.type === 'image'
        attachments.push({ type: isImage ? 'image' : 'file', url, name: a.name || (isImage ? 'รูปภาพ' : 'ไฟล์แนบ') })
      }

      if (!newText && attachments.length === 0) {
        result.push({ id: m.id, status: 'still_empty', fb: data })
        continue
      }

      await sb.from('inbox_messages')
        .update({ message_text: newText, attachments })
        .eq('id', m.id)
      result.push({ id: m.id, status: 'repaired', text: newText?.slice(0, 50), attachmentCount: attachments.length })
      repaired++
    } catch (e: any) {
      result.push({ id: m.id, status: 'threw', error: e.message?.slice(0, 100) })
    }
  }

  return NextResponse.json({ repaired, total: filtered.length, result })
}
