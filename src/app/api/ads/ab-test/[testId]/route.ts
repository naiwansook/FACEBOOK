import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { getCampaignInsights, getRealStatus, parseInsightActions } from '@/lib/facebook'

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
import { compareTestVariants, type VariantPerformance } from '@/lib/ai-analyzer'

export const dynamic = 'force-dynamic'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ testId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.accessToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { testId } = await params

    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Get test group
    const { data: testGroup, error: testError } = await supabase
      .from('ab_test_groups')
      .select('*, connected_pages!page_id (page_access_token)')
      .eq('id', testId)
      .single()

    if (testError || !testGroup) {
      return NextResponse.json({ error: 'ไม่พบ Test Group' }, { status: 404 })
    }

    // Get all campaigns in this test group
    const { data: campaigns, error: campError } = await supabase
      .from('ad_campaigns')
      .select('*')
      .eq('test_group_id', testId)
      .order('created_at', { ascending: true })

    if (campError) throw new Error(campError.message)

    const pageToken = (testGroup as any).connected_pages?.page_access_token

    // Fetch real FB status + insights for each variant in parallel (max accuracy vs Ads Manager)
    const variantsWithPerformance = await Promise.all((campaigns || []).map(async (campaign) => {
      // Get latest stored performance
      const { data: latestPerf } = await supabase
        .from('ad_performance')
        .select('*')
        .eq('campaign_id', campaign.id)
        .order('fetched_at', { ascending: false })
        .limit(1)
        .single()

      let liveInsights: any = null
      let fbStatus: any = null
      let effectiveStatus = campaign.fb_effective_status || null

      if (pageToken && campaign.fb_campaign_id) {
        // Parallel: status + insights
        const [statusResult, insightsResult] = await Promise.all([
          getRealStatus(pageToken, campaign.fb_campaign_id, campaign.fb_adset_id, campaign.fb_ad_id).catch((e) => {
            console.error(`[ab-test] status failed for ${campaign.id}:`, e?.message)
            return null
          }),
          getCampaignInsights(campaign.fb_campaign_id, pageToken).catch((e) => {
            console.error(`[ab-test] insights failed for ${campaign.id}:`, e?.message)
            return null
          }),
        ])
        fbStatus = statusResult
        liveInsights = insightsResult

        // Auto-sync DB status from FB
        if (statusResult) {
          effectiveStatus = statusResult.overall
          const isExpired = campaign.end_time && new Date(campaign.end_time).getTime() <= Date.now()
          const target = isExpired ? 'completed' : mapFbToDb(statusResult.overall)
          if (target !== campaign.status || statusResult.overall !== campaign.fb_effective_status) {
            await supabase.from('ad_campaigns')
              .update({
                status: target,
                fb_effective_status: statusResult.overall,
                fb_status_synced_at: new Date().toISOString(),
              })
              .eq('id', campaign.id)
            campaign.status = target
            campaign.fb_effective_status = statusResult.overall
          }
        }
      }

      const parsed = liveInsights ? parseInsightActions(liveInsights) : null
      const perf = liveInsights || latestPerf

      return {
        campaign,
        effectiveStatus,
        fbStatus,
        performance: {
          impressions: perf ? parseInt(String(perf.impressions || '0')) : 0,
          reach: perf ? parseInt(String(perf.reach || '0')) : 0,
          clicks: perf ? parseInt(String(perf.clicks || '0')) : 0,
          spend: perf ? parseFloat(String(perf.spend || '0')) : 0,
          cpm: perf ? parseFloat(String(perf.cpm || '0')) : 0,
          cpc: perf ? parseFloat(String(perf.cpc || '0')) : 0,
          ctr: perf ? parseFloat(String(perf.ctr || '0')) : 0,
          frequency: perf ? parseFloat(String(perf.frequency || '0')) : 0,
          engagement: parsed ? parsed.postEngagement : (latestPerf?.post_engagement || 0),
          likes: parsed ? parsed.likes : (latestPerf?.likes || 0),
          comments: parsed ? parsed.comments : (latestPerf?.comments || 0),
          shares: parsed ? parsed.shares : (latestPerf?.shares || 0),
          messages: parsed ? parsed.messages : (latestPerf?.messages || 0),
          link_clicks: parsed ? parsed.linkClicks : (latestPerf?.link_clicks || 0),
          calls: parsed ? parsed.calls : (latestPerf?.calls || 0),
        },
      }
    }))

    // Get latest AI comparison (if exists)
    const { data: latestAnalysis } = await supabase
      .from('ai_analyses')
      .select('*')
      .in('campaign_id', (campaigns || []).map(c => c.id))
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    return NextResponse.json({
      testGroup: {
        id: testGroup.id,
        status: testGroup.status,
        postMessage: testGroup.post_message,
        postImage: testGroup.post_image,
        aiAnalysis: testGroup.ai_post_analysis,
        totalDailyBudget: testGroup.total_daily_budget,
        durationDays: testGroup.duration_days,
        winningCampaignId: testGroup.winning_campaign_id,
        createdAt: testGroup.created_at,
      },
      variants: variantsWithPerformance.map(v => ({
        id: v.campaign.id,
        label: v.campaign.variant_label,
        strategy: v.campaign.variant_strategy,
        status: v.campaign.status,
        effectiveStatus: v.effectiveStatus, // Real FB effective_status (ACTIVE/PAUSED/DISAPPROVED/...)
        fbStatus: v.fbStatus ? { campaign: v.fbStatus.campaign, adset: v.fbStatus.adset, ad: v.fbStatus.ad, overall: v.fbStatus.overall } : null,
        dailyBudget: v.campaign.daily_budget,
        fbCampaignId: v.campaign.fb_campaign_id,
        startTime: v.campaign.start_time,
        endTime: v.campaign.end_time,
        goal: v.campaign.goal || 'reach',
        ...v.performance,
      })),
      latestAnalysis,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// POST: Request fresh AI comparison
export async function POST(
  req: Request,
  { params }: { params: Promise<{ testId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.accessToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { testId } = await params

    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Get test group + campaigns
    const { data: testGroup } = await supabase
      .from('ab_test_groups')
      .select('*, connected_pages!page_id (page_access_token)')
      .eq('id', testId)
      .single()

    if (!testGroup) {
      return NextResponse.json({ error: 'ไม่พบ Test Group' }, { status: 404 })
    }

    const { data: campaigns } = await supabase
      .from('ad_campaigns')
      .select('*')
      .eq('test_group_id', testId)

    const pageToken = (testGroup as any).connected_pages?.page_access_token
    if (!pageToken) {
      return NextResponse.json({ error: 'ไม่พบ Page Token' }, { status: 400 })
    }

    // Collect live metrics for all variants
    const variantPerformances: VariantPerformance[] = []

    for (const campaign of campaigns || []) {
      if (!campaign.fb_campaign_id) continue

      try {
        const insights = await getCampaignInsights(campaign.fb_campaign_id, pageToken)
        const parsed = insights ? parseInsightActions(insights) : null
        if (!insights || !parsed) continue

        variantPerformances.push({
          campaignId: campaign.id,
          variantLabel: campaign.variant_label || campaign.campaign_name,
          strategy: campaign.variant_strategy?.strategy || '',
          spend: parseFloat(insights.spend || '0'),
          impressions: parseInt(insights.impressions || '0'),
          reach: parseInt(insights.reach || '0'),
          clicks: parseInt(insights.clicks || '0'),
          ctr: parseFloat(insights.ctr || '0'),
          cpm: parseFloat(insights.cpm || '0'),
          cpc: parseFloat(insights.cpc || '0'),
          frequency: parseFloat(insights.frequency || '0'),
          engagement: parsed.postEngagement,
          likes: parsed.likes,
          comments: parsed.comments,
          shares: parsed.shares,
        })
      } catch (e: any) {
        console.error(`[ab-test POST] insights failed for ${campaign.id}:`, e.message)
      }
    }

    if (variantPerformances.length < 2) {
      return NextResponse.json({ error: 'ข้อมูลยังไม่เพียงพอ ต้องมีอย่างน้อย 2 variants ที่มีข้อมูล' }, { status: 400 })
    }

    // Calculate days running
    const daysRunning = Math.ceil(
      (Date.now() - new Date(testGroup.created_at).getTime()) / 86400000
    )

    // AI Compare
    const comparison = await compareTestVariants(
      variantPerformances,
      testGroup.total_daily_budget,
      daysRunning
    )

    // Save comparison as AI analysis for the best variant
    if (comparison.bestVariant) {
      await supabase.from('ai_analyses').insert({
        campaign_id: comparison.bestVariant,
        recommendation: 'increase_budget',
        confidence_score: 0.9,
        summary: comparison.overallSummary,
        reasoning: comparison.reallocationPlan || '',
        action_items: comparison.variants.map(v => `${v.label}: ${v.verdict} — ${v.reason}`),
        performance_snapshot: { comparison, variantPerformances },
      })
    }

    // Update winning campaign in test group
    if (comparison.bestVariant) {
      await supabase
        .from('ab_test_groups')
        .update({ winning_campaign_id: comparison.bestVariant })
        .eq('id', testId)
    }

    // Auto-actions: pause variants that AI says to stop
    for (const v of comparison.variants) {
      if (v.verdict === 'stop_and_delete') {
        const camp = (campaigns || []).find(c => c.id === v.campaignId)
        if (camp?.fb_campaign_id) {
          try {
            const { updateCampaignStatus } = await import('@/lib/facebook')
            await updateCampaignStatus(camp.fb_campaign_id, pageToken, 'PAUSED')
            await supabase
              .from('ad_campaigns')
              .update({ status: 'paused' })
              .eq('id', v.campaignId)
          } catch {
            // continue
          }
        }
      }
    }

    // Notify user
    await supabase.from('notifications').insert({
      user_id: testGroup.user_id,
      type: 'ai_alert',
      title: 'AI เปรียบเทียบ A/B Test แล้ว',
      message: comparison.overallSummary,
    })

    return NextResponse.json({ success: true, comparison })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
