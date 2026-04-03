import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const FB = 'https://graph.facebook.com/v19.0'

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.accessToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const userToken = session.accessToken as string

    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Verify user
    const meRes = await fetch(`${FB}/me?fields=id&access_token=${userToken}`)
    const meData = await meRes.json()
    if (meData.error) throw new Error(meData.error.message)

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('facebook_id', meData.id)
      .single()

    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    // Get campaign (verify ownership)
    const { data: campaign } = await supabase
      .from('ad_campaigns')
      .select('*')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single()

    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

    // Delete from Facebook (Ad → AdSet → Campaign order)
    const fbErrors: string[] = []

    // 1. Delete Ad
    if (campaign.fb_ad_id) {
      try {
        const r = await fetch(`${FB}/${campaign.fb_ad_id}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ access_token: userToken }),
        })
        const d = await r.json()
        if (d.error) fbErrors.push(`Ad: ${d.error.message}`)
      } catch (e: any) { fbErrors.push(`Ad: ${e.message}`) }
    }

    // 2. Delete Ad Set
    if (campaign.fb_adset_id) {
      try {
        const r = await fetch(`${FB}/${campaign.fb_adset_id}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ access_token: userToken }),
        })
        const d = await r.json()
        if (d.error) fbErrors.push(`AdSet: ${d.error.message}`)
      } catch (e: any) { fbErrors.push(`AdSet: ${e.message}`) }
    }

    // 3. Delete Campaign
    if (campaign.fb_campaign_id) {
      try {
        const r = await fetch(`${FB}/${campaign.fb_campaign_id}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ access_token: userToken }),
        })
        const d = await r.json()
        if (d.error) fbErrors.push(`Campaign: ${d.error.message}`)
      } catch (e: any) { fbErrors.push(`Campaign: ${e.message}`) }
    }

    // Delete related data from Supabase
    await supabase.from('ai_analyses').delete().eq('campaign_id', params.id)
    await supabase.from('ad_performance').delete().eq('campaign_id', params.id)
    await supabase.from('notifications').delete().eq('campaign_id', params.id)
    await supabase.from('ad_campaigns').delete().eq('id', params.id)

    return NextResponse.json({
      success: true,
      fbErrors: fbErrors.length > 0 ? fbErrors : undefined,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
