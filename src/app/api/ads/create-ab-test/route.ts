import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { updateAllStatus, resolveInterests } from '@/lib/facebook'
import { generateTestVariants, type PostContext } from '@/lib/ai-analyzer'

export const dynamic = 'force-dynamic'

const FB = 'https://graph.facebook.com/v19.0'

// ── Full campaign configs to try in order (objective + adset must match) ───
const CAMPAIGN_CONFIGS = [
  { objective: 'OUTCOME_ENGAGEMENT', optimization_goal: 'POST_ENGAGEMENT', billing_event: 'IMPRESSIONS', destination_type: 'ON_POST' },
  { objective: 'OUTCOME_AWARENESS',  optimization_goal: 'REACH',            billing_event: 'IMPRESSIONS' },
  { objective: 'OUTCOME_ENGAGEMENT', optimization_goal: 'ENGAGED_USERS',    billing_event: 'IMPRESSIONS' },
  { objective: 'OUTCOME_TRAFFIC',    optimization_goal: 'LINK_CLICKS',      billing_event: 'IMPRESSIONS' },
]

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.accessToken) {
      return NextResponse.json({ error: 'กรุณา Login ก่อน' }, { status: 401 })
    }
    const userToken = session.accessToken as string

    const body = await req.json()
    const { postId, pageId, pageToken, pageName, pageCategory, postMessage, postImage, dailyBudget, days, existingReactions, existingComments, existingShares, goal } = body

    if (!postId || !pageId || !pageToken) {
      return NextResponse.json({ error: 'ข้อมูลไม่ครบถ้วน' }, { status: 400 })
    }

    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Get Facebook user ID
    const meRes = await fetch(`${FB}/me?fields=id,name,email&access_token=${userToken}`)
    const meData = await meRes.json()
    if (meData.error) throw new Error(meData.error.message)

    // Upsert user
    const { data: user, error: userError } = await supabase
      .from('users')
      .upsert({
        facebook_id: meData.id,
        name: meData.name || session.user?.name,
        email: meData.email || session.user?.email,
        image: session.user?.image,
        access_token: userToken,
      }, { onConflict: 'facebook_id' })
      .select('id')
      .single()
    if (userError) throw new Error(userError.message)

    // ── Get Ad Account (same logic as create/route.ts) ─────────
    let adAccountId: string | null = null
    try {
      const r = await fetch(`${FB}/me/adaccounts?fields=id,name,account_status&limit=10&access_token=${userToken}`)
      const d = await r.json()
      if (!d.error && d.data?.length > 0) {
        const active = d.data.find((a: any) => a.account_status === 1) || d.data[0]
        adAccountId = active.id
      }
    } catch { /* ignore */ }

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
      return NextResponse.json({ error: 'ไม่พบ Ad Account สำหรับ Page นี้' }, { status: 400 })
    }

    // Upsert connected page
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
    if (pageError) throw new Error(pageError.message)

    // Step 1: AI วิเคราะห์โพสต์ + สร้าง Variants
    const postContext: PostContext = {
      postMessage: postMessage || '',
      postImage: postImage,
      pageCategory: pageCategory,
      pageName: pageName || '',
      existingReactions: existingReactions || 0,
      existingComments: existingComments || 0,
      existingShares: existingShares || 0,
    }

    const testPlan = await generateTestVariants(postContext)

    // Use user-specified budget/days or AI recommendation
    const finalDailyBudget = dailyBudget || testPlan.recommendedBudget
    const finalDays = days || testPlan.recommendedDays

    // Step 2: Create AB Test Group
    const { data: testGroup, error: testGroupError } = await supabase
      .from('ab_test_groups')
      .insert({
        user_id: user.id,
        page_id: connectedPage.id,
        fb_post_id: postId,
        post_message: postMessage,
        post_image: postImage,
        ai_post_analysis: {
          analysis: testPlan.postAnalysis,
          recommendedBudget: testPlan.recommendedBudget,
          recommendedDays: testPlan.recommendedDays,
        },
        total_daily_budget: finalDailyBudget,
        duration_days: finalDays,
        status: 'running',
      })
      .select('id')
      .single()
    if (testGroupError) throw new Error(testGroupError.message)

    // Step 3: Create Facebook campaigns for each variant
    // Uses same proven working config as create/route.ts:
    // - AI-selected objective mapped to GOAL_CONFIG
    // - advantage_audience: 0
    // - Creative with pageToken, Ad with userToken
    const startDate = new Date().toISOString()
    const endDate = new Date()
    endDate.setDate(endDate.getDate() + finalDays)
    const endDateStr = endDate.toISOString()

    const createdVariants = []
    const variantErrors: string[] = []

    for (const variant of testPlan.variants) {
      try {
        const variantBudget = Math.round(finalDailyBudget * variant.budgetPercent / 100)
        if (variantBudget < 20) continue // Facebook minimum

        const campaignName = `[AB Test] ${variant.label} — ${(postMessage || postId).slice(0, 30)}`

        // ── Build Targeting (validate interests via search API) ──
        let validInterests: { id: string; name: string }[] = []
        if (variant.targeting.interests && variant.targeting.interests.length > 0) {
          validInterests = await resolveInterests(variant.targeting.interests, userToken)
        }

        const ageMin = validInterests.length > 0
          ? Math.max(20, variant.targeting.ageMin)
          : Math.max(18, variant.targeting.ageMin)

        const targeting: any = {
          age_min: ageMin,
          age_max: Math.min(65, variant.targeting.ageMax),
          geo_locations: { countries: ['TH'] },
          targeting_automation: { advantage_audience: 0 },
        }

        if (variant.targeting.genders.length > 0) {
          targeting.genders = variant.targeting.genders
        }

        if (validInterests.length > 0) {
          targeting.flexible_spec = [{ interests: validInterests }]
        }

        // ── Try full campaign+adset configs until one works ──────
        const dailyBudgetSatang = Math.round(variantBudget * 100)
        let fbCampaignId = ''
        let fbAdSetId = ''
        let lastError = ''

        for (const cfg of CAMPAIGN_CONFIGS) {
          // Create Campaign with this objective
          const campRes = await fetch(`${FB}/${adAccountId}/campaigns`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: campaignName,
              objective: cfg.objective,
              status: 'ACTIVE',
              buying_type: 'AUCTION',
              special_ad_categories: [],
              is_adset_budget_sharing_enabled: false,
              access_token: userToken,
            }),
          })
          const campData = await campRes.json()
          if (campData.error) {
            lastError = `Campaign(${cfg.objective}): ${campData.error.error_user_msg || campData.error.message}`
            continue
          }
          const thisCampaignId = campData.id

          // Create Ad Set with matching optimization goal
          const adsetBody: any = {
            name: `${variant.label} - Ad Set`,
            campaign_id: thisCampaignId,
            daily_budget: dailyBudgetSatang,
            bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
            start_time: startDate,
            end_time: endDateStr,
            billing_event: cfg.billing_event,
            optimization_goal: cfg.optimization_goal,
            targeting,
            promoted_object: { page_id: pageId },
            access_token: userToken,
            status: 'ACTIVE',
          }
          if (cfg.destination_type) adsetBody.destination_type = cfg.destination_type

          const adsetRes = await fetch(`${FB}/${adAccountId}/adsets`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(adsetBody),
          })
          const adsetData = await adsetRes.json()
          if (!adsetData.error) {
            fbCampaignId = thisCampaignId
            fbAdSetId = adsetData.id
            break
          }
          // AdSet failed — delete the orphan campaign
          lastError = `AdSet(${cfg.optimization_goal}): ${adsetData.error.error_user_msg || adsetData.error.message}`
          await fetch(`${FB}/${thisCampaignId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ access_token: userToken }),
          }).catch(() => {})
        }
        if (!fbCampaignId || !fbAdSetId) throw new Error(lastError)

        // ── Create Ad (try multiple creative strategies) ──────
        // Ensure postId is in pageId_postSuffix format
        const storyId = postId.includes('_') ? postId : `${pageId}_${postId}`
        let fbAdId: string = ''
        let adError: string = ''

        // Strategy 1: source_story_id creative (designed for promoting existing posts)
        const creative1Res = await fetch(`${FB}/${adAccountId}/adcreatives`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: `Creative - ${variant.label}`,
            source_story_id: storyId,
            access_token: pageToken,
          }),
        })
        const creative1Data = await creative1Res.json()
        if (!creative1Data.error) {
          const adRes = await fetch(`${FB}/${adAccountId}/ads`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: `${variant.label} - Ad`,
              adset_id: fbAdSetId,
              creative: { creative_id: creative1Data.id },
              status: 'ACTIVE',
              access_token: userToken,
            }),
          })
          const adData = await adRes.json()
          if (!adData.error) fbAdId = adData.id
          else adError = `source_story+userToken: ${adData.error.error_user_msg || adData.error.message}`
        } else {
          adError = `source_story_creative: ${creative1Data.error.error_user_msg || creative1Data.error.message}`
        }

        // Strategy 2: inline object_story_id with userToken
        if (!fbAdId) {
          const adRes = await fetch(`${FB}/${adAccountId}/ads`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: `${variant.label} - Ad`,
              adset_id: fbAdSetId,
              creative: { object_story_id: storyId },
              status: 'ACTIVE',
              access_token: userToken,
            }),
          })
          const adData = await adRes.json()
          if (!adData.error) fbAdId = adData.id
          else adError = `object_story+userToken: ${adData.error.error_user_msg || adData.error.message}`
        }

        // Strategy 3: inline object_story_id with pageToken
        if (!fbAdId) {
          const adRes = await fetch(`${FB}/${adAccountId}/ads`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: `${variant.label} - Ad`,
              adset_id: fbAdSetId,
              creative: { object_story_id: storyId },
              status: 'ACTIVE',
              access_token: pageToken,
            }),
          })
          const adData = await adRes.json()
          if (!adData.error) fbAdId = adData.id
          else adError = `object_story+pageToken: ${adData.error.error_user_msg || adData.error.message}`
        }

        if (!fbAdId) throw new Error(`Ad: ${adError}`)

        // ── Force-activate all 3 levels ───────────────────────
        try {
          await new Promise(r => setTimeout(r, 2000))
          await updateAllStatus(userToken, fbCampaignId, fbAdSetId, fbAdId, 'ACTIVE')
        } catch { /* non-critical */ }

        // Save to database
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
            daily_budget: variantBudget,
            start_time: startDate,
            end_time: endDateStr,
            status: 'active',
            goal: goal || 'auto_engagement',
            test_group_id: testGroup.id,
            variant_label: variant.label,
            variant_strategy: {
              strategy: variant.strategy,
              objective: variant.objective,
              targeting: variant.targeting,
              budgetPercent: variant.budgetPercent,
              reasoning: variant.reasoning,
            },
          })
          .select()
          .single()

        if (campaignError) throw new Error(campaignError.message)

        createdVariants.push({
          id: campaign.id,
          label: variant.label,
          strategy: variant.strategy,
          budget: variantBudget,
          fbCampaignId,
        })
      } catch (variantErr: any) {
        const errMsg = `${variant.label}: ${variantErr.message}`
        console.error(`Error creating variant:`, errMsg)
        variantErrors.push(errMsg)
      }
    }

    if (createdVariants.length === 0) {
      // Clean up test group if no variants created
      await supabase.from('ab_test_groups').delete().eq('id', testGroup.id)
      return NextResponse.json({
        error: `สร้าง variant ไม่ได้: ${variantErrors[0] || 'ไม่ทราบสาเหตุ'}`,
        allErrors: variantErrors,
      }, { status: 500 })
    }

    // Create notification
    await supabase.from('notifications').insert({
      user_id: user.id,
      campaign_id: null,
      type: 'ai_alert',
      title: `AI สร้าง A/B Test ${createdVariants.length} แบบ`,
      message: `${testPlan.postAnalysis} — AI สร้าง ${createdVariants.length} variants: ${createdVariants.map(v => v.label).join(', ')}`,
    })

    return NextResponse.json({
      success: true,
      testGroupId: testGroup.id,
      postAnalysis: testPlan.postAnalysis,
      variants: createdVariants,
      totalDailyBudget: finalDailyBudget,
      days: finalDays,
    })
  } catch (err: any) {
    console.error('AB Test creation error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
