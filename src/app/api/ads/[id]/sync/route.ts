import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { getCampaignInsights, getRealStatus, updateAllStatus, parseInsightActions } from '@/lib/facebook'

function mapFbToDb(fb: string): string {
  switch (fb) {
    case 'ACTIVE': return 'active'
    case 'PAUSED': return 'paused'
    case 'DISAPPROVED': return 'disapproved'
    case 'PENDING_REVIEW': return 'pending_review'
    case 'WITH_ISSUES': return 'with_issues'
    case 'ARCHIVED': return 'archived'
    case 'DELETED': return 'deleted'
    default: return 'active'
  }
}

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

      const isExpired = campaign.end_time && new Date(campaign.end_time).getTime() <= Date.now()
      const targetStatus = isExpired ? 'completed' : mapFbToDb(fbStatus.overall)

      if (targetStatus !== campaign.status || fbStatus.overall !== campaign.fb_effective_status) {
        await supabase.from('ad_campaigns').update({
          status: targetStatus,
          fb_effective_status: fbStatus.overall,
          fb_status_synced_at: new Date().toISOString(),
        }).eq('id', params.id)
      }
    } catch (e: any) {
      console.error(`[sync] status fetch failed for ${params.id}:`, e?.message)
    }

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

    // Parse engagement actions using shared helper
    const parsed = parseInsightActions(insights)
    const { likes, comments, shares, messages, linkClicks, calls, postEngagement, pageEngagement } = parsed
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
        page_engagement: pageEngagement,
        messages,
        link_clicks: linkClicks,
        calls,
        budget_remaining: budgetRemaining,
      })
      .select()
      .single()

    return NextResponse.json({ success: true, performance: perfSnap, fbStatus })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
