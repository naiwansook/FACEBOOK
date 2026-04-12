// src/lib/ai-analyzer.ts
// ใช้ Claude AI วิเคราะห์ผล Facebook Ads

import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

/** Safely parse JSON from AI response, with fallback */
function safeParseJSON(raw: string, fallback: any): any {
  const cleaned = raw.replace(/```json|```/g, '').trim()
  // Extract JSON object
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return fallback

  try {
    return JSON.parse(jsonMatch[0])
  } catch {
    // Try to fix truncated JSON
    let fixed = jsonMatch[0]
    // Close unclosed strings
    const quotes = (fixed.match(/"/g) || []).length
    if (quotes % 2 !== 0) fixed += '"'
    // Close brackets/braces
    const openBrackets = (fixed.match(/\[/g) || []).length - (fixed.match(/\]/g) || []).length
    const openBraces = (fixed.match(/\{/g) || []).length - (fixed.match(/\}/g) || []).length
    for (let i = 0; i < openBrackets; i++) fixed += ']'
    for (let i = 0; i < openBraces; i++) fixed += '}'
    try {
      return JSON.parse(fixed)
    } catch {
      console.error('[ai-analyzer] JSON parse failed, using fallback. Raw:', raw.slice(0, 200))
      return fallback
    }
  }
}

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
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
  const cleaned = text.replace(/```json|```/g, '').trim()

  // Extract JSON object even if there's extra text
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('AI ไม่ได้ตอบเป็น JSON')

  let parsed: any
  try {
    parsed = JSON.parse(jsonMatch[0])
  } catch {
    // If JSON is truncated, try to fix common issues
    let fixedJson = jsonMatch[0]
    // Close unclosed strings and arrays
    const openBrackets = (fixedJson.match(/\[/g) || []).length - (fixedJson.match(/\]/g) || []).length
    const openBraces = (fixedJson.match(/\{/g) || []).length - (fixedJson.match(/\}/g) || []).length
    if (fixedJson.endsWith('"')) fixedJson += ']'
    for (let i = 0; i < openBrackets; i++) fixedJson += ']'
    for (let i = 0; i < openBraces; i++) fixedJson += '}'
    try {
      parsed = JSON.parse(fixedJson)
    } catch {
      // Fallback result
      parsed = {
        recommendation: 'keep_running',
        confidence: 0.5,
        summary: 'ยังมีข้อมูลไม่เพียงพอ รอให้แอดวิ่งสัก 24-48 ชม. ก่อนวิเคราะห์',
        reasoning: 'แอดเพิ่งเริ่มต้น ยังไม่มีข้อมูล performance เพียงพอ',
        actionItems: ['รอให้แอดวิ่งอย่างน้อย 24 ชม.', 'กลับมาวิเคราะห์อีกครั้ง'],
      }
    }
  }

  return {
    recommendation: parsed.recommendation,
    confidence: parsed.confidence,
    summary: parsed.summary,
    reasoning: parsed.reasoning,
    actionItems: parsed.actionItems || [],
  }
}

// ============================================
// AI Auto-Targeting: วิเคราะห์โพสต์แล้วเลือก targeting อัตโนมัติ
// ============================================

export interface AITargetingResult {
  objective: string
  targeting: {
    ageMin: number
    ageMax: number
    genders: number[]
    geoLocations: { countries: string[] }
    interests?: { id: string; name: string }[]
  }
  reasoning: string
}

/** AI อ่านโพสต์แล้วเลือก targeting ที่ดีที่สุดให้ (ใช้กับยิงแอดปกติ) */
export async function generateAutoTargeting(context: {
  postMessage: string
  postImage?: boolean
  pageCategory?: string
  pageName: string
}): Promise<AITargetingResult> {
  const prompt = `คุณเป็น Facebook Ads Expert ระดับ Senior ในตลาดไทย

## ข้อมูลโพสต์
- เพจ: ${context.pageName} (หมวด: ${context.pageCategory || 'ไม่ระบุ'})
- เนื้อหา: "${context.postMessage || 'ไม่มีข้อความ'}"
- มีรูป: ${context.postImage ? 'มี' : 'ไม่มี'}

## สิ่งที่ต้องทำ
วิเคราะห์เนื้อหาโพสต์อย่างละเอียด แล้วเลือก targeting ที่ดีที่สุดเพียง 1 แบบ:

1. เลือก objective ที่เหมาะสมที่สุด
2. เลือกช่วงอายุ กลุ่มเพศ ความสนใจ ที่ตรงกับเนื้อหาโพสต์มากที่สุด

## กฎ
- ageMin ต่ำสุด 18, ageMax สูงสุด 65
- genders: [] = ทั้งหมด, [1] = ชาย, [2] = หญิง
- countries ใช้ ['TH'] เสมอ
- objective เลือกจาก: POST_ENGAGEMENT, LINK_CLICKS, REACH
- interests ใส่ชื่อที่ Facebook น่าจะมี

ตอบ JSON เท่านั้น (ห้าม markdown ห้าม backticks):
{
  "objective": "POST_ENGAGEMENT",
  "targeting": {
    "ageMin": 20,
    "ageMax": 45,
    "genders": [],
    "geoLocations": { "countries": ["TH"] },
    "interests": [{"id": "6003139266461", "name": "Shopping"}]
  },
  "reasoning": "เหตุผลสั้นๆ 1-2 ประโยค ภาษาไทย"
}`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 800,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
  const parsed = safeParseJSON(text, {
    objective: 'POST_ENGAGEMENT',
    targeting: { ageMin: 20, ageMax: 45, genders: [], geoLocations: { countries: ['TH'] } },
    reasoning: 'ใช้ค่าเริ่มต้น เนื่องจาก AI ตอบกลับไม่สมบูรณ์',
  })

  return {
    objective: parsed.objective || 'POST_ENGAGEMENT',
    targeting: {
      ageMin: parsed.targeting?.ageMin || 18,
      ageMax: parsed.targeting?.ageMax || 65,
      genders: parsed.targeting?.genders || [],
      geoLocations: parsed.targeting?.geoLocations || { countries: ['TH'] },
      interests: parsed.targeting?.interests,
    },
    reasoning: parsed.reasoning || '',
  }
}

// ============================================
// AI A/B Test: วิเคราะห์โพสต์ + สร้าง Variants
// ============================================

export interface PostContext {
  postMessage: string
  postImage?: string
  pageCategory?: string
  pageName: string
  existingReactions?: number
  existingComments?: number
  existingShares?: number
}

export interface TestVariant {
  label: string           // เช่น "A: วัยรุ่นชอบช้อป"
  strategy: string        // คำอธิบายกลยุทธ์
  objective: string       // POST_ENGAGEMENT, LINK_CLICKS, REACH
  targeting: {
    ageMin: number
    ageMax: number
    genders: number[]     // [] = ทั้งหมด, [1] = ชาย, [2] = หญิง
    geoLocations: { countries: string[] }
    interests?: { id: string; name: string }[]
  }
  budgetPercent: number   // % ของงบรวม เช่น 25 = 25%
  reasoning: string       // เหตุผลที่ AI เลือก
}

export interface ABTestPlan {
  postAnalysis: string          // AI วิเคราะห์เนื้อหาโพสต์
  recommendedBudget: number     // งบที่แนะนำต่อวัน (บาท)
  recommendedDays: number       // จำนวนวันที่แนะนำ
  variants: TestVariant[]       // 3-4 variants
}

/** AI อ่านโพสต์ + เพจ แล้วสร้าง Test Variants */
export async function generateTestVariants(context: PostContext): Promise<ABTestPlan> {
  const prompt = `คุณเป็น Facebook Ads Strategist ระดับ Senior มีประสบการณ์ 10+ ปี ในตลาดไทย

## ข้อมูลโพสต์ที่จะยิงแอด
- เพจ: ${context.pageName} (หมวด: ${context.pageCategory || 'ไม่ระบุ'})
- เนื้อหาโพสต์: "${context.postMessage || 'ไม่มีข้อความ'}"
- มีรูปภาพ: ${context.postImage ? 'มี' : 'ไม่มี'}
- Engagement ปัจจุบัน: ${context.existingReactions || 0} reactions, ${context.existingComments || 0} comments, ${context.existingShares || 0} shares

## สิ่งที่ต้องทำ
วิเคราะห์เนื้อหาโพสต์อย่างละเอียด แล้วออกแบบ A/B Test 3-4 แบบที่แตกต่างกัน โดย:

1. **วิเคราะห์โพสต์** - เนื้อหาพูดถึงอะไร? กลุ่มเป้าหมายน่าจะเป็นใคร? จุดขายคืออะไร?
2. **ออกแบบ Variants** - สร้าง 3-4 กลุ่มเป้าหมายที่แตกต่างกันชัดเจน เช่น:
   - แบ่งตามอายุ (วัยรุ่น vs คนทำงาน vs ผู้ใหญ่)
   - แบ่งตามเพศ (ถ้าเนื้อหาเหมาะ)
   - แบ่งตามความสนใจ (interests ที่ต่างกัน)
   - แบ่งตาม objective (engagement vs reach vs clicks)
3. **จัดสรรงบ** - แบ่ง % งบให้แต่ละ variant (รวม = 100%)

## กฎ
- ageMin ต่ำสุด = 18, ageMax สูงสุด = 65
- genders: [] = ทั้งหมด, [1] = ชาย, [2] = หญิง
- countries ใช้ ['TH'] เสมอ
- interests ให้ใส่ ID จริงของ Facebook (ถ้ารู้) หรือใส่ชื่อที่ Facebook น่าจะมี
- budgetPercent ของทุก variant รวมกัน = 100
- objective เลือกจาก: POST_ENGAGEMENT, LINK_CLICKS, REACH
- แนะนำงบและจำนวนวันที่เหมาะสมตามเนื้อหาโพสต์

ตอบในรูปแบบ JSON เท่านั้น (ห้าม markdown ห้าม backticks):
{
  "postAnalysis": "วิเคราะห์เนื้อหาโพสต์ 2-3 ประโยค ภาษาไทย",
  "recommendedBudget": 200,
  "recommendedDays": 7,
  "variants": [
    {
      "label": "A: ชื่อกลุ่มสั้นๆ",
      "strategy": "อธิบายกลยุทธ์ 1-2 ประโยค",
      "objective": "POST_ENGAGEMENT",
      "targeting": {
        "ageMin": 18,
        "ageMax": 30,
        "genders": [],
        "geoLocations": { "countries": ["TH"] },
        "interests": [{"id": "6003139266461", "name": "Shopping"}]
      },
      "budgetPercent": 30,
      "reasoning": "เหตุผลที่เลือกกลุ่มนี้"
    }
  ]
}`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 3000,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
  const parsed = safeParseJSON(text, {
    postAnalysis: 'AI ไม่สามารถวิเคราะห์ได้ ใช้ค่าเริ่มต้น',
    recommendedBudget: 200,
    recommendedDays: 7,
    variants: [
      { label: 'A: กลุ่มทั่วไป', strategy: 'กลุ่มเป้าหมายกว้าง', objective: 'POST_ENGAGEMENT', targeting: { ageMin: 20, ageMax: 45, genders: [], geoLocations: { countries: ['TH'] } }, budgetPercent: 40, reasoning: 'กลุ่มกว้างเพื่อทดสอบ' },
      { label: 'B: วัยรุ่น', strategy: 'เน้นวัยรุ่น', objective: 'POST_ENGAGEMENT', targeting: { ageMin: 18, ageMax: 28, genders: [], geoLocations: { countries: ['TH'] } }, budgetPercent: 30, reasoning: 'ทดสอบกลุ่มวัยรุ่น' },
      { label: 'C: คนทำงาน', strategy: 'เน้นวัยทำงาน', objective: 'POST_ENGAGEMENT', targeting: { ageMin: 28, ageMax: 50, genders: [], geoLocations: { countries: ['TH'] } }, budgetPercent: 30, reasoning: 'ทดสอบกลุ่มวัยทำงาน' },
    ],
  })

  return {
    postAnalysis: parsed.postAnalysis,
    recommendedBudget: parsed.recommendedBudget || 200,
    recommendedDays: parsed.recommendedDays || 7,
    variants: parsed.variants || [],
  }
}

// ============================================
// AI A/B Test: เปรียบเทียบ Variants
// ============================================

export interface VariantPerformance {
  campaignId: string
  variantLabel: string
  strategy: string
  spend: number
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

export interface ABTestComparison {
  overallSummary: string
  variants: {
    campaignId: string
    label: string
    score: number            // 0-100 คะแนนรวม
    verdict: 'scale_up' | 'keep_running' | 'reduce' | 'stop_and_delete'
    reason: string
    suggestedBudgetChange?: number  // % เปลี่ยนงบ เช่น +50, -30
  }[]
  bestVariant: string        // campaignId ของ variant ที่ดีที่สุด
  worstVariant: string       // campaignId ของ variant ที่แย่ที่สุด
  shouldReallocate: boolean  // ควรจัดสรรงบใหม่หรือยัง
  reallocationPlan?: string  // คำแนะนำการจัดสรรงบ
}

/** AI เปรียบเทียบผล variants ใน AB Test */
export async function compareTestVariants(
  variants: VariantPerformance[],
  totalBudget: number,
  daysRunning: number
): Promise<ABTestComparison> {
  const variantsInfo = variants.map((v, i) => `
### Variant ${v.variantLabel}
- ใช้งบไป: ${v.spend.toFixed(2)} บาท
- Impressions: ${v.impressions.toLocaleString()}
- Reach: ${v.reach.toLocaleString()}
- Clicks: ${v.clicks.toLocaleString()}
- CTR: ${v.ctr.toFixed(2)}%
- CPM: ${v.cpm.toFixed(2)} บาท
- CPC: ${v.cpc.toFixed(2)} บาท
- Frequency: ${v.frequency.toFixed(2)}
- Engagement: ${v.engagement} (Likes: ${v.likes}, Comments: ${v.comments}, Shares: ${v.shares})
`).join('\n')

  const prompt = `คุณเป็น Facebook Ads Optimization Expert เปรียบเทียบผล A/B Test ต่อไปนี้

## ข้อมูลการทดสอบ
- งบรวมต่อวัน: ${totalBudget} บาท
- วิ่งมาแล้ว: ${daysRunning} วัน

## ผล Variants ทั้งหมด
${variantsInfo}

## เกณฑ์ Thailand Market
- CTR ดี: > 1.5% | ปานกลาง: 0.8-1.5% | ต่ำ: < 0.8%
- CPM ดี: < 80 บาท | ปานกลาง: 80-150 บาท | สูง: > 150 บาท
- CPC ดี: < 5 บาท | ปานกลาง: 5-15 บาท | แพง: > 15 บาท

## สิ่งที่ต้องทำ
1. ให้คะแนนแต่ละ variant (0-100) โดยพิจารณา CTR, CPC, CPM, engagement
2. ตัดสินว่าแต่ละ variant ควร: scale_up (เพิ่มงบ), keep_running (ปล่อยต่อ), reduce (ลดงบ), stop_and_delete (หยุดและลบ)
3. แนะนำการจัดสรรงบใหม่ (ถ้าควร)
4. ถ้าวิ่งมาน้อยกว่า 2 วัน → ให้ keep_running ทุกตัวก่อน เพราะข้อมูลยังไม่พอ

ตอบในรูปแบบ JSON (ห้าม markdown ห้าม backticks):
{
  "overallSummary": "สรุปรวม 2-3 ประโยค ภาษาไทย",
  "variants": [
    {
      "campaignId": "uuid-here",
      "label": "A: ชื่อกลุ่ม",
      "score": 85,
      "verdict": "scale_up",
      "reason": "เหตุผล 1-2 ประโยค",
      "suggestedBudgetChange": 50
    }
  ],
  "bestVariant": "uuid-of-best",
  "worstVariant": "uuid-of-worst",
  "shouldReallocate": true,
  "reallocationPlan": "คำแนะนำการจัดสรรงบใหม่"
}`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
  const parsed = safeParseJSON(text, {
    overallSummary: 'ยังมีข้อมูลไม่เพียงพอ รอให้แอดวิ่งต่อ',
    variants: [],
    bestVariant: '',
    worstVariant: '',
    shouldReallocate: false,
  })

  return {
    overallSummary: parsed.overallSummary,
    variants: parsed.variants || [],
    bestVariant: parsed.bestVariant,
    worstVariant: parsed.worstVariant,
    shouldReallocate: parsed.shouldReallocate || false,
    reallocationPlan: parsed.reallocationPlan,
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
