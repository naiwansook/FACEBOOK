import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { getCampaignInsights, getRealStatus, updateAllStatus } from '@/lib/facebook'

export const dynamic = 'force-dynamic'

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.accessToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const userToken = session.accessToken as string

    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Get Facebook user ID
    const meRes = await fetch(
      `https://graph.facebook.com/v19.0/me?fields=id&access_token=${userToken}`
    )
    const meData = await meRes.json()
    if (meData.error) throw new Error(meData.error.message)

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('facebook_id', meData.id)
      .single()

    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    // Get campaign (verify ownership)
    const { data: campaign } = await supabase
      .from('ad_campaigns')
      .select('*')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single()

    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    if (!campaign.fb_campaign_id) return NextResponse.json({ error: 'No Facebook campaign ID' }, { status: 400 })

    // 1. Check real Facebook status using USER TOKEN
    let fbStatus = null
    try {
      fbStatus = await getRealStatus(userToken, campaign.fb_campaign_id, campaign.fb_adset_id, campaign.fb_ad_id)

      // Sync DB status with Facebook reality
      if (fbStatus.overall === 'ACTIVE' && campaign.status !== 'active') {
        await supabase.from('ad_campaigns').update({ status: 'active' }).eq('id', params.id)
      } else if (['PAUSED', 'CAMPAIGN_PAUSED', 'ADSET_PAUSED'].includes(fbStatus.overall) && campaign.status !== 'paused') {
        await supabase.from('ad_campaigns').update({ status: 'paused' }).eq('id', params.id)
      }
    } catch {}

    // 2. Try to fetch insights using USER TOKEN (Marketing API needs user token)
    let insights = null
    try {
      insights = await getCampaignInsights(campaign.fb_campaign_id, userToken)
    } catch {}

    if (!insights) {
      return NextResponse.json({
        success: true,
        warning: 'No insights available yet (campaign may be too new or paused)',
        fbStatus,
      })
    }

    // Parse engagement actions
    const actions = insights.actions || []
    const getAction = (type: string) =>
      parseInt(actions.find((a: any) => a.action_type === type)?.value || '0')

    const likes = getAction('like') + getAction('post_reaction')
    const comments = getAction('comment')
    const shares = getAction('share')
    const postEngagement = getAction('post_engagement')

    const spend = parseFloat(insights.spend || '0')
    const startTime = campaign.start_time ? new Date(campaign.start_time) : new Date()
    const endTime = campaign.end_time ? new Date(campaign.end_time) : new Date()
    const totalDays = Math.max(1, Math.ceil((endTime.getTime() - startTime.getTime()) / 86400000))
    const totalBudget = (campaign.daily_budget || 0) * totalDays
    const budgetRemaining = Math.max(0, totalBudget - spend)

    // Insert new performance snapshot
    const { data: perfSnap } = await supabase
      .from('ad_performance')
      .insert({
        campaign_id: params.id,
        impressions: parseInt(insights.impressions || '0'),
        reach: parseInt(insights.reach || '0'),
        clicks: parseInt(insights.clicks || '0'),
        spend,
        cpm: parseFloat(insights.cpm || '0'),
        cpc: parseFloat(insights.cpc || '0'),
        ctr: parseFloat(insights.ctr || '0'),
        frequency: parseFloat(insights.frequency || '0'),
        likes,
        comments,
        shares,
        reactions: likes,
        unique_clicks: parseInt(insights.unique_clicks || '0'),
        post_engagement: postEngagement,
        budget_remaining: budgetRemaining,
      })
      .select()
      .single()

    return NextResponse.json({ success: true, performance: perfSnap, fbStatus })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
