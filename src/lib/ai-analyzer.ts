// src/lib/ai-analyzer.ts
// ใช้ Claude AI วิเคราะห์ผล Facebook Ads

import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

export interface AdMetrics {
  campaignName: string
  spend: number
  budget: number
  budgetRemaining: number
  daysRunning: number
  daysLeft: number
  impressions: number
  reach: number
  clicks: number
  ctr: number
  cpm: number
  cpc: number
  frequency: number
  engagement: number
  likes: number
  comments: number
  shares: number
}

export interface AIAnalysisResult {
  recommendation: 'increase_budget' | 'decrease_budget' | 'change_targeting' | 'pause_ad' | 'keep_running' | 'extend_duration'
  confidence: number
  summary: string
  reasoning: string
  actionItems: string[]
}

export async function analyzeAdPerformance(metrics: AdMetrics): Promise<AIAnalysisResult> {
  const prompt = `คุณเป็น Facebook Ads Expert มีประสบการณ์มากกว่า 10 ปี วิเคราะห์ผล Facebook Ads ต่อไปนี้และให้คำแนะนำเป็นภาษาไทย

## ข้อมูล Campaign
- ชื่อ Campaign: ${metrics.campaignName}
- งบที่ใช้ไปแล้ว: ${metrics.spend.toFixed(2)} บาท / ${metrics.budget.toFixed(2)} บาท
- งบคงเหลือ: ${metrics.budgetRemaining.toFixed(2)} บาท
- วันที่วิ่งไปแล้ว: ${metrics.daysRunning} วัน
- วันที่เหลือ: ${metrics.daysLeft} วัน

## Performance Metrics
- Impressions: ${metrics.impressions.toLocaleString()} ครั้ง
- Reach: ${metrics.reach.toLocaleString()} คน
- Clicks: ${metrics.clicks.toLocaleString()} ครั้ง
- CTR: ${metrics.ctr.toFixed(2)}%
- CPM: ${metrics.cpm.toFixed(2)} บาท
- CPC: ${metrics.cpc.toFixed(2)} บาท
- Frequency: ${metrics.frequency.toFixed(2)} (เฉลี่ยแต่ละคนเห็น ${metrics.frequency.toFixed(1)} ครั้ง)

## Engagement
- Likes/Reactions: ${metrics.likes}
- Comments: ${metrics.comments}
- Shares: ${metrics.shares}
- Total Engagement: ${metrics.engagement}

## เกณฑ์อ้างอิงสำหรับ Thailand Market
- CTR ดี: > 1.5% | ปานกลาง: 0.8-1.5% | ต่ำ: < 0.8%
- CPM ดี: < 80 บาท | ปานกลาง: 80-150 บาท | สูง: > 150 บาท
- CPC ดี: < 5 บาท | ปานกลาง: 5-15 บาท | แพง: > 15 บาท
- Frequency ดี: 1.5-3 | แพงเกิน: > 5 (คนเบื่อแล้ว)

วิเคราะห์และตอบในรูปแบบ JSON ดังนี้ (ห้าม markdown ห้าม backticks):
{
  "recommendation": "keep_running|increase_budget|decrease_budget|change_targeting|pause_ad|extend_duration",
  "confidence": 0.85,
  "summary": "สรุปสั้นๆ 1-2 ประโยค ภาษาไทย",
  "reasoning": "เหตุผลละเอียด 3-5 ประโยค วิเคราะห์ metrics แต่ละตัว",
  "actionItems": [
    "ขั้นตอนที่แนะนำ 1",
    "ขั้นตอนที่แนะนำ 2",
    "ขั้นตอนที่แนะนำ 3"
  ]
}`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1000,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
  const parsed = JSON.parse(text.replace(/```json|```/g, '').trim())

  return {
    recommendation: parsed.recommendation,
    confidence: parsed.confidence,
    summary: parsed.summary,
    reasoning: parsed.reasoning,
    actionItems: parsed.actionItems || [],
  }
}

// สีและ icon ตาม recommendation
export const recommendationConfig = {
  keep_running: {
    label: 'ปล่อยต่อไปเลย',
    color: 'text-green-400',
    bg: 'bg-green-400/10',
    border: 'border-green-400/30',
    icon: '✅',
  },
  increase_budget: {
    label: 'เพิ่มงบได้เลย',
    color: 'text-blue-400',
    bg: 'bg-blue-400/10',
    border: 'border-blue-400/30',
    icon: '💰',
  },
  extend_duration: {
    label: 'ต่อระยะเวลา',
    color: 'text-cyan-400',
    bg: 'bg-cyan-400/10',
    border: 'border-cyan-400/30',
    icon: '⏱️',
  },
  decrease_budget: {
    label: 'ลดงบก่อน',
    color: 'text-yellow-400',
    bg: 'bg-yellow-400/10',
    border: 'border-yellow-400/30',
    icon: '⚠️',
  },
  change_targeting: {
    label: 'เปลี่ยน Targeting',
    color: 'text-orange-400',
    bg: 'bg-orange-400/10',
    border: 'border-orange-400/30',
    icon: '🎯',
  },
  pause_ad: {
    label: 'หยุดโฆษณา',
    color: 'text-red-400',
    bg: 'bg-red-400/10',
    border: 'border-red-400/30',
    icon: '🛑',
  },
}
