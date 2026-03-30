import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { postId, campaignName, dailyBudget, startDate, endDate } = body

    const { data: campaign, error } = await supabase
      .from('ad_campaigns')
      .insert({
        fb_post_id: postId,
        campaign_name: campaignName,
        daily_budget: dailyBudget,
        start_time: startDate,
        end_time: endDate,
        status: 'active',
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, campaignId: campaign.id })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}