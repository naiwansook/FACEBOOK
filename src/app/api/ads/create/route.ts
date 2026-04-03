import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const FB = 'https://graph.facebook.com/v19.0'

export async function POST(req: Request) {
  try {
    // ── 1. Auth ───────────────────────────────────────────────
    const session = await getServerSession(authOptions)
    if (!session?.accessToken) {
      return NextResponse.json({ error: 'กรุณา Login ก่อน' }, { status: 401 })
    }
    const userToken = session.accessToken as string

    // ── 2. Body ───────────────────────────────────────────────
    const body = await req.json()
    const { postId, pageId, pageToken, pageName, postMessage, campaignName, dailyBudget, startDate, endDate } = body

    if (!postId || !pageId || !pageToken || !campaignName || !dailyBudget) {
      return NextResponse.json({ error: 'ข้อมูลไม่ครบถ้วน' }, { status: 400 })
    }

    // ── 3. Supabase ───────────────────────────────────────────
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !supabaseUrl.startsWith('https://')) {
      return NextResponse.json({ error: `ตั้งค่า SUPABASE_URL ผิด: ${supabaseUrl}` }, { status: 500 })
    }

    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(supabaseUrl, supabaseKey!)

    // ── 4. Facebook User Info ─────────────────────────────────
    let meData: any
    try {
      const meRes = await fetch(`${FB}/me?fields=id,name,email&access_token=${userToken}`)
      meData = await meRes.json()
      if (meData.error) {
        return NextResponse.json({ error: `Facebook token error: ${meData.error.message}` }, { status: 400 })
      }
    } catch (e: any) {
      return NextResponse.json({ error: `ติดต่อ Facebook ไม่ได้: ${e.message}` }, { status: 500 })
    }

    // ── 5. Upsert User ────────────────────────────────────────
    const { data: user, error: userError } = await supabase
      .from('users')
      .upsert({
        facebook_id: meData.id,
        name: meData.name || session.user?.name,
        email: meData.email || session.user?.email || null,
        image: session.user?.image || null,
        access_token: userToken,
      }, { onConflict: 'facebook_id' })
      .select('id')
      .single()

    if (userError) {
      console.error('[create] upsert user error:', userError)
      return NextResponse.json({ error: `Supabase user error: ${userError.message}` }, { status: 500 })
    }

    // ── 6. Get Ad Account (ใช้ User Token) ───────────────────
    // ลอง 3 วิธีตามลำดับ
    let adAccountId: string | null = null
    let adAccountError = ''

    // วิธี 1: /me/adaccounts ด้วย user token
    try {
      const r = await fetch(`${FB}/me/adaccounts?fields=id,name,account_status&limit=10&access_token=${userToken}`)
      const d = await r.json()
      if (!d.error && d.data?.length > 0) {
        // เลือก account ที่ active (account_status = 1)
        const active = d.data.find((a: any) => a.account_status === 1) || d.data[0]
        adAccountId = active.id
      } else if (d.error) {
        adAccountError = d.error.message
      }
    } catch (e: any) {
      adAccountError = e.message
    }

    // วิธี 2: /{pageId}/adaccounts ด้วย page token
    if (!adAccountId) {
      try {
        const r = await fetch(`${FB}/${pageId}/adaccounts?fields=id,account_status&access_token=${pageToken}`)
        const d = await r.json()
        if (!d.error && d.data?.length > 0) {
          const active = d.data.find((a: any) => a.account_status === 1) || d.data[0]
          adAccountId = active.id
        }
      } catch { /* ignore */ }
    }

    if (!adAccountId) {
      return NextResponse.json({
        error: `ไม่พบ Ad Account — ${adAccountError || 'กรุณาตรวจสอบว่า Facebook App มีสิทธิ์ ads_management และ Page เชื่อมต่อกับ Business Manager แล้ว'}`,
      }, { status: 400 })
    }

    // ── 7. Upsert Connected Page ──────────────────────────────
    const { data: connectedPage, error: pageError } = await supabase
      .from('connected_pages')
      .upsert({
        user_id: user.id,
        page_id: pageId,
        page_name: pageName || pageId,
        page_access_token: pageToken,
        ad_account_id: adAccountId,
      }, { onConflict: 'user_id,page_id' })
      .select('id')
      .single()

    if (pageError) {
      console.error('[create] upsert page error:', pageError)
      return NextResponse.json({ error: `Supabase page error: ${pageError.message}` }, { status: 500 })
    }

    // ── 8. Facebook Campaign → Ad Set → Ad ───────────────────
    // ใช้ USER TOKEN สำหรับ Marketing API (ไม่ใช่ page token)
    let fbCampaignId: string
    try {
      const r = await fetch(`${FB}/${adAccountId}/campaigns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: campaignName,
          objective: 'OUTCOME_ENGAGEMENT',
          status: 'PAUSED',
          buying_type: 'AUCTION',
          special_ad_categories: [],
          access_token: userToken,
        }),
      })
      const d = await r.json()
      if (d.error) return NextResponse.json({ error: `สร้าง Campaign ไม่ได้: ${d.error.message} (code:${d.error.code}, sub:${d.error.error_subcode || 'none'})` }, { status: 400 })
      fbCampaignId = d.id
    } catch (e: any) {
      return NextResponse.json({ error: `สร้าง Campaign ไม่ได้: ${e.message}` }, { status: 500 })
    }

    let fbAdSetId: string
    try {
      const dailyBudgetSatang = Math.round(Number(dailyBudget) * 100)
      const r = await fetch(`${FB}/${adAccountId}/adsets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${campaignName} - Ad Set`,
          campaign_id: fbCampaignId,
          daily_budget: dailyBudgetSatang,
          start_time: startDate || new Date().toISOString(),
          end_time: endDate,
          billing_event: 'IMPRESSIONS',
          optimization_goal: 'ENGAGED_USERS',
          targeting: {
            age_min: 18,
            age_max: 65,
            geo_locations: { countries: ['TH'] },
          },
          promoted_object: { page_id: pageId },
          access_token: userToken,  // ← user token
          status: 'ACTIVE',
        }),
      })
      const d = await r.json()
      if (d.error) return NextResponse.json({ error: `สร้าง Ad Set ไม่ได้: ${d.error.message}` }, { status: 400 })
      fbAdSetId = d.id
    } catch (e: any) {
      return NextResponse.json({ error: `สร้าง Ad Set ไม่ได้: ${e.message}` }, { status: 500 })
    }

    let fbAdId: string
    try {
      // Creative ใช้ page token (เพราะ object_story_id ต้องการ page context)
      const creativeRes = await fetch(`${FB}/${adAccountId}/adcreatives`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `Creative - ${campaignName}`,
          object_story_id: postId,
          access_token: pageToken,  // ← page token สำหรับ creative
        }),
      })
      const creativeData = await creativeRes.json()
      if (creativeData.error) {
        return NextResponse.json({ error: `สร้าง Creative ไม่ได้: ${creativeData.error.message}` }, { status: 400 })
      }

      // Ad ใช้ user token
      const adRes = await fetch(`${FB}/${adAccountId}/ads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${campaignName} - Ad`,
          adset_id: fbAdSetId,
          creative: { creative_id: creativeData.id },
          status: 'ACTIVE',
          access_token: userToken,  // ← user token
        }),
      })
      const adData = await adRes.json()
      if (adData.error) return NextResponse.json({ error: `สร้าง Ad ไม่ได้: ${adData.error.message}` }, { status: 400 })
      fbAdId = adData.id
    } catch (e: any) {
      return NextResponse.json({ error: `สร้าง Ad ไม่ได้: ${e.message}` }, { status: 500 })
    }

    // ── 9. Save to Supabase ───────────────────────────────────
    const { data: campaign, error: campaignError } = await supabase
      .from('ad_campaigns')
      .insert({
        user_id: user.id,
        page_id: connectedPage.id,
        fb_campaign_id: fbCampaignId,
        fb_adset_id: fbAdSetId,
        fb_ad_id: fbAdId,
        fb_post_id: postId,
        campaign_name: campaignName,
        post_message: postMessage,
        daily_budget: dailyBudget,
        start_time: startDate || new Date().toISOString(),
        end_time: endDate,
        status: 'active',
      })
      .select()
      .single()

    if (campaignError) {
      console.error('[create] insert campaign error:', campaignError)
      // Campaign ถูกสร้างใน FB แล้ว แต่ save ใน DB ไม่ได้ — ยังถือว่าสำเร็จ
      return NextResponse.json({
        success: true,
        warning: `สร้างแอดใน Facebook สำเร็จแต่บันทึก DB ไม่ได้: ${campaignError.message}`,
        fbCampaignId,
      })
    }

    return NextResponse.json({ success: true, campaignId: campaign.id, fbCampaignId })

  } catch (err: any) {
    console.error('[create] unexpected error:', err)
    return NextResponse.json({ error: err.message || 'เกิดข้อผิดพลาดที่ไม่คาดคิด' }, { status: 500 })
  }
}
