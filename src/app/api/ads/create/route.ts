import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { createCampaign, createAdSet, createAd, getAdAccount } from '@/lib/facebook'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.accessToken) {
      return NextResponse.json({ error: 'กรุณา Login ก่อน' }, { status: 401 })
    }

    const body = await req.json()
    const { postId, pageId, pageToken, pageName, postMessage, campaignName, dailyBudget, startDate, endDate } = body

    if (!postId || !pageId || !pageToken || !campaignName || !dailyBudget) {
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

    // Get ad account for this page
    let adAccountId: string | null = null
    try {
      const adAccount = await getAdAccount(pageId, pageToken)
      adAccountId = adAccount?.id || null
    } catch {
      // continue without ad account
    }

    if (!adAccountId) {
      return NextResponse.json({
        error: 'ไม่พบ Ad Account สำหรับ Page นี้ กรุณาตรวจสอบว่า Page เชื่อมต่อกับ Ad Account แล้ว',
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

    // Create Facebook Campaign → Ad Set → Ad
    const fbCampaignId = await createCampaign(adAccountId, pageToken, campaignName)

    const fbAdSetId = await createAdSet(adAccountId, pageToken, fbCampaignId, {
      name: `${campaignName} - Ad Set`,
      dailyBudget,
      startTime: startDate || new Date().toISOString(),
      endTime: endDate,
      targeting: {
        ageMin: 18,
        ageMax: 65,
        genders: [],
        geoLocations: { countries: ['TH'] },
      },
      pageId,
    })

    // postId from published_posts is already in {pageId}_{shortId} format
    // pass it directly as object_story_id
    const fbAdId = await createAd(adAccountId, pageToken, fbAdSetId, {
      name: `${campaignName} - Ad`,
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
        daily_budget: dailyBudget,
        start_time: startDate || new Date().toISOString(),
        end_time: endDate,
        status: 'active',
      })
      .select()
      .single()

    if (campaignError) throw new Error(campaignError.message)

    return NextResponse.json({ success: true, campaignId: campaign.id, fbCampaignId })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
