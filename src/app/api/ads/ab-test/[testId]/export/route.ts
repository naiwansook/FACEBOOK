import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: { testId: string } }) {
  try {
    const { createClient } = await import('@supabase/supabase-js')
    const XLSX = await import('xlsx')

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const testId = params.testId

    // Fetch test group
    const { data: testGroup, error: tgErr } = await supabase
      .from('ab_test_groups')
      .select('*')
      .eq('id', testId)
      .single()

    if (tgErr || !testGroup) {
      return NextResponse.json({ error: 'ไม่พบ A/B Test' }, { status: 404 })
    }

    // Fetch all campaigns in this test group
    const { data: campaigns } = await supabase
      .from('ad_campaigns')
      .select('*')
      .eq('test_group_id', testId)
      .order('variant_label', { ascending: true })

    if (!campaigns || campaigns.length === 0) {
      return NextResponse.json({ error: 'ไม่พบ variant' }, { status: 404 })
    }

    // Fetch performance for all campaigns
    const campaignIds = campaigns.map(c => c.id)
    const { data: allPerf } = await supabase
      .from('ad_performance')
      .select('*')
      .in('campaign_id', campaignIds)
      .order('fetched_at', { ascending: true })

    // Fetch AI analyses
    const { data: analyses } = await supabase
      .from('ai_analyses')
      .select('*')
      .in('campaign_id', campaignIds)
      .order('created_at', { ascending: true })

    // Goal labels
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

    // ── Sheet 1: สรุปภาพรวม A/B Test ──
    const postTitle = (testGroup.post_message || 'A/B Test').slice(0, 80)
    const totalDays = testGroup.duration_days || 7
    const totalBudget = (testGroup.total_daily_budget || 0) * totalDays

    // Get latest perf per campaign
    const latestPerf: Record<string, any> = {}
    for (const p of (allPerf || [])) {
      latestPerf[p.campaign_id] = p // last one wins (ordered by fetched_at asc)
    }

    let totalImpressions = 0, totalReach = 0, totalClicks = 0, totalSpend = 0
    let totalLikes = 0, totalComments = 0, totalShares = 0

    for (const c of campaigns) {
      const p = latestPerf[c.id]
      if (!p) continue
      totalImpressions += p.impressions || 0
      totalReach += p.reach || 0
      totalClicks += p.clicks || 0
      totalSpend += parseFloat(p.spend || 0)
      totalLikes += p.likes || 0
      totalComments += p.comments || 0
      totalShares += p.shares || 0
    }
    const totalEngagement = totalLikes + totalComments + totalShares
    const avgCTR = totalImpressions > 0 ? (totalClicks / totalImpressions * 100) : 0
    const avgCPC = totalClicks > 0 ? totalSpend / totalClicks : 0
    const avgCPM = totalImpressions > 0 ? (totalSpend / totalImpressions * 1000) : 0

    const summaryData: any[][] = [
      ['รายงานผล A/B Test - Facebook Ads'],
      [],
      ['ข้อมูล A/B Test', ''],
      ['โพสต์', postTitle],
      ['เป้าหมาย', goalLabels[campaigns[0]?.goal] || campaigns[0]?.goal || 'ไม่ระบุ'],
      ['จำนวน Variant', `${campaigns.length} กลุ่ม`],
      ['ระยะเวลา', `${totalDays} วัน`],
      ['งบรวมต่อวัน', `${testGroup.total_daily_budget} บาท`],
      ['งบรวมทั้งหมด', `${totalBudget} บาท`],
      ['สถานะ', testGroup.status === 'running' ? 'กำลังทดสอบ' : testGroup.status === 'completed' ? 'เสร็จสิ้น' : testGroup.status],
      [],
      ['ผลรวมทั้ง A/B Test', ''],
      ['การแสดงผลรวม', totalImpressions],
      ['การเข้าถึงรวม', totalReach],
      ['คลิกรวม', totalClicks],
      ['ใช้จ่ายรวม', `${totalSpend.toFixed(2)} บาท`],
      ['อัตราคลิกเฉลี่ย (CTR)', `${avgCTR.toFixed(2)}%`],
      ['ต้นทุนต่อคลิกเฉลี่ย (CPC)', `${avgCPC.toFixed(2)} บาท`],
      ['ต้นทุนต่อ 1,000 คน (CPM)', `${avgCPM.toFixed(2)} บาท`],
      [],
      ['การมีส่วนร่วมรวม', ''],
      ['ถูกใจรวม', totalLikes],
      ['ความคิดเห็นรวม', totalComments],
      ['แชร์รวม', totalShares],
      ['รวมการมีส่วนร่วม', totalEngagement],
      ['งบคงเหลือ', `${Math.max(0, totalBudget - totalSpend).toFixed(2)} บาท`],
    ]

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData)
    wsSummary['!cols'] = [{ wch: 30 }, { wch: 25 }]
    XLSX.utils.book_append_sheet(wb, wsSummary, 'สรุปภาพรวม')

    // ── Sheet 2: เปรียบเทียบ Variant ──
    const compareHeaders = [
      'Variant', 'งบ/วัน (บาท)', 'งบรวม (บาท)', 'ใช้จ่าย (บาท)', 'ใช้งบ (%)',
      'การแสดงผล', 'การเข้าถึง', 'คลิก', 'CTR (%)', 'CPC (บาท)', 'CPM (บาท)',
      'ความถี่', 'ถูกใจ', 'ความคิดเห็น', 'แชร์', 'การมีส่วนร่วม', 'ต้นทุน/ส่วนร่วม (บาท)'
    ]
    const compareRows = campaigns.map(c => {
      const p = latestPerf[c.id]
      const vBudget = (c.daily_budget || 0) * totalDays
      const spend = parseFloat(p?.spend || 0)
      const eng = (p?.likes || 0) + (p?.comments || 0) + (p?.shares || 0)
      return [
        c.variant_label || c.campaign_name,
        c.daily_budget || 0,
        vBudget,
        spend.toFixed(2),
        vBudget > 0 ? (spend / vBudget * 100).toFixed(1) : '0',
        p?.impressions || 0,
        p?.reach || 0,
        p?.clicks || 0,
        (p?.ctr || 0).toFixed(2),
        (p?.cpc || 0).toFixed(2),
        (p?.cpm || 0).toFixed(2),
        (p?.frequency || 0).toFixed(2),
        p?.likes || 0,
        p?.comments || 0,
        p?.shares || 0,
        eng,
        eng > 0 ? (spend / eng).toFixed(2) : '-',
      ]
    })

    // Add totals row
    compareRows.push([
      'รวมทั้งหมด',
      testGroup.total_daily_budget,
      totalBudget,
      totalSpend.toFixed(2),
      totalBudget > 0 ? (totalSpend / totalBudget * 100).toFixed(1) : '0',
      totalImpressions, totalReach, totalClicks,
      avgCTR.toFixed(2), avgCPC.toFixed(2), avgCPM.toFixed(2),
      '-', totalLikes, totalComments, totalShares, totalEngagement,
      totalEngagement > 0 ? (totalSpend / totalEngagement).toFixed(2) : '-',
    ])

    const wsCompare = XLSX.utils.aoa_to_sheet([compareHeaders, ...compareRows])
    wsCompare['!cols'] = compareHeaders.map(() => ({ wch: 18 }))
    XLSX.utils.book_append_sheet(wb, wsCompare, 'เปรียบเทียบ Variant')

    // ── Sheet 3: ข้อมูลรายช่วง (per variant) ──
    if (allPerf && allPerf.length > 0) {
      const timeHeaders = [
        'Variant', 'วันที่-เวลา', 'การแสดงผล', 'การเข้าถึง', 'คลิก',
        'ใช้จ่าย (บาท)', 'CTR (%)', 'CPC (บาท)', 'CPM (บาท)',
        'ถูกใจ', 'ความคิดเห็น', 'แชร์'
      ]
      const campaignLabelMap: Record<string, string> = {}
      for (const c of campaigns) {
        campaignLabelMap[c.id] = c.variant_label || c.campaign_name
      }
      const timeRows = allPerf.map((p: any) => [
        campaignLabelMap[p.campaign_id] || 'Unknown',
        new Date(p.fetched_at).toLocaleString('th-TH'),
        p.impressions || 0, p.reach || 0, p.clicks || 0,
        Number(p.spend || 0).toFixed(2),
        Number(p.ctr || 0).toFixed(2),
        Number(p.cpc || 0).toFixed(2),
        Number(p.cpm || 0).toFixed(2),
        p.likes || 0, p.comments || 0, p.shares || 0,
      ])

      const wsTime = XLSX.utils.aoa_to_sheet([timeHeaders, ...timeRows])
      wsTime['!cols'] = timeHeaders.map(() => ({ wch: 16 }))
      XLSX.utils.book_append_sheet(wb, wsTime, 'ข้อมูลรายช่วง')
    }

    // ── Sheet 4: AI วิเคราะห์ ──
    if (analyses && analyses.length > 0) {
      const recLabels: Record<string, string> = {
        keep_running: 'ปล่อยต่อ', increase_budget: 'เพิ่มงบ', decrease_budget: 'ลดงบ',
        change_targeting: 'เปลี่ยนกลุ่มเป้าหมาย', pause_ad: 'หยุดโฆษณา', extend_duration: 'ต่อเวลา',
      }
      const campaignLabelMap: Record<string, string> = {}
      for (const c of campaigns) { campaignLabelMap[c.id] = c.variant_label || c.campaign_name }

      const aiHeaders = ['Variant', 'วันที่', 'คำแนะนำ', 'ความมั่นใจ', 'สรุป']
      const aiRows = analyses.map((a: any) => [
        campaignLabelMap[a.campaign_id] || '-',
        new Date(a.created_at).toLocaleString('th-TH'),
        recLabels[a.recommendation] || a.recommendation,
        `${((a.confidence_score || 0) * 100).toFixed(0)}%`,
        a.summary || '',
      ])

      const wsAI = XLSX.utils.aoa_to_sheet([aiHeaders, ...aiRows])
      wsAI['!cols'] = [{ wch: 25 }, { wch: 20 }, { wch: 20 }, { wch: 12 }, { wch: 50 }]
      XLSX.utils.book_append_sheet(wb, wsAI, 'AI วิเคราะห์')
    }

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    const fileName = encodeURIComponent(`AB_Test_${postTitle.slice(0, 30)}_${new Date().toISOString().split('T')[0]}.xlsx`)

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
