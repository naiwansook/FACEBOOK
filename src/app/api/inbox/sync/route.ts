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

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.accessToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const userId = await getUserIdFromFbToken(session.accessToken as string)
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

      // Fetch conversations
      try {
        const fbConvs = await listConversations(page.page_id, page.page_access_token, 50)

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
              await sb
                .from('inbox_messages')
                .upsert(
                  {
                    conversation_id: convId,
                    fb_message_id: m.id,
                    fb_sender_id: m.from?.id || 'unknown',
                    direction: isFromPage ? 'outbound' : 'inbound',
                    message_text: m.message || null,
                    attachments: (m.attachments?.data || []).map(a => ({
                      type: a.mime_type?.startsWith('image/') ? 'image' : 'file',
                      url: a.image_data?.url || a.file_url,
                      name: a.name,
                    })),
                    sent_by: isFromPage ? 'page_user' : 'customer',
                    delivery_status: 'delivered',
                    created_at: m.created_time,
                  },
                  { onConflict: 'fb_message_id', ignoreDuplicates: true }
                )
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
