import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(
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
    if (meData.error || !meData.id) {
      return NextResponse.json({ error: 'Invalid Facebook token' }, { status: 401 })
    }

    // Get user from DB
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('facebook_id', meData.id)
      .single()

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Get campaign + verify ownership
    const { data: campaign } = await supabase
      .from('ad_campaigns')
      .select(`
        *,
        connected_pages!page_id (
          page_id, page_name, page_access_token, ad_account_id
        )
      `)
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single()

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    // Get latest performance snapshot
    const { data: latestPerf } = await supabase
      .from('ad_performance')
      .select('*')
      .eq('campaign_id', params.id)
      .order('fetched_at', { ascending: false })
      .limit(1)
      .single()

    // Get performance history (last 10 for chart)
    const { data: perfHistory } = await supabase
      .from('ad_performance')
      .select('impressions, clicks, spend, ctr, cpm, fetched_at')
      .eq('campaign_id', params.id)
      .order('fetched_at', { ascending: false })
      .limit(10)

    // Get latest AI analysis
    const { data: latestAnalysis } = await supabase
      .from('ai_analyses')
      .select('*')
      .eq('campaign_id', params.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    return NextResponse.json({
      campaign,
      latestPerf: latestPerf || null,
      perfHistory: (perfHistory || []).reverse(),
      latestAnalysis: latestAnalysis || null,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
