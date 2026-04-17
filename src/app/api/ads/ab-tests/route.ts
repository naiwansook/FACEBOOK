import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET() {
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

    // Get user
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

    if (!user) {
      return NextResponse.json({ tests: [] })
    }

    // Get all AB test groups for this user
    const { data: tests, error } = await supabase
      .from('ab_test_groups')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) throw new Error(error.message)

    // Get variants for each test (with budget, status, label, performance)
    const testIds = (tests || []).map(t => t.id)
    const { data: allVariants } = await supabase
      .from('ad_campaigns')
      .select('id, test_group_id, variant_label, daily_budget, status, fb_campaign_id, fb_adset_id, fb_ad_id, fb_effective_status, fb_status_synced_at, start_time, end_time')
      .in('test_group_id', testIds)

    // Get latest performance per variant
    const variantIds = (allVariants || []).map(v => v.id)
    const { data: allPerf } = variantIds.length > 0
      ? await supabase
          .from('ad_performance')
          .select('campaign_id, impressions, reach, clicks, spend, ctr, cpc, cpm')
          .in('campaign_id', variantIds)
          .order('fetched_at', { ascending: false })
      : { data: [] }

    const perfMap: Record<string, any> = {}
    for (const p of (allPerf || [])) {
      if (!perfMap[p.campaign_id]) perfMap[p.campaign_id] = p
    }

    // Group variants by test (use DB status to avoid FB rate limits)
    const variantsByTest: Record<string, any[]> = {}
    for (const v of (allVariants || [])) {
      if (!variantsByTest[v.test_group_id]) variantsByTest[v.test_group_id] = []
      const perf = perfMap[v.id]
      variantsByTest[v.test_group_id].push({
        id: v.id,
        label: v.variant_label,
        dailyBudget: v.daily_budget,
        status: v.status,
        effectiveStatus: v.fb_effective_status,
        syncedAt: v.fb_status_synced_at,
        startTime: v.start_time,
        endTime: v.end_time,
        spend: perf?.spend || 0,
        impressions: perf?.impressions || 0,
        clicks: perf?.clicks || 0,
        ctr: perf?.ctr || 0,
      })
    }

    const testsEnriched = (tests || []).map(test => ({
      ...test,
      variant_count: variantsByTest[test.id]?.length || 0,
      variants: variantsByTest[test.id] || [],
      totalSpend: (variantsByTest[test.id] || []).reduce((s: number, v: any) => s + (v.spend || 0), 0),
    }))

    return NextResponse.json({ tests: testsEnriched })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
