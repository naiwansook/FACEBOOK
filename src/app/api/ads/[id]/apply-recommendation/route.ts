import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { updateAllStatus, updateAdSetBudget, updateAdSetEndTime } from '@/lib/facebook'

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
    const userToken = session.accessToken as string

    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Get Facebook user ID
    const meRes = await fetch(
      `https://graph.facebook.com/v19.0/me?fields=id&access_token=${userToken}`
    )
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

    // Get latest AI analysis for this campaign
    const { data: analysis } = await supabase
      .from('ai_analyses')
      .select('*')
      .eq('campaign_id', params.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (!analysis) return NextResponse.json({ error: 'No AI analysis found' }, { status: 404 })
    if (analysis.action_taken) return NextResponse.json({ error: 'Already applied' }, { status: 400 })

    const recommendation = analysis.recommendation
    const results: { action: string; details: string; success: boolean } = {
      action: recommendation,
      details: '',
      success: false,
    }

    switch (recommendation) {
      case 'pause_ad': {
        if (!campaign.fb_campaign_id) throw new Error('No Facebook campaign ID')
        const fbResults = await updateAllStatus(
          userToken,
          campaign.fb_campaign_id,
          campaign.fb_adset_id,
          campaign.fb_ad_id,
          'PAUSED'
        )
        await supabase.from('ad_campaigns').update({ status: 'paused' }).eq('id', params.id)
        results.details = 'หยุดแอดแล้ว'
        results.success = !!fbResults.campaign
        break
      }

      case 'increase_budget': {
        if (!campaign.fb_adset_id) throw new Error('No Facebook AdSet ID')
        const newBudget = Math.round(campaign.daily_budget * 1.5) // +50%
        await updateAdSetBudget(campaign.fb_adset_id, userToken, newBudget)
        await supabase.from('ad_campaigns').update({ daily_budget: newBudget }).eq('id', params.id)
        results.details = `เพิ่มงบจาก ฿${campaign.daily_budget} เป็น ฿${newBudget}/วัน (+50%)`
        results.success = true
        break
      }

      case 'decrease_budget': {
        if (!campaign.fb_adset_id) throw new Error('No Facebook AdSet ID')
        const newBudget = Math.max(20, Math.round(campaign.daily_budget * 0.7)) // -30%, min 20
        await updateAdSetBudget(campaign.fb_adset_id, userToken, newBudget)
        await supabase.from('ad_campaigns').update({ daily_budget: newBudget }).eq('id', params.id)
        results.details = `ลดงบจาก ฿${campaign.daily_budget} เป็น ฿${newBudget}/วัน (-30%)`
        results.success = true
        break
      }

      case 'extend_duration': {
        if (!campaign.fb_adset_id) throw new Error('No Facebook AdSet ID')
        const currentEnd = campaign.end_time ? new Date(campaign.end_time) : new Date()
        const newEnd = new Date(currentEnd)
        newEnd.setDate(newEnd.getDate() + 7)
        await updateAdSetEndTime(campaign.fb_adset_id, userToken, newEnd.toISOString())
        await supabase.from('ad_campaigns').update({ end_time: newEnd.toISOString() }).eq('id', params.id)
        results.details = `ขยายเวลาไปอีก 7 วัน (ถึง ${newEnd.toLocaleDateString('th-TH')})`
        results.success = true
        break
      }

      case 'keep_running': {
        results.details = 'รับทราบ — ปล่อยแอดวิ่งต่อ'
        results.success = true
        break
      }

      case 'change_targeting': {
        // Pause current ad and suggest recreating
        if (campaign.fb_campaign_id) {
          await updateAllStatus(
            userToken,
            campaign.fb_campaign_id,
            campaign.fb_adset_id,
            campaign.fb_ad_id,
            'PAUSED'
          )
          await supabase.from('ad_campaigns').update({ status: 'paused' }).eq('id', params.id)
        }
        results.details = 'หยุดแอดแล้ว — แนะนำสร้างแอดใหม่ด้วย targeting ใหม่'
        results.success = true
        break
      }

      default:
        return NextResponse.json({ error: `Unknown recommendation: ${recommendation}` }, { status: 400 })
    }

    // Mark analysis as action taken
    await supabase
      .from('ai_analyses')
      .update({ action_taken: true, action_at: new Date().toISOString() })
      .eq('id', analysis.id)

    // Create notification
    await supabase.from('notifications').insert({
      user_id: user.id,
      type: 'ai_action',
      title: `AI ดำเนินการแล้ว: ${analysis.recommendation}`,
      message: results.details,
    })

    return NextResponse.json({ action: results.action, details: results.details, success: results.success })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
