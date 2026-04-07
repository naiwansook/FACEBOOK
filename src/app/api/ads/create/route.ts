import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { updateAllStatus, validateInterests } from '@/lib/facebook'
import { generateAutoTargeting } from '@/lib/ai-analyzer'

export const dynamic = 'force-dynamic'

const FB = 'https://graph.facebook.com/v19.0'

// ── Goal labels for UI display ──────────────────────────────
const GOAL_LABELS: Record<string, string> = {
  auto_engagement: 'อัตโนมัติ - เพิ่มการมีส่วนร่วม',
  messages: 'เพิ่มจำนวนข้อความ',
  sales_messages: 'เพิ่มยอดขายผ่านข้อความ',
  leads_messages: 'เก็บข้อมูลลูกค้าผ่านข้อความ',
  traffic: 'เพิ่มผู้เยี่ยมชมเว็บไซต์',
  calls: 'เพิ่มการมีส่วนร่วม (โทร)',
  reach: 'เข้าถึงคนมากสุด',
}

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
    const {
      postId, pageId, pageToken, pageName, pageCategory, postMessage, postImage,
      campaignName, dailyBudget, startDate, endDate, goal,
    } = body

    if (!postId || !pageId || !pageToken || !campaignName || !dailyBudget) {
      return NextResponse.json({ error: 'ข้อมูลไม่ครบถ้วน' }, { status: 400 })
    }

    // AI เลือก targeting + objective อัตโนมัติ
    const aiTargeting = await generateAutoTargeting({
      postMessage: postMessage || '',
      postImage: !!postImage,
      pageCategory: pageCategory || '',
      pageName: pageName || '',
    })

    // Use user-selected goal label
    const goalKey = goal && GOAL_LABELS[goal] ? goal : 'auto_engagement'

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

    // ── 6. Get Ad Account ─────────────────────────────────────
    let adAccountId: string | null = null
    let adAccountError = ''

    try {
      const r = await fetch(`${FB}/me/adaccounts?fields=id,name,account_status&limit=10&access_token=${userToken}`)
      const d = await r.json()
      if (!d.error && d.data?.length > 0) {
        const active = d.data.find((a: any) => a.account_status === 1) || d.data[0]
        adAccountId = active.id
      } else if (d.error) {
        adAccountError = d.error.message
      }
    } catch (e: any) {
      adAccountError = e.message
    }

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
        error: `ไม่พบ Ad Account — ${adAccountError || 'กรุณาตรวจสอบสิทธิ์ ads_management'}`,
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

    // ── 8. Build Targeting (AI-driven) ─────────────────────────
    const targeting: any = {
      age_min: aiTargeting.targeting.ageMin,
      age_max: aiTargeting.targeting.ageMax,
      geo_locations: { countries: ['TH'] },
      targeting_automation: { advantage_audience: 0 },
    }

    if (aiTargeting.targeting.genders.length > 0) {
      targeting.genders = aiTargeting.targeting.genders
    }

    if (aiTargeting.targeting.interests && aiTargeting.targeting.interests.length > 0) {
      // Validate interest IDs with Facebook API before using
      const validInterests = await validateInterests(
        userToken,
        aiTargeting.targeting.interests.map((i: any) => ({ id: i.id, name: i.name }))
      )
      if (validInterests.length > 0) {
        targeting.flexible_spec = [{
          interests: validInterests,
        }]
      }
    }

    // ── 9. Create Campaign ────────────────────────────────────
    let fbCampaignId: string
    try {
      const r = await fetch(`${FB}/${adAccountId}/campaigns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: campaignName,
          objective: 'OUTCOME_ENGAGEMENT',
          status: 'ACTIVE',
          buying_type: 'AUCTION',
          special_ad_categories: [],
          is_adset_budget_sharing_enabled: false,
          access_token: userToken,
        }),
      })
      const d = await r.json()
      if (d.error) return NextResponse.json({ error: `สร้าง Campaign ไม่ได้: ${d.error.error_user_msg || d.error.message}` }, { status: 400 })
      fbCampaignId = d.id
    } catch (e: any) {
      return NextResponse.json({ error: `สร้าง Campaign ไม่ได้: ${e.message}` }, { status: 500 })
    }

    // ── 10. Create Ad Set ─────────────────────────────────────
    let fbAdSetId: string
    try {
      const dailyBudgetSatang = Math.round(Number(dailyBudget) * 100)
      const adsetBody: any = {
        name: `${campaignName} - Ad Set`,
        campaign_id: fbCampaignId,
        daily_budget: dailyBudgetSatang,
        bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
        start_time: startDate || new Date().toISOString(),
        end_time: endDate,
        billing_event: 'IMPRESSIONS',
        targeting,
        promoted_object: { page_id: pageId },
        access_token: userToken,
        status: 'ACTIVE',
      }

      const r = await fetch(`${FB}/${adAccountId}/adsets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(adsetBody),
      })
      const d = await r.json()
      if (d.error) return NextResponse.json({ error: `สร้าง Ad Set ไม่ได้: ${d.error.error_user_msg || d.error.message} [${JSON.stringify(d.error)}]` }, { status: 400 })
      fbAdSetId = d.id
    } catch (e: any) {
      return NextResponse.json({ error: `สร้าง Ad Set ไม่ได้: ${e.message}` }, { status: 500 })
    }

    // ── 11. Create Creative + Ad ──────────────────────────────
    let fbAdId: string
    try {
      const creativeRes = await fetch(`${FB}/${adAccountId}/adcreatives`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `Creative - ${campaignName}`,
          object_story_id: postId,
          access_token: pageToken,
        }),
      })
      const creativeData = await creativeRes.json()
      if (creativeData.error) {
        return NextResponse.json({ error: `สร้าง Creative ไม่ได้: ${creativeData.error.error_user_msg || creativeData.error.message}` }, { status: 400 })
      }

      const adRes = await fetch(`${FB}/${adAccountId}/ads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${campaignName} - Ad`,
          adset_id: fbAdSetId,
          creative: { creative_id: creativeData.id },
          status: 'ACTIVE',
          access_token: userToken,
        }),
      })
      const adData = await adRes.json()
      if (adData.error) return NextResponse.json({ error: `สร้าง Ad ไม่ได้: ${adData.error.error_user_msg || adData.error.message}` }, { status: 400 })
      fbAdId = adData.id
    } catch (e: any) {
      return NextResponse.json({ error: `สร้าง Ad ไม่ได้: ${e.message}` }, { status: 500 })
    }

    // ── 12. Force-activate ทั้ง 3 ระดับ ───────────────────────
    try {
      await new Promise(r => setTimeout(r, 2000))
      const activateResult = await updateAllStatus(userToken, fbCampaignId, fbAdSetId, fbAdId, 'ACTIVE')
      if (activateResult.errors.length > 0) {
        console.warn('[create] force-activate partial errors:', activateResult.errors)
      }
    } catch (e: any) {
      console.warn('[create] force-activate warning:', e.message)
    }

    // ── 13. Save to Supabase ──────────────────────────────────
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
        post_image: postImage || null,
        daily_budget: dailyBudget,
        start_time: startDate || new Date().toISOString(),
        end_time: endDate,
        status: 'active',
        goal: goalKey,
      })
      .select()
      .single()

    if (campaignError) {
      console.error('[create] insert campaign error:', campaignError)
      return NextResponse.json({
        success: true,
        warning: `สร้างแอดใน Facebook สำเร็จแต่บันทึก DB ไม่ได้: ${campaignError.message}`,
        fbCampaignId,
      })
    }

    return NextResponse.json({
      success: true, campaignId: campaign.id, fbCampaignId,
      aiTargeting: {
        reasoning: aiTargeting.reasoning,
        objective: aiTargeting.objective,
        targeting: aiTargeting.targeting,
      },
    })

  } catch (err: any) {
    console.error('[create] unexpected error:', err)
    return NextResponse.json({ error: err.message || 'เกิดข้อผิดพลาดที่ไม่คาดคิด' }, { status: 500 })
  }
}
