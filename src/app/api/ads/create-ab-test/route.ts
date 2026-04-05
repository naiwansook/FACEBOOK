import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { createCampaign, createAdSet, createAd, getAdAccount, resolveInterests } from '@/lib/facebook'
import { generateTestVariants, type PostContext } from '@/lib/ai-analyzer'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.accessToken) {
      return NextResponse.json({ error: 'กรุณา Login ก่อน' }, { status: 401 })
    }

    const body = await req.json()
    const { postId, pageId, pageToken, pageName, pageCategory, postMessage, postImage, dailyBudget, days, existingReactions, existingComments, existingShares } = body

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

    // Get ad account (try user token first, then page token — same as create/route.ts)
    const FB = 'https://graph.facebook.com/v19.0'
    let adAccountId: string | null = null

    // Method 1: User's ad accounts
    try {
      const r = await fetch(`${FB}/me/adaccounts?fields=id,name,account_status&limit=10&access_token=${session.accessToken}`)
      const d = await r.json()
      if (!d.error && d.data?.length > 0) {
        const active = d.data.find((a: any) => a.account_status === 1) || d.data[0]
        adAccountId = active.id
      }
    } catch { /* continue */ }

    // Method 2: Page's ad accounts (fallback)
    if (!adAccountId) {
      try {
        const r = await fetch(`${FB}/${pageId}/adaccounts?fields=id,account_status&access_token=${pageToken}`)
        const d = await r.json()
        if (!d.error && d.data?.length > 0) {
          const active = d.data.find((a: any) => a.account_status === 1) || d.data[0]
          adAccountId = active.id
        }
      } catch { /* continue */ }
    }

    if (!adAccountId) {
      return NextResponse.json({
        error: 'ไม่พบ Ad Account — กรุณาตรวจสอบสิทธิ์ ads_management',
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
    const variantErrors: string[] = []

    for (const variant of testPlan.variants) {
      try {
        const variantBudget = Math.round(finalDailyBudget * variant.budgetPercent / 100)
        if (variantBudget < 20) continue // Facebook minimum

        const campaignName = `[AB Test] ${variant.label} — ${(postMessage || postId).slice(0, 30)}`

        const userToken = session.accessToken as string
        let fbCampaignId = ''

        // Create Facebook Campaign (use userToken like create/route.ts)
        fbCampaignId = await createCampaign(adAccountId, userToken, campaignName)

        // Validate AI interests against Facebook API (get real IDs)
        const validInterests = variant.targeting.interests?.length
          ? await resolveInterests(variant.targeting.interests, userToken)
          : []

        let fbAdSetId: string
        try {
        // Create Ad Set with variant-specific targeting (use userToken)
        fbAdSetId = await createAdSet(adAccountId, userToken, fbCampaignId, {
          name: `${variant.label} - Ad Set`,
          dailyBudget: variantBudget,
          startTime: startDate,
          endTime: endDateStr,
          targeting: {
            ageMin: variant.targeting.ageMin,
            ageMax: variant.targeting.ageMax,
            genders: variant.targeting.genders,
            geoLocations: variant.targeting.geoLocations || { countries: ['TH'] },
            interests: validInterests,
          },
          pageId,
        })
        } catch (adsetErr: any) {
          // Rollback: delete orphaned campaign from Facebook
          try { await fetch(`${FB}/${fbCampaignId}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ access_token: session.accessToken }) }) } catch {}
          throw adsetErr
        }

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
        variantErrors.push(`${variant.label}: ${variantErr.message}`)
        // Continue with other variants
      }
    }

    if (createdVariants.length === 0) {
      // Clean up test group if no variants created
      await supabase.from('ab_test_groups').delete().eq('id', testGroup.id)
      return NextResponse.json({
        error: `ไม่สามารถสร้าง variant ได้เลย: ${variantErrors.join(' | ')}`,
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
