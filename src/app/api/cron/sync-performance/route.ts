import { NextResponse } from 'next/server'
import { getCampaignInsights, updateCampaignStatus, getRealStatus, parseInsightActions } from '@/lib/facebook'
import { analyzeAdPerformance, compareTestVariants, type VariantPerformance } from '@/lib/ai-analyzer'

// Map FB effective_status → DB status enum
function mapFbToDbStatus(fbOverall: string): string {
  switch (fbOverall) {
    case 'ACTIVE': return 'active'
    case 'PAUSED': return 'paused'
    case 'DISAPPROVED': return 'disapproved'
    case 'PENDING_REVIEW': return 'pending_review'
    case 'WITH_ISSUES': return 'with_issues'
    case 'ARCHIVED': return 'archived'
    case 'DELETED': return 'deleted'
    default: return 'active' // unknown — keep running
  }
}

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

  // Get all non-ended campaigns (active, paused, pending_review, with_issues) + auto-mark expired
  const { data: campaigns, error } = await supabase
    .from('ad_campaigns')
    .select(`
      id, fb_campaign_id, fb_adset_id, fb_ad_id, campaign_name, status,
      daily_budget, start_time, end_time, user_id,
      connected_pages!page_id (page_access_token, ad_account_id)
    `)
    .in('status', ['active', 'paused', 'pending_review', 'with_issues'])
    .not('fb_campaign_id', 'is', null)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const results = { synced: 0, analyzed: 0, abTestsCompared: 0, statusUpdated: 0, errors: 0, errorDetails: [] as string[] }

  for (const campaign of campaigns || []) {
    try {
      const page = (campaign as any).connected_pages
      const pageToken = page?.page_access_token
      if (!pageToken || !campaign.fb_campaign_id) continue

      // 1. Sync real FB status first
      try {
        const fbStatus = await getRealStatus(pageToken, campaign.fb_campaign_id, campaign.fb_adset_id, campaign.fb_ad_id)
        const newDbStatus = mapFbToDbStatus(fbStatus.overall)
        // Auto-mark completed if end_time passed
        const isExpired = campaign.end_time && new Date(campaign.end_time).getTime() <= Date.now()
        const targetStatus = isExpired ? 'completed' : newDbStatus
        if (targetStatus !== campaign.status) {
          await supabase.from('ad_campaigns')
            .update({
              status: targetStatus,
              fb_effective_status: fbStatus.overall,
              fb_status_synced_at: new Date().toISOString(),
            })
            .eq('id', campaign.id)
          campaign.status = targetStatus
          results.statusUpdated++
        } else {
          // Still update the metadata for freshness
          await supabase.from('ad_campaigns')
            .update({ fb_effective_status: fbStatus.overall, fb_status_synced_at: new Date().toISOString() })
            .eq('id', campaign.id)
        }
      } catch (e: any) {
        console.error(`[cron] status sync failed for ${campaign.id}:`, e.message)
      }

      // 2. Fetch Facebook Insights
      const insights = await getCampaignInsights(campaign.fb_campaign_id, pageToken)
      if (!insights) continue

      // Parse actions using shared helper (ensures consistency with Ads Manager)
      const parsed = parseInsightActions(insights)
      const { likes, comments, shares, messages, linkClicks, calls, postEngagement, pageEngagement } = parsed

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
        page_engagement: pageEngagement,
        messages,
        link_clicks: linkClicks,
        calls,
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
      console.error(`[cron] Error syncing campaign ${campaign.id}:`, err.message)
      results.errors++
      results.errorDetails.push(`${campaign.campaign_name || campaign.id}: ${err.message}`)
    }
  }

  // ============================================
  // AB Test Comparison: เปรียบเทียบ variants
  // ============================================
  const { data: runningTests } = await supabase
    .from('ab_test_groups')
    .select('*')
    .eq('status', 'running')

  for (const testGroup of runningTests || []) {
    try {
      // Get page token
      const { data: page } = await supabase
        .from('connected_pages')
        .select('page_access_token')
        .eq('id', testGroup.page_id)
        .single()

      if (!page?.page_access_token) continue

      // Get campaigns in this test group
      const { data: testCampaigns } = await supabase
        .from('ad_campaigns')
        .select('*')
        .eq('test_group_id', testGroup.id)
        .in('status', ['active', 'paused'])

      if (!testCampaigns || testCampaigns.length < 2) continue

      // Check last comparison (every 12 hours for AB tests)
      const { data: lastComparison } = await supabase
        .from('ai_analyses')
        .select('created_at')
        .in('campaign_id', testCampaigns.map(c => c.id))
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      const shouldCompare =
        !lastComparison ||
        Date.now() - new Date(lastComparison.created_at).getTime() > 12 * 60 * 60 * 1000

      if (!shouldCompare) continue

      // Collect live metrics + sync each variant's real FB status
      const variantPerfs: VariantPerformance[] = []
      for (const camp of testCampaigns) {
        if (!camp.fb_campaign_id) continue

        // Sync status for each variant (AB test often has mixed states)
        try {
          const fs = await getRealStatus(page.page_access_token, camp.fb_campaign_id, camp.fb_adset_id, camp.fb_ad_id)
          const target = mapFbToDbStatus(fs.overall)
          if (target !== camp.status) {
            await supabase.from('ad_campaigns')
              .update({ status: target, fb_effective_status: fs.overall, fb_status_synced_at: new Date().toISOString() })
              .eq('id', camp.id)
            camp.status = target
            results.statusUpdated++
          }
        } catch {}

        if (camp.status !== 'active') continue

        try {
          const ins = await getCampaignInsights(camp.fb_campaign_id, page.page_access_token)
          if (!ins) continue
          const parsed = parseInsightActions(ins)

          variantPerfs.push({
            campaignId: camp.id,
            variantLabel: camp.variant_label || camp.campaign_name,
            strategy: camp.variant_strategy?.strategy || '',
            spend: parseFloat(ins.spend || '0'),
            impressions: parseInt(ins.impressions || '0'),
            reach: parseInt(ins.reach || '0'),
            clicks: parseInt(ins.clicks || '0'),
            ctr: parseFloat(ins.ctr || '0'),
            cpm: parseFloat(ins.cpm || '0'),
            cpc: parseFloat(ins.cpc || '0'),
            frequency: parseFloat(ins.frequency || '0'),
            engagement: parsed.postEngagement,
            likes: parsed.likes,
            comments: parsed.comments,
            shares: parsed.shares,
          })
        } catch (e: any) {
          console.error(`[cron] AB variant insights failed for ${camp.id}:`, e.message)
        }
      }

      if (variantPerfs.length < 2) continue

      const daysRunning = Math.ceil(
        (Date.now() - new Date(testGroup.created_at).getTime()) / 86400000
      )

      const comparison = await compareTestVariants(
        variantPerfs,
        testGroup.total_daily_budget,
        daysRunning
      )

      // Save analysis
      if (comparison.bestVariant) {
        await supabase.from('ai_analyses').insert({
          campaign_id: comparison.bestVariant,
          recommendation: 'increase_budget',
          confidence_score: 0.9,
          summary: comparison.overallSummary,
          reasoning: comparison.reallocationPlan || '',
          action_items: comparison.variants.map(v => `${v.label}: ${v.verdict} — ${v.reason}`),
          performance_snapshot: { comparison },
        })

        await supabase
          .from('ab_test_groups')
          .update({ winning_campaign_id: comparison.bestVariant })
          .eq('id', testGroup.id)
      }

      // Auto-pause losing variants
      for (const v of comparison.variants) {
        if (v.verdict === 'stop_and_delete') {
          const camp = testCampaigns.find(c => c.id === v.campaignId)
          if (camp?.fb_campaign_id) {
            try {
              await updateCampaignStatus(camp.fb_campaign_id, page.page_access_token, 'PAUSED')
              await supabase.from('ad_campaigns').update({ status: 'paused' }).eq('id', v.campaignId)
            } catch { /* continue */ }
          }
        }
      }

      // Notify
      await supabase.from('notifications').insert({
        user_id: testGroup.user_id,
        type: 'ai_alert',
        title: 'AI อัปเดต A/B Test',
        message: comparison.overallSummary,
      })

      results.abTestsCompared++
    } catch (err: any) {
      console.error(`Error comparing AB test ${testGroup.id}:`, err.message)
      results.errors++
    }
  }

  return NextResponse.json({ success: true, ...results })
}
