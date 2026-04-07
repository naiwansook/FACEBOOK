import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { createCampaign, createAdSet, createAd, getAdAccount } from '@/lib/facebook'
import { generateTestVariants, type PostContext } from '@/lib/ai-analyzer'

export const dynamic = 'force-dynamic'

// ── Goal → Facebook API mapping (safe for post boosting) ─────
const GOAL_CFG: Record<string, { objective: string; optimization_goal: string; billing_event: string; destination_type?: string }> = {
  auto_engagement: { objective: 'OUTCOME_ENGAGEMENT', optimization_goal: 'POST_ENGAGEMENT', billing_event: 'IMPRESSIONS' },
  messages:        { objective: 'OUTCOME_ENGAGEMENT', optimization_goal: 'CONVERSATIONS', billing_event: 'IMPRESSIONS', destination_type: 'MESSENGER' },
  sales_messages:  { objective: 'OUTCOME_ENGAGEMENT', optimization_goal: 'CONVERSATIONS', billing_event: 'IMPRESSIONS', destination_type: 'MESSENGER' },
  leads_messages:  { objective: 'OUTCOME_ENGAGEMENT', optimization_goal: 'CONVERSATIONS', billing_event: 'IMPRESSIONS', destination_type: 'MESSENGER' },
  traffic:         { objective: 'OUTCOME_TRAFFIC', optimization_goal: 'LINK_CLICKS', billing_event: 'IMPRESSIONS' },
  calls:           { objective: 'OUTCOME_ENGAGEMENT', optimization_goal: 'POST_ENGAGEMENT', billing_event: 'IMPRESSIONS' },
  reach:           { objective: 'OUTCOME_AWARENESS', optimization_goal: 'REACH', billing_event: 'IMPRESSIONS' },
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.accessToken) {
      return NextResponse.json({ error: 'กรุณา Login ก่อน' }, { status: 401 })
    }

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
    const meRes = await fetch(
      `https://graph.facebook.com/v19.0/me?fields=id,name,email&access_token=${session.accessToken}`
    )
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
        access_token: session.accessToken,
      }, { onConflict: 'facebook_id' })
      .select('id')
      .single()
    if (userError) throw new Error(userError.message)

    // Get ad account
    let adAccountId: string | null = null
    try {
      const adAccount = await getAdAccount(pageId, pageToken)
      adAccountId = adAccount?.id || null
    } catch {
      // continue
    }

    if (!adAccountId) {
      return NextResponse.json({
        error: 'ไม่พบ Ad Account สำหรับ Page นี้',
      }, { status: 400 })
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
    const startDate = new Date().toISOString()
    const endDate = new Date()
    endDate.setDate(endDate.getDate() + finalDays)
    const endDateStr = endDate.toISOString()

    const createdVariants = []

    for (const variant of testPlan.variants) {
      try {
        const variantBudget = Math.round(finalDailyBudget * variant.budgetPercent / 100)
        if (variantBudget < 20) continue // Facebook minimum

        const campaignName = `[AB Test] ${variant.label} — ${(postMessage || postId).slice(0, 30)}`

        // Use user-selected goal or fallback
        const goalCfg = GOAL_CFG[goal] || GOAL_CFG.auto_engagement

        // Create Facebook Campaign
        const fbCampaignId = await createCampaign(adAccountId, pageToken, campaignName, goalCfg.objective)

        // Create Ad Set with variant-specific targeting + goal config
        const fbAdSetId = await createAdSet(adAccountId, pageToken, fbCampaignId, {
          name: `${variant.label} - Ad Set`,
          dailyBudget: variantBudget,
          startTime: startDate,
          endTime: endDateStr,
          targeting: {
            ageMin: variant.targeting.ageMin,
            ageMax: variant.targeting.ageMax,
            genders: variant.targeting.genders,
            geoLocations: variant.targeting.geoLocations || { countries: ['TH'] },
            interests: variant.targeting.interests,
          },
          pageId,
          optimizationGoal: goalCfg.optimization_goal,
          billingEvent: goalCfg.billing_event,
          destinationType: goalCfg.destination_type,
        })

        // Create Ad
        const fbAdId = await createAd(adAccountId, pageToken, fbAdSetId, {
          name: `${variant.label} - Ad`,
          pageId,
          postId,
        })

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
        console.error(`Error creating variant ${variant.label}:`, variantErr.message)
        // Continue with other variants
      }
    }

    if (createdVariants.length === 0) {
      // Clean up test group if no variants created
      await supabase.from('ab_test_groups').delete().eq('id', testGroup.id)
      return NextResponse.json({
        error: 'ไม่สามารถสร้าง variant ได้เลย กรุณาตรวจสอบ Ad Account และลองใหม่',
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
