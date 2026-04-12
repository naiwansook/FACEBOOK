import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { updateAdSetBudget, updateAllStatus } from '@/lib/facebook'

export const dynamic = 'force-dynamic'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ testId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.accessToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const userToken = session.accessToken as string
    const { testId } = await params
    const { comparison } = await req.json()

    if (!comparison?.variants?.length) {
      return NextResponse.json({ error: 'No comparison data' }, { status: 400 })
    }

    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Get test group
    const { data: testGroup } = await supabase
      .from('ab_test_groups')
      .select('*')
      .eq('id', testId)
      .single()

    if (!testGroup) {
      return NextResponse.json({ error: 'Test group not found' }, { status: 404 })
    }

    // Get all campaigns in this test group
    const { data: campaigns } = await supabase
      .from('ad_campaigns')
      .select('*')
      .eq('test_group_id', testId)

    if (!campaigns?.length) {
      return NextResponse.json({ error: 'No campaigns found' }, { status: 404 })
    }

    const actions: { label: string; verdict: string; action: string; success: boolean }[] = []

    for (const cv of comparison.variants) {
      const campaign = campaigns.find((c: any) => c.id === cv.campaignId)
      if (!campaign) continue

      const budgetChange = typeof cv.suggestedBudgetChange === 'number'
        ? cv.suggestedBudgetChange
        : 0

      switch (cv.verdict) {
        case 'scale_up': {
          if (campaign.fb_adset_id && budgetChange > 0) {
            const multiplier = 1 + (budgetChange / 100)
            const newBudget = Math.round(campaign.daily_budget * multiplier)
            try {
              await updateAdSetBudget(campaign.fb_adset_id, userToken, newBudget)
              await supabase.from('ad_campaigns')
                .update({ daily_budget: newBudget })
                .eq('id', campaign.id)
              actions.push({
                label: cv.label,
                verdict: 'scale_up',
                action: `เพิ่มงบ ฿${campaign.daily_budget} → ฿${newBudget}/วัน (+${budgetChange}%)`,
                success: true,
              })
            } catch (e: any) {
              actions.push({ label: cv.label, verdict: 'scale_up', action: e.message, success: false })
            }
          } else {
            actions.push({ label: cv.label, verdict: 'scale_up', action: 'ไม่มีข้อมูลการเปลี่ยนงบ', success: false })
          }
          break
        }

        case 'reduce': {
          if (campaign.fb_adset_id && budgetChange !== 0) {
            const changePercent = Math.abs(budgetChange)
            const multiplier = 1 - (changePercent / 100)
            const newBudget = Math.max(20, Math.round(campaign.daily_budget * multiplier))
            try {
              await updateAdSetBudget(campaign.fb_adset_id, userToken, newBudget)
              await supabase.from('ad_campaigns')
                .update({ daily_budget: newBudget })
                .eq('id', campaign.id)
              actions.push({
                label: cv.label,
                verdict: 'reduce',
                action: `ลดงบ ฿${campaign.daily_budget} → ฿${newBudget}/วัน (-${changePercent}%)`,
                success: true,
              })
            } catch (e: any) {
              actions.push({ label: cv.label, verdict: 'reduce', action: e.message, success: false })
            }
          }
          break
        }

        case 'stop_and_delete': {
          if (campaign.fb_campaign_id && campaign.status !== 'paused') {
            try {
              await updateAllStatus(userToken, campaign.fb_campaign_id, campaign.fb_adset_id, campaign.fb_ad_id, 'PAUSED')
              await supabase.from('ad_campaigns').update({ status: 'paused' }).eq('id', campaign.id)
              actions.push({ label: cv.label, verdict: 'stop_and_delete', action: 'หยุดแอดแล้ว', success: true })
            } catch (e: any) {
              actions.push({ label: cv.label, verdict: 'stop_and_delete', action: e.message, success: false })
            }
          } else {
            actions.push({ label: cv.label, verdict: 'stop_and_delete', action: 'หยุดอยู่แล้ว', success: true })
          }
          break
        }

        case 'keep_running': {
          actions.push({ label: cv.label, verdict: 'keep_running', action: 'ปล่อยต่อ ไม่เปลี่ยนแปลง', success: true })
          break
        }
      }
    }

    // Mark AI analysis as action taken
    const campaignIds = campaigns.map((c: any) => c.id)
    await supabase
      .from('ai_analyses')
      .update({ action_taken: true, action_at: new Date().toISOString() })
      .in('campaign_id', campaignIds)
      .eq('action_taken', false)

    // Notify user
    const successCount = actions.filter(a => a.success).length
    await supabase.from('notifications').insert({
      user_id: testGroup.user_id,
      type: 'ai_action',
      title: 'AI จัดสรรงบ A/B Test แล้ว',
      message: `ดำเนินการ ${successCount}/${actions.length} รายการสำเร็จ`,
    })

    return NextResponse.json({ success: true, actions })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
