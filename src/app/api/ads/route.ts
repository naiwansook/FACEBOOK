import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { getRealStatus } from '@/lib/facebook'
import { getFbUserIdFromToken } from '@/lib/supabase'

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

    // ใช้ FB user_id จาก session ก่อน (เก็บตอน login → ไม่ call FB API)
    // ถ้าไม่มี → fall back ไป /me + debug_token
    const fbId = (session as any).fbUserId || await getFbUserIdFromToken(userToken)
    if (!fbId) {
      // ถึงแม้ FB API ทุกตัวล้ม → ถือว่ายังมี session อยู่ ไม่ใช่ token expired
      return NextResponse.json({ campaigns: [], summary: null })
    }

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('facebook_id', fbId)
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

    // Fetch real Facebook status for ALL campaigns (including AB variants) — user needs accuracy
    // To reduce API calls: only sync if last sync is older than 5 minutes
    const fbStatusMap: Record<string, any> = {}
    const syncableCampaigns = campaigns.filter(c => c.fb_campaign_id && c.status !== 'completed' && c.status !== 'archived' && c.status !== 'deleted')

    const mapFbToDb = (fb: string): string => {
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

    const statusPromises = syncableCampaigns.map(async (c: any) => {
      // Cache: skip FB call if synced within last 3 minutes
      const syncedAt = c.fb_status_synced_at ? new Date(c.fb_status_synced_at).getTime() : 0
      const fresh = Date.now() - syncedAt < 3 * 60 * 1000
      if (fresh && c.fb_effective_status) {
        fbStatusMap[c.id] = { overall: c.fb_effective_status, cached: true }
        return
      }
      try {
        const status = await getRealStatus(userToken, c.fb_campaign_id, c.fb_adset_id, c.fb_ad_id)
        fbStatusMap[c.id] = status

        const newDbStatus = mapFbToDb(status.overall)
        // Also auto-mark expired campaigns as completed
        const isExpired = c.end_time && new Date(c.end_time).getTime() <= Date.now()
        const targetStatus = isExpired ? 'completed' : newDbStatus

        if (targetStatus !== c.status || status.overall !== c.fb_effective_status) {
          await supabase.from('ad_campaigns')
            .update({
              status: targetStatus,
              fb_effective_status: status.overall,
              fb_status_synced_at: new Date().toISOString(),
            })
            .eq('id', c.id)
          c.status = targetStatus
          c.fb_effective_status = status.overall
        }
      } catch (e: any) {
        console.error(`[ads] FB status sync failed for ${c.id}:`, e?.message)
      }
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
          messages: perf.messages || 0,
          link_clicks: perf.link_clicks || 0,
          calls: perf.calls || 0,
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
    const issuesCampaigns = enriched.filter(c => ['disapproved', 'with_issues', 'pending_review'].includes(c.status)).length

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
        issuesCampaigns,
        totalCampaigns: enriched.length,
      },
    })
  } catch (err: any) {
    console.error('[ads] fetch error:', err?.message)
    return NextResponse.json({ campaigns: [], summary: null, reason: 'error' })
  }
}
