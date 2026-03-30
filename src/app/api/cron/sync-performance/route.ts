import { NextResponse } from 'next/server'
import { getCampaignInsights } from '@/lib/facebook'
import { analyzeAdPerformance } from '@/lib/ai-analyzer'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  // Verify cron secret
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Get all active campaigns with their page tokens
  const { data: campaigns, error } = await supabase
    .from('ad_campaigns')
    .select(`
      id, fb_campaign_id, fb_adset_id, campaign_name,
      daily_budget, start_time, end_time, user_id,
      connected_pages!page_id (page_access_token, ad_account_id)
    `)
    .eq('status', 'active')
    .not('fb_campaign_id', 'is', null)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const results = { synced: 0, analyzed: 0, errors: 0 }

  for (const campaign of campaigns || []) {
    try {
      const page = (campaign as any).connected_pages
      const pageToken = page?.page_access_token
      if (!pageToken || !campaign.fb_campaign_id) continue

      // Fetch Facebook Insights
      const insights = await getCampaignInsights(campaign.fb_campaign_id, pageToken)
      if (!insights) continue

      // Parse engagement actions
      const actions = insights.actions || []
      const getAction = (type: string) =>
        parseInt(actions.find((a: any) => a.action_type === type)?.value || '0')

      const likes = getAction('like') + getAction('post_reaction')
      const comments = getAction('comment')
      const shares = getAction('share')
      const postEngagement = getAction('post_engagement')

      const spend = parseFloat(insights.spend || '0')
      const budgetPerDay = campaign.daily_budget || 0
      const startTime = campaign.start_time ? new Date(campaign.start_time) : new Date()
      const endTime = campaign.end_time ? new Date(campaign.end_time) : new Date()
      const totalBudget = budgetPerDay * Math.ceil((endTime.getTime() - startTime.getTime()) / 86400000)
      const budgetRemaining = Math.max(0, totalBudget - spend)

      // Save performance snapshot
      await supabase.from('ad_performance').insert({
        campaign_id: campaign.id,
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

      results.synced++

      // Check if AI analysis needed (last analysis > 24 hours ago)
      const { data: lastAnalysis } = await supabase
        .from('ai_analyses')
        .select('created_at')
        .eq('campaign_id', campaign.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      const shouldAnalyze =
        !lastAnalysis ||
        new Date().getTime() - new Date(lastAnalysis.created_at).getTime() > 24 * 60 * 60 * 1000

      if (shouldAnalyze) {
        const now = new Date()
        const daysRunning = Math.ceil((now.getTime() - startTime.getTime()) / 86400000)
        const daysLeft = Math.max(0, Math.ceil((endTime.getTime() - now.getTime()) / 86400000))

        const aiResult = await analyzeAdPerformance({
          campaignName: campaign.campaign_name,
          spend,
          budget: totalBudget,
          budgetRemaining,
          daysRunning,
          daysLeft,
          impressions: parseInt(insights.impressions || '0'),
          reach: parseInt(insights.reach || '0'),
          clicks: parseInt(insights.clicks || '0'),
          ctr: parseFloat(insights.ctr || '0'),
          cpm: parseFloat(insights.cpm || '0'),
          cpc: parseFloat(insights.cpc || '0'),
          frequency: parseFloat(insights.frequency || '0'),
          engagement: postEngagement,
          likes,
          comments,
          shares,
        })

        // Save AI analysis
        await supabase.from('ai_analyses').insert({
          campaign_id: campaign.id,
          recommendation: aiResult.recommendation,
          confidence_score: aiResult.confidence,
          summary: aiResult.summary,
          reasoning: aiResult.reasoning,
          action_items: aiResult.actionItems,
          performance_snapshot: insights,
        })

        // Create notification for user
        await supabase.from('notifications').insert({
          user_id: campaign.user_id,
          campaign_id: campaign.id,
          type: 'ai_alert',
          title: `AI วิเคราะห์แคมเปญ: ${campaign.campaign_name}`,
          message: aiResult.summary,
        })

        results.analyzed++
      }
    } catch (err: any) {
      console.error(`Error syncing campaign ${campaign.id}:`, err.message)
      results.errors++
    }
  }

  return NextResponse.json({ success: true, ...results })
}
