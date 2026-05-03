// POST /api/inbox/sync
// Body: { pageId?: string }   ← ถ้าไม่ส่ง = sync ทุกเพจของ user
// Sync conversations + messages จาก Facebook (ใช้ตอนแรก หรือ webhook ตก)
// + auto-subscribe page to webhook
import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin, getUserIdFromFbToken } from '@/lib/supabase'
import {
  listConversations,
  listMessages,
  getUserProfile,
  subscribePageToWebhook,
} from '@/lib/messenger'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const FB_API = 'https://graph.facebook.com/v19.0'

/**
 * ดึง page_access_tokens สดใหม่จาก FB ผ่าน /me/accounts ของ user_token
 * → return Map<page_id, page_access_token>
 * ใช้เมื่อ page tokens ใน DB หมดอายุ (FB error code 190)
 */
async function fetchFreshPageTokens(userToken: string): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  try {
    let nextUrl: string | undefined =
      `${FB_API}/me/accounts?fields=id,access_token&limit=100&access_token=${userToken}`
    while (nextUrl) {
      const res: Response = await fetch(nextUrl)
      const data: any = await res.json()
      if (data.error) {
        console.error('[sync] /me/accounts failed:', data.error.message)
        break
      }
      for (const p of (data.data || []) as any[]) {
        if (p.id && p.access_token) map.set(p.id, p.access_token)
      }
      nextUrl = data.paging?.next
    }
  } catch (e: any) {
    console.error('[sync] fetchFreshPageTokens threw:', e.message)
  }
  return map
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.accessToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const userId = await getUserIdFromFbToken(session.accessToken as string, (session as any).fbUserId)
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const onlyPageId: string | undefined = body.pageId

    const sb = supabaseAdmin()

    // ดึง pages ที่จะ sync
    let pageQuery = sb
      .from('connected_pages')
      .select('id, page_id, page_name, page_access_token, page_picture')
      .eq('user_id', userId)
      .eq('is_active', true)

    if (onlyPageId) pageQuery = pageQuery.eq('id', onlyPageId)

    const { data: pages } = await pageQuery
    if (!pages || pages.length === 0) {
      return NextResponse.json({ synced: 0, message: 'No pages to sync' })
    }

    // ── Pre-flight: ตรวจ page_access_token ของแต่ละเพจ ──
    // ถ้าเจอ token หมดอายุ (code 190) → ดึง tokens ใหม่จาก /me/accounts
    // โดยใช้ user_access_token แล้วอัพเดท DB ก่อน sync
    let freshTokens: Map<string, string> | null = null
    for (const page of pages) {
      try {
        const r = await fetch(
          `${FB_API}/me?fields=id&access_token=${page.page_access_token}`
        )
        const d = await r.json()
        if (d.error?.code === 190) {
          if (!freshTokens) {
            console.log('[sync] page tokens invalid → fetching fresh from /me/accounts')
            freshTokens = await fetchFreshPageTokens(session.accessToken as string)
          }
          const newToken = freshTokens.get(page.page_id)
          if (newToken && newToken !== page.page_access_token) {
            await sb
              .from('connected_pages')
              .update({ page_access_token: newToken })
              .eq('id', page.id)
            page.page_access_token = newToken
            console.log(`[sync] refreshed page_access_token for ${page.page_name}`)
          }
        }
      } catch {}
    }

    const summary: any[] = []

    for (const page of pages) {
      const pageResult: any = {
        page_id: page.page_id,
        page_name: page.page_name,
        conversations: 0,
        messages: 0,
        errors: [] as string[],
      }

      // Subscribe to webhook (idempotent)
      const sub = await subscribePageToWebhook(page.page_id, page.page_access_token)
      pageResult.webhook_subscribed = sub.success
      if (!sub.success && sub.error) pageResult.errors.push(`Subscribe: ${sub.error}`)

      // Fetch conversations (with pagination — รองรับเพจที่มีลูกค้าเยอะ)
      try {
        const fbConvs = await listConversations(page.page_id, page.page_access_token, 50, 5)
        console.log(`[sync] ${page.page_name}: fetched ${fbConvs.length} conversations from FB`)

        for (const fbConv of fbConvs) {
          // หา PSID ลูกค้า (participant ที่ไม่ใช่ page)
          const customer = (fbConv.participants?.data || []).find(p => p.id !== page.page_id)
          if (!customer) continue

          const customerPsid = customer.id

          // Upsert conversation
          let { data: localConv } = await sb
            .from('conversations')
            .select('id, customer_picture')
            .eq('fb_page_id', page.page_id)
            .eq('fb_psid', customerPsid)
            .single()

          let convId: string

          if (!localConv) {
            const profile = await getUserProfile(customerPsid, page.page_access_token)
            const { data: newConv } = await sb
              .from('conversations')
              .insert({
                user_id: userId,
                page_id: page.id,
                fb_page_id: page.page_id,
                fb_conversation_id: fbConv.id,
                fb_psid: customerPsid,
                customer_name: customer.name || profile?.name || 'ลูกค้า',
                customer_picture: profile?.profile_pic,
                last_message: fbConv.snippet || '',
                last_message_at: fbConv.updated_time,
                last_sender: 'customer',
                unread_count: fbConv.unread_count || 0,
              })
              .select('id')
              .single()
            if (!newConv) continue
            convId = newConv.id
            pageResult.conversations++
          } else {
            convId = localConv.id
            await sb
              .from('conversations')
              .update({
                fb_conversation_id: fbConv.id,
                last_message: fbConv.snippet || '',
                last_message_at: fbConv.updated_time,
                unread_count: fbConv.unread_count || 0,
              })
              .eq('id', convId)
          }

          // Fetch messages of this conversation (last 25)
          try {
            const fbMsgs = await listMessages(fbConv.id, page.page_access_token, 25)
            for (const m of fbMsgs) {
              const isFromPage = m.from?.id === page.page_id
              const messageText = m.message || null
              const attachments = (() => {
                const list: any[] = []
                // 1) Sticker — FB เก็บ URL ใน field "sticker" แยกจาก attachments
                if ((m as any).sticker) {
                  list.push({ type: 'image', url: (m as any).sticker, name: 'sticker' })
                }
                // 2) Shares (link ที่ลูกค้าส่งมา)
                for (const s of ((m as any).shares?.data || []) as any[]) {
                  if (s.link) list.push({ type: 'file', url: s.link, name: s.description || 'ลิงก์' })
                }
                // 3) attachments — รองรับทุก field
                for (const a of ((m as any).attachments?.data || []) as any[]) {
                  const url = a.image_data?.url
                    || a.file_url
                    || a.video_data?.url
                    || a.audio_data?.url
                    || a.payload?.url
                  const isImage = a.mime_type?.startsWith('image/')
                    || !!a.image_data
                    || a.type === 'image'
                  list.push({
                    type: isImage ? 'image' : 'file',
                    url,
                    name: a.name || (isImage ? 'รูปภาพ' : 'ไฟล์แนบ'),
                  })
                }
                return list
              })()

              // Insert ใหม่ (skip ถ้ามี — กัน duplicate)
              await sb
                .from('inbox_messages')
                .upsert(
                  {
                    conversation_id: convId,
                    fb_message_id: m.id,
                    fb_sender_id: m.from?.id || 'unknown',
                    direction: isFromPage ? 'outbound' : 'inbound',
                    message_text: messageText,
                    attachments,
                    sent_by: isFromPage ? 'page_user' : 'customer',
                    delivery_status: 'delivered',
                    created_at: m.created_time,
                  },
                  { onConflict: 'fb_message_id', ignoreDuplicates: true }
                )

              // Update FB-sourced fields เสมอ (กรณี record อยู่แล้วแต่
              // attachments/text ยังว่าง เพราะ sync ก่อนหน้านี้ยังไม่มี
              // logic ดึง sticker / shares — จะเติมข้อมูลให้ครบ)
              if (messageText || attachments.length > 0) {
                await sb
                  .from('inbox_messages')
                  .update({ message_text: messageText, attachments })
                  .eq('fb_message_id', m.id)
              }
              pageResult.messages++
            }
          } catch (e: any) {
            pageResult.errors.push(`Messages for ${customerPsid}: ${e.message}`)
          }
        }
      } catch (e: any) {
        pageResult.errors.push(`Conversations: ${e.message}`)
      }

      summary.push(pageResult)
    }

    return NextResponse.json({ success: true, summary })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
