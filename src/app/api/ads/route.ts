import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { getRealStatus } from '@/lib/facebook'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.accessToken) {
      return NextResponse.json({ campaigns: [], summary: null })
    }
    const userToken = session.accessToken as string

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ campaigns: [], summary: null })
    }

    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    const meRes = await fetch(
      `https://graph.facebook.com/v19.0/me?fields=id&access_token=${userToken}`
    )
    const meData = await meRes.json()
    if (meData.error || !meData.id) {
      return NextResponse.json({ campaigns: [], summary: null, reason: 'fb_token_expired' })
    }

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('facebook_id', meData.id)
      .single()

    if (!user) {
      return NextResponse.json({ campaigns: [], summary: null })
    }

    // Get campaigns
    const { data: campaigns } = await supabase
      .from('ad_campaigns')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (!campaigns || campaigns.length === 0) {
      return NextResponse.json({ campaigns: [], summary: null })
    }

    // Get latest performance for each campaign
    const campaignIds = campaigns.map(c => c.id)
    const { data: allPerf } = await supabase
      .from('ad_performance')
      .select('*')
      .in('campaign_id', campaignIds)
      .order('fetched_at', { ascending: false })

    // Get latest AI analysis for each campaign
    const { data: allAnalyses } = await supabase
      .from('ai_analyses')
      .select('campaign_id, recommendation, confidence_score, summary, created_at')
      .in('campaign_id', campaignIds)
      .order('created_at', { ascending: false })

    // Map latest perf + analysis per campaign
    const perfMap: Record<string, any> = {}
    const analysisMap: Record<string, any> = {}
    for (const p of (allPerf || [])) {
      if (!perfMap[p.campaign_id]) perfMap[p.campaign_id] = p
    }
    for (const a of (allAnalyses || [])) {
      if (!analysisMap[a.campaign_id]) analysisMap[a.campaign_id] = a
    }

    // Fetch real Facebook status only for non-AB-test standalone campaigns (reduce API calls)
    const fbStatusMap: Record<string, any> = {}
    const standaloneCampaigns = campaigns.filter(c => !c.test_group_id && c.fb_campaign_id)
    const statusPromises = standaloneCampaigns.map(async (c) => {
      try {
        const status = await getRealStatus(userToken, c.fb_campaign_id, c.fb_adset_id, c.fb_ad_id)
        fbStatusMap[c.id] = status

        // Auto-sync DB status if different from Facebook
        const fbOverall = status.overall
        const dbStatus = c.status
        let newDbStatus: string | null = null
        if (fbOverall === 'ACTIVE' && dbStatus !== 'active') newDbStatus = 'active'
        else if ((fbOverall === 'PAUSED' || fbOverall === 'CAMPAIGN_PAUSED' || fbOverall === 'ADSET_PAUSED') && dbStatus !== 'paused') newDbStatus = 'paused'

        if (newDbStatus) {
          await supabase.from('ad_campaigns').update({ status: newDbStatus }).eq('id', c.id)
          c.status = newDbStatus // update in-memory too
        }
      } catch {}
    })
    await Promise.all(statusPromises)

    // Enrich campaigns with performance + analysis + real FB status
    const enriched = campaigns.map(c => {
      const perf = perfMap[c.id] || null
      const analysis = analysisMap[c.id] || null
      const fbStatus = fbStatusMap[c.id] || null
      const now = new Date()
      const start = c.start_time ? new Date(c.start_time) : now
      const end = c.end_time ? new Date(c.end_time) : now
      const totalDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000))
      const totalBudget = (c.daily_budget || 0) * totalDays
      const spend = perf?.spend || 0

      return {
        ...c,
        perf: perf ? {
          impressions: perf.impressions || 0,
          reach: perf.reach || 0,
          clicks: perf.clicks || 0,
          spend: perf.spend || 0,
          ctr: perf.ctr || 0,
          cpm: perf.cpm || 0,
          cpc: perf.cpc || 0,
          frequency: perf.frequency || 0,
          likes: perf.likes || 0,
          comments: perf.comments || 0,
          shares: perf.shares || 0,
          post_engagement: perf.post_engagement || 0,
          fetched_at: perf.fetched_at,
        } : null,
        analysis: analysis ? {
          recommendation: analysis.recommendation,
          confidence: analysis.confidence_score,
          summary: analysis.summary,
          analyzed_at: analysis.created_at,
        } : null,
        fbStatus: fbStatus ? {
          campaign: fbStatus.campaign,
          adset: fbStatus.adset,
          ad: fbStatus.ad,
          overall: fbStatus.overall,
        } : null,
        totalBudget,
        budgetRemaining: Math.max(0, totalBudget - spend),
        totalDays,
      }
    })

    // Summary across all campaigns
    const totalSpend = enriched.reduce((s, c) => s + (c.perf?.spend || 0), 0)
    const totalBudgetAll = enriched.reduce((s, c) => s + c.totalBudget, 0)
    const totalImpressions = enriched.reduce((s, c) => s + (c.perf?.impressions || 0), 0)
    const totalClicks = enriched.reduce((s, c) => s + (c.perf?.clicks || 0), 0)
    const totalReach = enriched.reduce((s, c) => s + (c.perf?.reach || 0), 0)
    const activeCampaigns = enriched.filter(c => c.status === 'active').length
    const pausedCampaigns = enriched.filter(c => c.status === 'paused').length

    return NextResponse.json({
      campaigns: enriched,
      summary: {
        totalSpend,
        totalBudget: totalBudgetAll,
        budgetRemaining: Math.max(0, totalBudgetAll - totalSpend),
        totalImpressions,
        totalClicks,
        totalReach,
        avgCTR: totalImpressions > 0 ? (totalClicks / totalImpressions * 100) : 0,
        activeCampaigns,
        pausedCampaigns,
        totalCampaigns: enriched.length,
      },
    })
  } catch (err: any) {
    console.error('[ads] fetch error:', err?.message)
    return NextResponse.json({ campaigns: [], summary: null, reason: 'error' })
  }
}
