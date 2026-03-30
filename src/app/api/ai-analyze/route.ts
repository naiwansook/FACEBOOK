import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { getCampaignInsights } from '@/lib/facebook'
import { analyzeAdPerformance } from '@/lib/ai-analyzer'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.accessToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { campaignId } = await req.json()
    if (!campaignId) {
      return NextResponse.json({ error: 'campaignId is required' }, { status: 400 })
    }

    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Get Facebook user ID and verify ownership
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

    // Get campaign + page token
    const { data: campaign } = await supabase
      .from('ad_campaigns')
      .select(`*, connected_pages!page_id (page_access_token)`)
      .eq('id', campaignId)
      .eq('user_id', user.id)
      .single()

    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

    const pageToken = (campaign as any).connected_pages?.page_access_token

    // Try to get latest performance snapshot from DB first
    let insights: any = null
    const { data: latestPerf } = await supabase
      .from('ad_performance')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('fetched_at', { ascending: false })
      .limit(1)
      .single()

    if (latestPerf) {
      // Use existing performance data
      insights = latestPerf
    } else if (campaign.fb_campaign_id && pageToken) {
      // Fetch fresh from Facebook
      const fbInsights = await getCampaignInsights(campaign.fb_campaign_id, pageToken)
      if (fbInsights) {
        const actions = fbInsights.actions || []
        const getAction = (type: string) =>
          parseInt(actions.find((a: any) => a.action_type === type)?.value || '0')

        insights = {
          impressions: parseInt(fbInsights.impressions || '0'),
          reach: parseInt(fbInsights.reach || '0'),
          clicks: parseInt(fbInsights.clicks || '0'),
          spend: parseFloat(fbInsights.spend || '0'),
          cpm: parseFloat(fbInsights.cpm || '0'),
          cpc: parseFloat(fbInsights.cpc || '0'),
          ctr: parseFloat(fbInsights.ctr || '0'),
          frequency: parseFloat(fbInsights.frequency || '0'),
          likes: getAction('like') + getAction('post_reaction'),
          comments: getAction('comment'),
          shares: getAction('share'),
          post_engagement: getAction('post_engagement'),
        }

        // Save this new snapshot
        await supabase.from('ad_performance').insert({
          campaign_id: campaignId,
          ...insights,
          reactions: insights.likes,
          unique_clicks: parseInt(fbInsights.unique_clicks || '0'),
        })
      }
    }

    // Build AdMetrics for AI
    const now = new Date()
    const startTime = campaign.start_time ? new Date(campaign.start_time) : now
    const endTime = campaign.end_time ? new Date(campaign.end_time) : now
    const daysRunning = Math.max(1, Math.ceil((now.getTime() - startTime.getTime()) / 86400000))
    const daysLeft = Math.max(0, Math.ceil((endTime.getTime() - now.getTime()) / 86400000))
    const totalDays = Math.max(1, Math.ceil((endTime.getTime() - startTime.getTime()) / 86400000))
    const totalBudget = (campaign.daily_budget || 0) * totalDays
    const spend = insights?.spend || 0
    const budgetRemaining = Math.max(0, totalBudget - spend)

    const aiResult = await analyzeAdPerformance({
      campaignName: campaign.campaign_name,
      spend,
      budget: totalBudget,
      budgetRemaining,
      daysRunning,
      daysLeft,
      impressions: insights?.impressions || 0,
      reach: insights?.reach || 0,
      clicks: insights?.clicks || 0,
      ctr: insights?.ctr || 0,
      cpm: insights?.cpm || 0,
      cpc: insights?.cpc || 0,
      frequency: insights?.frequency || 0,
      engagement: insights?.post_engagement || 0,
      likes: insights?.likes || 0,
      comments: insights?.comments || 0,
      shares: insights?.shares || 0,
    })

    // Save AI analysis
    const { data: savedAnalysis } = await supabase
      .from('ai_analyses')
      .insert({
        campaign_id: campaignId,
        recommendation: aiResult.recommendation,
        confidence_score: aiResult.confidence,
        summary: aiResult.summary,
        reasoning: aiResult.reasoning,
        action_items: aiResult.actionItems,
        performance_snapshot: insights,
      })
      .select()
      .single()

    // Create notification
    await supabase.from('notifications').insert({
      user_id: user.id,
      campaign_id: campaignId,
      type: 'ai_alert',
      title: `AI วิเคราะห์: ${campaign.campaign_name}`,
      message: aiResult.summary,
    })

    return NextResponse.json({ analysis: savedAnalysis || aiResult })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
