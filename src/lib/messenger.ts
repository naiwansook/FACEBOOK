// Facebook Messenger API helpers
// Docs: https://developers.facebook.com/docs/messenger-platform
import crypto from 'crypto'

const FB_API = 'https://graph.facebook.com/v19.0'

// ============================================
// Webhook signature verification
// ============================================

/** ตรวจสอบ X-Hub-Signature-256 ว่ามาจาก Facebook จริง (ใช้ APP_SECRET) */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  if (!signature) return false
  const appSecret = process.env.FACEBOOK_CLIENT_SECRET
  if (!appSecret) return false

  // Format: "sha256=<hex>"
  const sig = signature.startsWith('sha256=') ? signature.slice(7) : signature
  const expected = crypto
    .createHmac('sha256', appSecret)
    .update(rawBody, 'utf8')
    .digest('hex')

  // timing-safe compare
  try {
    const a = Buffer.from(sig, 'hex')
    const b = Buffer.from(expected, 'hex')
    if (a.length !== b.length) return false
    return crypto.timingSafeEqual(a, b)
  } catch {
    return false
  }
}

// ============================================
// Send messages (Send API)
// ============================================

export interface SendMessageResult {
  success: boolean
  message_id?: string
  recipient_id?: string
  error?: string
}

/** ส่งข้อความ text ไปหาลูกค้า — ต้องอยู่ใน 24-hour messaging window */
export async function sendTextMessage(
  pageToken: string,
  recipientPsid: string,
  text: string,
  messagingType: 'RESPONSE' | 'UPDATE' | 'MESSAGE_TAG' = 'RESPONSE'
): Promise<SendMessageResult> {
  try {
    const res = await fetch(`${FB_API}/me/messages?access_token=${pageToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_type: messagingType,
        recipient: { id: recipientPsid },
        message: { text },
      }),
    })
    const data = await res.json()
    if (data.error) {
      return { success: false, error: data.error.message }
    }
    return {
      success: true,
      message_id: data.message_id,
      recipient_id: data.recipient_id,
    }
  } catch (e: any) {
    return { success: false, error: e.message || 'Network error' }
  }
}

/** ส่งรูป/ไฟล์แนบ */
export async function sendAttachment(
  pageToken: string,
  recipientPsid: string,
  attachmentType: 'image' | 'video' | 'audio' | 'file',
  url: string
): Promise<SendMessageResult> {
  try {
    const res = await fetch(`${FB_API}/me/messages?access_token=${pageToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { id: recipientPsid },
        message: {
          attachment: {
            type: attachmentType,
            payload: { url, is_reusable: true },
          },
        },
      }),
    })
    const data = await res.json()
    if (data.error) return { success: false, error: data.error.message }
    return { success: true, message_id: data.message_id }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

/** ส่งสถานะ "กำลังพิมพ์..." (typing indicator) */
export async function sendSenderAction(
  pageToken: string,
  recipientPsid: string,
  action: 'typing_on' | 'typing_off' | 'mark_seen'
): Promise<boolean> {
  try {
    const res = await fetch(`${FB_API}/me/messages?access_token=${pageToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { id: recipientPsid },
        sender_action: action,
      }),
    })
    const data = await res.json()
    return !data.error
  } catch {
    return false
  }
}

// ============================================
// Read conversations + messages
// ============================================

export interface FBConversation {
  id: string                               // t_xxxxxxx
  updated_time: string
  unread_count?: number
  participants?: { data: Array<{ id: string; name?: string; email?: string }> }
  snippet?: string
}

/** ดึง conversations ของ Page (paginated) */
export async function listConversations(
  pageId: string,
  pageToken: string,
  limit = 50
): Promise<FBConversation[]> {
  const fields = 'id,updated_time,unread_count,snippet,participants'
  const res = await fetch(
    `${FB_API}/${pageId}/conversations?fields=${fields}&limit=${limit}&access_token=${pageToken}`
  )
  const data = await res.json()
  if (data.error) throw new Error(data.error.message)
  return data.data || []
}

export interface FBMessage {
  id: string                               // mid.xxx
  created_time: string
  from: { id: string; name?: string; email?: string }
  to?: { data: Array<{ id: string; name?: string }> }
  message?: string
  attachments?: { data: Array<{ id: string; mime_type?: string; name?: string; image_data?: any; file_url?: string }> }
}

/** ดึงข้อความใน conversation */
export async function listMessages(
  conversationId: string,
  pageToken: string,
  limit = 50
): Promise<FBMessage[]> {
  const fields = 'id,created_time,from,to,message,attachments'
  const res = await fetch(
    `${FB_API}/${conversationId}/messages?fields=${fields}&limit=${limit}&access_token=${pageToken}`
  )
  const data = await res.json()
  if (data.error) throw new Error(data.error.message)
  return data.data || []
}

/** ดึงข้อมูล user (ลูกค้า) จาก PSID — ได้ name + profile pic */
export async function getUserProfile(
  psid: string,
  pageToken: string
): Promise<{ id: string; name?: string; profile_pic?: string } | null> {
  try {
    const res = await fetch(
      `${FB_API}/${psid}?fields=name,first_name,last_name,profile_pic&access_token=${pageToken}`
    )
    const data = await res.json()
    if (data.error) return null
    return {
      id: psid,
      name: data.name || `${data.first_name || ''} ${data.last_name || ''}`.trim() || 'ลูกค้า',
      profile_pic: data.profile_pic,
    }
  } catch {
    return null
  }
}

// ============================================
// Webhook subscription management
// ============================================

/** Subscribe Page to webhook events (messages, messaging_postbacks) */
export async function subscribePageToWebhook(
  pageId: string,
  pageToken: string,
  fields: string[] = ['messages', 'messaging_postbacks', 'message_deliveries', 'message_reads']
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${FB_API}/${pageId}/subscribed_apps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscribed_fields: fields.join(','),
        access_token: pageToken,
      }),
    })
    const data = await res.json()
    if (data.error) return { success: false, error: data.error.message }
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

/** Unsubscribe page (ใช้เวลา disconnect) */
export async function unsubscribePageFromWebhook(
  pageId: string,
  pageToken: string
): Promise<boolean> {
  try {
    const res = await fetch(`${FB_API}/${pageId}/subscribed_apps?access_token=${pageToken}`, {
      method: 'DELETE',
    })
    const data = await res.json()
    return !!data.success
  } catch {
    return false
  }
}

// ============================================
// Webhook event types
// ============================================

export interface WebhookEntry {
  id: string                          // Page ID
  time: number
  messaging?: WebhookMessagingEvent[]
}

export interface WebhookMessagingEvent {
  sender: { id: string }              // PSID (ลูกค้า) หรือ Page ID
  recipient: { id: string }           // Page ID หรือ PSID
  timestamp: number
  message?: {
    mid: string
    text?: string
    attachments?: Array<{ type: string; payload: { url?: string; sticker_id?: number } }>
    is_echo?: boolean                 // true = ข้อความที่เพจส่ง (echo back)
    app_id?: number
  }
  postback?: { title: string; payload: string }
  delivery?: { mids: string[]; watermark: number }
  read?: { watermark: number }
}
