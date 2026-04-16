import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const { createClient } = await import('@supabase/supabase-js')
    const XLSX = await import('xlsx')

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const campaignId = params.id

    // Fetch campaign data
    const { data: campaign, error: campErr } = await supabase
      .from('ad_campaigns')
      .select('*')
      .eq('id', campaignId)
      .single()

    if (campErr || !campaign) {
      return NextResponse.json({ error: 'ไม่พบแคมเปญ' }, { status: 404 })
    }

    // Fetch all performance snapshots
    const { data: perfData } = await supabase
      .from('ad_performance')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('fetched_at', { ascending: true })

    // Fetch AI analyses
    const { data: analyses } = await supabase
      .from('ai_analyses')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: true })

    // Goal config for Thai labels
    const goalLabels: Record<string, string> = {
      auto_engagement: 'อัตโนมัติ (เพิ่มการมีส่วนร่วม)',
      messages: 'เพิ่มข้อความ (Messenger)',
      sales_messages: 'ยอดขายผ่านแชท',
      leads_messages: 'เก็บข้อมูลลูกค้า',
      traffic: 'ผู้เยี่ยมชมเว็บ',
      calls: 'เพิ่มการโทร',
      reach: 'เข้าถึงมากสุด',
    }

    const wb = XLSX.utils.book_new()

    // ── Sheet 1: สรุปแคมเปญ ──
    const startDate = campaign.start_time ? new Date(campaign.start_time).toLocaleString('th-TH') : '-'
    const endDate = campaign.end_time ? new Date(campaign.end_time).toLocaleString('th-TH') : '-'
    const totalDays = campaign.start_time && campaign.end_time
      ? Math.ceil((new Date(campaign.end_time).getTime() - new Date(campaign.start_time).getTime()) / (1000 * 60 * 60 * 24))
      : 0
    const totalBudget = (campaign.daily_budget || 0) * totalDays

    const latestPerf = perfData?.length ? perfData[perfData.length - 1] : null
    const engagement = (latestPerf?.likes || 0) + (latestPerf?.comments || 0) + (latestPerf?.shares || 0)

    const summaryData = [
      ['รายงานผลโฆษณา Facebook'],
      [],
      ['ข้อมูลแคมเปญ', ''],
      ['ชื่อแคมเปญ', campaign.campaign_name],
      ['เป้าหมาย', goalLabels[campaign.goal] || campaign.goal || 'ไม่ระบุ'],
      ['สถานะ', campaign.status === 'active' ? 'กำลังวิ่ง' : campaign.status === 'paused' ? 'หยุดชั่วคราว' : campaign.status === 'completed' ? 'เสร็จสิ้น' : campaign.status],
      ['วันเริ่มต้น', startDate],
      ['วันสิ้นสุด', endDate],
      ['ระยะเวลา', `${totalDays} วัน`],
      ['งบต่อวัน', `${campaign.daily_budget} บาท`],
      ['งบรวมทั้งหมด', `${totalBudget} บาท`],
      [],
      ['ผลลัพธ์รวม', ''],
      ['การแสดงผล (Impressions)', latestPerf?.impressions || 0],
      ['การเข้าถึง (Reach)', latestPerf?.reach || 0],
      ['คลิก (Clicks)', latestPerf?.clicks || 0],
      ['ใช้จ่ายแล้ว (Spend)', `${latestPerf?.spend || 0} บาท`],
      ['อัตราคลิก (CTR)', `${(latestPerf?.ctr || 0).toFixed(2)}%`],
      ['ต้นทุนต่อคลิก (CPC)', `${(latestPerf?.cpc || 0).toFixed(2)} บาท`],
      ['ต้นทุนต่อ 1,000 คน (CPM)', `${(latestPerf?.cpm || 0).toFixed(2)} บาท`],
      ['ความถี่ต่อคน (Frequency)', (latestPerf?.frequency || 0).toFixed(2)],
      [],
      ['การมีส่วนร่วม', ''],
      ['ถูกใจ (Likes)', latestPerf?.likes || 0],
      ['ความคิดเห็น (Comments)', latestPerf?.comments || 0],
      ['แชร์ (Shares)', latestPerf?.shares || 0],
      ['รวมการมีส่วนร่วม', engagement],
      [],
      ['ประสิทธิภาพ', ''],
      ['ต้นทุนต่อการมีส่วนร่วม', engagement > 0 ? `${((latestPerf?.spend || 0) / engagement).toFixed(2)} บาท` : '-'],
      ['งบคงเหลือ', `${Math.max(0, totalBudget - (latestPerf?.spend || 0)).toFixed(2)} บาท`],
      ['ใช้งบไปแล้ว', totalBudget > 0 ? `${((latestPerf?.spend || 0) / totalBudget * 100).toFixed(1)}%` : '-'],
    ]

    // Add message-specific metrics if goal is messaging
    if (['messages', 'sales_messages', 'leads_messages'].includes(campaign.goal)) {
      summaryData.push(
        [],
        ['ผลลัพธ์ข้อความ', ''],
        ['ข้อความที่ได้รับ', latestPerf?.messages || 0],
        ['ต้นทุนต่อข้อความ', (latestPerf?.messages && latestPerf?.spend)
          ? `${(latestPerf.spend / latestPerf.messages).toFixed(2)} บาท` : '-'],
      )
    }

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData)
    // Set column widths
    wsSummary['!cols'] = [{ wch: 30 }, { wch: 25 }]
    XLSX.utils.book_append_sheet(wb, wsSummary, 'สรุปแคมเปญ')

    // ── Sheet 2: ข้อมูลรายวัน (Performance Timeline) ──
    if (perfData && perfData.length > 0) {
      const timelineHeaders = [
        'วันที่-เวลา', 'การแสดงผล', 'การเข้าถึง', 'คลิก',
        'ใช้จ่าย (บาท)', 'CTR (%)', 'CPC (บาท)', 'CPM (บาท)',
        'ความถี่', 'ถูกใจ', 'ความคิดเห็น', 'แชร์', 'การมีส่วนร่วม'
      ]
      const timelineRows = perfData.map((p: any) => [
        new Date(p.fetched_at).toLocaleString('th-TH'),
        p.impressions || 0,
        p.reach || 0,
        p.clicks || 0,
        Number(p.spend || 0).toFixed(2),
        Number(p.ctr || 0).toFixed(2),
        Number(p.cpc || 0).toFixed(2),
        Number(p.cpm || 0).toFixed(2),
        Number(p.frequency || 0).toFixed(2),
        p.likes || 0,
        p.comments || 0,
        p.shares || 0,
        (p.likes || 0) + (p.comments || 0) + (p.shares || 0),
      ])

      const wsTimeline = XLSX.utils.aoa_to_sheet([timelineHeaders, ...timelineRows])
      wsTimeline['!cols'] = timelineHeaders.map(() => ({ wch: 16 }))
      XLSX.utils.book_append_sheet(wb, wsTimeline, 'ข้อมูลรายช่วง')
    }

    // ── Sheet 3: AI วิเคราะห์ ──
    if (analyses && analyses.length > 0) {
      const recLabels: Record<string, string> = {
        keep_running: 'ปล่อยต่อ',
        increase_budget: 'เพิ่มงบ',
        decrease_budget: 'ลดงบ',
        change_targeting: 'เปลี่ยนกลุ่มเป้าหมาย',
        pause_ad: 'หยุดโฆษณา',
        extend_duration: 'ต่อเวลา',
      }
      const aiHeaders = ['วันที่', 'คำแนะนำ', 'ความมั่นใจ', 'สรุป', 'เหตุผล']
      const aiRows = analyses.map((a: any) => [
        new Date(a.created_at).toLocaleString('th-TH'),
        recLabels[a.recommendation] || a.recommendation,
        `${((a.confidence_score || 0) * 100).toFixed(0)}%`,
        a.summary || '',
        a.reasoning || '',
      ])

      const wsAI = XLSX.utils.aoa_to_sheet([aiHeaders, ...aiRows])
      wsAI['!cols'] = [{ wch: 20 }, { wch: 20 }, { wch: 12 }, { wch: 50 }, { wch: 50 }]
      XLSX.utils.book_append_sheet(wb, wsAI, 'AI วิเคราะห์')
    }

    // Generate Excel buffer
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

    const fileName = encodeURIComponent(`รายงาน_${campaign.campaign_name}_${new Date().toISOString().split('T')[0]}.xlsx`)

    return new Response(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${fileName}`,
      },
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
