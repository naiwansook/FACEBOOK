import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { getCampaignInsights } from '@/lib/facebook'

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

    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Get Facebook user ID
    const meRes = await fetch(
      `https://graph.facebook.com/v19.0/me?fields=id&access_token=${session.accessToken}`
    )
    const meData = await meRes.json()
    if (meData.error) throw new Error(meData.error.message)

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('facebook_id', meData.id)
      .single()

    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    // Get campaign + page token (verify ownership)
    const { data: campaign } = await supabase
      .from('ad_campaigns')
      .select(`*, connected_pages!page_id (page_access_token)`)
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single()

    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    if (!campaign.fb_campaign_id) return NextResponse.json({ error: 'No Facebook campaign ID' }, { status: 400 })

    const pageToken = (campaign as any).connected_pages?.page_access_token
    if (!pageToken) return NextResponse.json({ error: 'No page token found' }, { status: 400 })

    // Fetch fresh insights from Facebook
    const insights = await getCampaignInsights(campaign.fb_campaign_id, pageToken)
    if (!insights) {
      return NextResponse.json({ error: 'No insights available yet (campaign may be too new)' }, { status: 404 })
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

    return NextResponse.json({ success: true, performance: perfSnap })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
