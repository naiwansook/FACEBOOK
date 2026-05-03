// POST /api/inbox/ai-suggest
// Body: { conversationId: string, instruction?: string }
// Returns: { suggestions: string[], sentiment: string, category: string, summary: string }
import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin, getUserIdFromFbToken } from '@/lib/supabase'
import Anthropic from '@anthropic-ai/sdk'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.accessToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const userId = await getUserIdFromFbToken(session.accessToken as string, (session as any).fbUserId)
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { conversationId, instruction } = await req.json()
    if (!conversationId) {
      return NextResponse.json({ error: 'Missing conversationId' }, { status: 400 })
    }

    const sb = supabaseAdmin()

    const { data: conv } = await sb
      .from('conversations')
      .select('id, customer_name, page_id')
      .eq('id', conversationId)
      .eq('user_id', userId)
      .single()
    if (!conv) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // ดึงข้อความล่าสุด 20 ข้อความ
    const { data: messages } = await sb
      .from('inbox_messages')
      .select('direction, message_text, sent_by, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(20)

    const recent = (messages || []).reverse()

    // ดึง knowledge base + tone จาก settings
    const { data: settings } = await sb
      .from('inbox_settings')
      .select('ai_tone, knowledge_base')
      .eq('user_id', userId)
      .eq('page_id', conv.page_id)
      .single()

    const tone = settings?.ai_tone || 'friendly'
    const kb = settings?.knowledge_base || ''

    // ดึง page name
    const { data: page } = await sb
      .from('connected_pages')
      .select('page_name')
      .eq('id', conv.page_id)
      .single()

    const transcript = recent
      .map(m => `${m.direction === 'inbound' ? `[ลูกค้า] ${conv.customer_name}` : `[เพจ ${page?.page_name || ''}]`}: ${m.message_text || '(ไฟล์แนบ)'}`)
      .join('\n')

    const toneGuide: Record<string, string> = {
      friendly: 'เป็นกันเอง อบอุ่น ใช้คำลงท้าย ค่ะ/ครับ มี emoji ได้บ้าง',
      professional: 'ทางการ สุภาพ กระชับ ตรงประเด็น ไม่ใช้ emoji',
      casual: 'สบายๆ เหมือนเพื่อน ใช้คำง่ายๆ มี emoji ได้',
    }

    const prompt = `คุณคือ AI ผู้ช่วยตอบแชทลูกค้าให้กับเพจ Facebook "${page?.page_name || ''}"

# บทสนทนาล่าสุด:
${transcript}

# ข้อมูลร้าน/สินค้า/FAQ (ใช้อ้างอิงเวลาตอบ):
${kb || '(ยังไม่ได้ตั้งค่า)'}

# โทนการตอบ: ${toneGuide[tone] || toneGuide.friendly}

${instruction ? `# คำสั่งพิเศษจาก user: ${instruction}` : ''}

# งานของคุณ:
1. เสนอข้อความตอบกลับ 3 แบบ ให้ user เลือก (สั้น กลาง ยาว) — ทุกแบบต้องเป็นภาษาไทย เป็นธรรมชาติ ตอบตรงคำถามของลูกค้า
2. วิเคราะห์ category: 'inquiry' (ถามทั่วไป) | 'price' (ถามราคา) | 'order' (สั่งซื้อ) | 'complaint' (ร้องเรียน) | 'support' (ขอความช่วยเหลือ) | 'spam' | 'other'
3. วิเคราะห์ sentiment: 'positive' | 'neutral' | 'negative'
4. สรุปบทสนทนาสั้นๆ 1 ประโยค

ตอบเป็น JSON เท่านั้น:
{
  "suggestions": ["ตอบแบบสั้น", "ตอบแบบกลาง", "ตอบแบบยาว"],
  "category": "...",
  "sentiment": "...",
  "summary": "..."
}`

    const resp = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw = resp.content[0].type === 'text' ? resp.content[0].text : ''

    // Parse JSON safely
    let parsed: any = {}
    try {
      const cleaned = raw.replace(/```json|```/g, '').trim()
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0])
    } catch {}

    const suggestions: string[] = Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 3) : []
    const category = typeof parsed.category === 'string' ? parsed.category : null
    const sentiment = typeof parsed.sentiment === 'string' ? parsed.sentiment : null
    const summary = typeof parsed.summary === 'string' ? parsed.summary : null

    // อัปเดต conversation metadata
    if (category || sentiment || summary) {
      const update: any = {}
      if (category) update.ai_category = category
      if (sentiment) update.ai_sentiment = sentiment
      if (summary) update.ai_summary = summary
      await sb.from('conversations').update(update).eq('id', conversationId)
    }

    return NextResponse.json({ suggestions, category, sentiment, summary })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
