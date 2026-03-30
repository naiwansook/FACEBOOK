import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { updateCampaignStatus } from '@/lib/facebook'

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

    const { action } = await req.json() // 'pause' | 'resume'
    if (action !== 'pause' && action !== 'resume') {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
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

    // Call Facebook API
    const fbStatus = action === 'pause' ? 'PAUSED' : 'ACTIVE'
    await updateCampaignStatus(campaign.fb_campaign_id, pageToken, fbStatus)

    // Update DB status
    const dbStatus = action === 'pause' ? 'paused' : 'active'
    await supabase
      .from('ad_campaigns')
      .update({ status: dbStatus })
      .eq('id', params.id)

    return NextResponse.json({ success: true, status: dbStatus })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
