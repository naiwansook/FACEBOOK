import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { getCampaignInsights } from '@/lib/facebook'
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

    // Fetch latest performance for each variant
    const variantsWithPerformance = []
    for (const campaign of campaigns || []) {
      // Get latest stored performance
      const { data: latestPerf } = await supabase
        .from('ad_performance')
        .select('*')
        .eq('campaign_id', campaign.id)
        .order('fetched_at', { ascending: false })
        .limit(1)
        .single()

      // Try to get fresh data from Facebook if we have a token
      let liveInsights = null
      if (pageToken && campaign.fb_campaign_id) {
        try {
          liveInsights = await getCampaignInsights(campaign.fb_campaign_id, pageToken)
        } catch {
          // use cached data
        }
      }

      const perf = liveInsights || latestPerf
      const actions = liveInsights?.actions || []
      const getAction = (type: string) =>
        parseInt(actions.find((a: any) => a.action_type === type)?.value || '0')

      variantsWithPerformance.push({
        campaign,
        performance: {
          impressions: perf ? parseInt(perf.impressions || '0') : 0,
          reach: perf ? parseInt(perf.reach || '0') : 0,
          clicks: perf ? parseInt(perf.clicks || '0') : 0,
          spend: perf ? parseFloat(perf.spend || '0') : 0,
          cpm: perf ? parseFloat(perf.cpm || '0') : 0,
          cpc: perf ? parseFloat(perf.cpc || '0') : 0,
          ctr: perf ? parseFloat(perf.ctr || '0') : 0,
          frequency: perf ? parseFloat(perf.frequency || '0') : 0,
          engagement: liveInsights ? getAction('post_engagement') : (latestPerf?.post_engagement || 0),
          likes: liveInsights ? (getAction('like') + getAction('post_reaction')) : (latestPerf?.likes || 0),
          comments: liveInsights ? getAction('comment') : (latestPerf?.comments || 0),
          shares: liveInsights ? getAction('share') : (latestPerf?.shares || 0),
        },
      })
    }

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
        dailyBudget: v.campaign.daily_budget,
        fbCampaignId: v.campaign.fb_campaign_id,
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
        const actions = insights?.actions || []
        const getAction = (type: string) =>
          parseInt(actions.find((a: any) => a.action_type === type)?.value || '0')

        variantPerformances.push({
          campaignId: campaign.id,
          variantLabel: campaign.variant_label || campaign.campaign_name,
          strategy: campaign.variant_strategy?.strategy || '',
          spend: parseFloat(insights?.spend || '0'),
          impressions: parseInt(insights?.impressions || '0'),
          reach: parseInt(insights?.reach || '0'),
          clicks: parseInt(insights?.clicks || '0'),
          ctr: parseFloat(insights?.ctr || '0'),
          cpm: parseFloat(insights?.cpm || '0'),
          cpc: parseFloat(insights?.cpc || '0'),
          frequency: parseFloat(insights?.frequency || '0'),
          engagement: getAction('post_engagement'),
          likes: getAction('like') + getAction('post_reaction'),
          comments: getAction('comment'),
          shares: getAction('share'),
        })
      } catch {
        // Skip if can't fetch
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
