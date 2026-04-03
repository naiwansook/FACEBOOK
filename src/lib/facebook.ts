// src/lib/facebook.ts
// Helper functions สำหรับ Facebook Graph API

const FB_API = 'https://graph.facebook.com/v19.0'

// ============================================
// Pages
// ============================================

/** ดึง Pages ทั้งหมดที่ User เป็น Admin */
export async function getUserPages(accessToken: string) {
  const res = await fetch(
    `${FB_API}/me/accounts?fields=id,name,access_token,picture,category&limit=50&access_token=${accessToken}`
  )
  const data = await res.json()
  if (data.error) throw new Error(data.error.message)
  return data.data as FacebookPage[]
}

/** ดึง Ad Account ของ Page */
export async function getAdAccount(pageId: string, pageToken: string) {
  const res = await fetch(
    `${FB_API}/${pageId}/adaccounts?fields=id,name,currency,account_status&access_token=${pageToken}`
  )
  const data = await res.json()
  if (data.error) throw new Error(data.error.message)
  return data.data?.[0] as AdAccount | null
}

// ============================================
// Posts
// ============================================

/** ดึง Posts จาก Page */
export async function getPagePosts(pageId: string, pageToken: string, limit = 20) {
  const fields = 'id,message,story,full_picture,permalink_url,created_time,attachments,shares,reactions.summary(true)'
  const res = await fetch(
    `${FB_API}/${pageId}/posts?fields=${fields}&limit=${limit}&access_token=${pageToken}`
  )
  const data = await res.json()
  if (data.error) throw new Error(data.error.message)
  return data.data as FacebookPost[]
}

// ============================================
// Ad Creation
// ============================================

/** สร้าง Campaign */
export async function createCampaign(
  adAccountId: string,
  pageToken: string,
  name: string
) {
  const res = await fetch(`${FB_API}/${adAccountId}/campaigns`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      objective: 'OUTCOME_ENGAGEMENT',
      status: 'ACTIVE',
      special_ad_categories: [],
      access_token: pageToken,
    }),
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error.message)
  return data.id as string
}

/** สร้าง Ad Set */
export async function createAdSet(
  adAccountId: string,
  pageToken: string,
  campaignId: string,
  opts: {
    name: string
    dailyBudget: number   // หน่วย: สตางค์ (THB * 100)
    startTime: string     // ISO string
    endTime: string
    targeting: AdTargeting
    pageId: string
  }
) {
  const res = await fetch(`${FB_API}/${adAccountId}/adsets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: opts.name,
      campaign_id: campaignId,
      daily_budget: Math.round(opts.dailyBudget * 100), // convert to satang
      start_time: opts.startTime,
      end_time: opts.endTime,
      billing_event: 'IMPRESSIONS',
      optimization_goal: 'ENGAGED_USERS',
      targeting: {
        age_min: opts.targeting.ageMin,
        age_max: opts.targeting.ageMax,
        genders: opts.targeting.genders,
        geo_locations: opts.targeting.geoLocations || { countries: ['TH'] },
        flexible_spec: opts.targeting.interests?.length
          ? [{ interests: opts.targeting.interests }]
          : undefined,
      },
      promoted_object: { page_id: opts.pageId },
      access_token: pageToken,
      status: 'ACTIVE',
    }),
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error.message)
  return data.id as string
}

/** สร้าง Ad Creative + Ad */
export async function createAd(
  adAccountId: string,
  pageToken: string,
  adSetId: string,
  opts: {
    name: string
    pageId: string
    postId: string  // Facebook Post ID (pageId_postId format)
  }
) {
  // สร้าง Creative จาก existing Post
  const creativeRes = await fetch(`${FB_API}/${adAccountId}/adcreatives`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: `Creative - ${opts.name}`,
      object_story_id: opts.postId,
      access_token: pageToken,
    }),
  })
  const creativeData = await creativeRes.json()
  if (creativeData.error) throw new Error(creativeData.error.message)

  // สร้าง Ad
  const adRes = await fetch(`${FB_API}/${adAccountId}/ads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: opts.name,
      adset_id: adSetId,
      creative: { creative_id: creativeData.id },
      status: 'ACTIVE',
      access_token: pageToken,
    }),
  })
  const adData = await adRes.json()
  if (adData.error) throw new Error(adData.error.message)
  return adData.id as string
}

// ============================================
// Performance / Insights
// ============================================

/** ดึง Insights ของ Campaign */
export async function getCampaignInsights(
  campaignId: string,
  pageToken: string
) {
  const fields = [
    'impressions', 'reach', 'clicks', 'spend',
    'cpm', 'cpc', 'ctr', 'frequency',
    'actions', 'unique_clicks', 'date_start', 'date_stop'
  ].join(',')

  const res = await fetch(
    `${FB_API}/${campaignId}/insights?fields=${fields}&date_preset=maximum&access_token=${pageToken}`
  )
  const data = await res.json()
  if (data.error) throw new Error(data.error.message)
  return data.data?.[0] as FBInsights | null
}

/** หยุด / เปิด Campaign */
export async function updateCampaignStatus(
  campaignId: string,
  accessToken: string,
  status: 'ACTIVE' | 'PAUSED'
) {
  const params = new URLSearchParams({ status, access_token: accessToken })
  const res = await fetch(`${FB_API}/${campaignId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error.message)
  return data.success as boolean
}

/** อัปเดตสถานะ object เดียว (ใช้ form-encoded ซึ่ง FB API ตอบรับดีกว่า JSON) */
async function fbUpdateStatus(objectId: string, accessToken: string, status: string): Promise<{ success: boolean; error?: string }> {
  try {
    const params = new URLSearchParams({ status, access_token: accessToken })
    const r = await fetch(`${FB_API}/${objectId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    })
    const d = await r.json()
    if (d.error) return { success: false, error: d.error.message }
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

/** เปิด/ปิด ทั้ง 3 ระดับ: Campaign → Ad Set → Ad (ตามลำดับ + delay) */
export async function updateAllStatus(
  accessToken: string,
  fbCampaignId: string,
  fbAdSetId?: string | null,
  fbAdId?: string | null,
  status: 'ACTIVE' | 'PAUSED' = 'ACTIVE'
) {
  const results: { campaign?: boolean; adset?: boolean; ad?: boolean; errors: string[] } = { errors: [] }

  // 1. Campaign ก่อน (parent ต้องเปิดก่อน child)
  const c = await fbUpdateStatus(fbCampaignId, accessToken, status)
  results.campaign = c.success
  if (!c.success && c.error) results.errors.push(`Campaign: ${c.error}`)

  // รอให้ FB propagate สถานะ campaign ก่อนเปิด adset
  await new Promise(r => setTimeout(r, 1500))

  // 2. Ad Set
  if (fbAdSetId) {
    const a = await fbUpdateStatus(fbAdSetId, accessToken, status)
    results.adset = a.success
    if (!a.success && a.error) results.errors.push(`AdSet: ${a.error}`)

    // รอให้ FB propagate สถานะ adset ก่อนเปิด ad
    await new Promise(r => setTimeout(r, 1500))
  }

  // 3. Ad
  if (fbAdId) {
    const a = await fbUpdateStatus(fbAdId, accessToken, status)
    results.ad = a.success
    if (!a.success && a.error) results.errors.push(`Ad: ${a.error}`)
  }

  return results
}

/** ดึงสถานะจริงจาก Facebook ทั้ง 3 ระดับ */
export async function getRealStatus(
  accessToken: string,
  fbCampaignId: string,
  fbAdSetId?: string | null,
  fbAdId?: string | null,
) {
  const result: {
    campaign?: { status: string; effective_status: string }
    adset?: { status: string; effective_status: string }
    ad?: { status: string; effective_status: string }
    overall: string
  } = { overall: 'UNKNOWN' }

  // Campaign status
  try {
    const r = await fetch(`${FB_API}/${fbCampaignId}?fields=status,effective_status&access_token=${accessToken}`)
    const d = await r.json()
    if (!d.error) result.campaign = { status: d.status, effective_status: d.effective_status }
  } catch {}

  // AdSet status
  if (fbAdSetId) {
    try {
      const r = await fetch(`${FB_API}/${fbAdSetId}?fields=status,effective_status&access_token=${accessToken}`)
      const d = await r.json()
      if (!d.error) result.adset = { status: d.status, effective_status: d.effective_status }
    } catch {}
  }

  // Ad status
  if (fbAdId) {
    try {
      const r = await fetch(`${FB_API}/${fbAdId}?fields=status,effective_status&access_token=${accessToken}`)
      const d = await r.json()
      if (!d.error) result.ad = { status: d.status, effective_status: d.effective_status }
    } catch {}
  }

  // Determine overall: all must be ACTIVE for ad to run
  const statuses = [
    result.campaign?.effective_status,
    result.adset?.effective_status,
    result.ad?.effective_status,
  ].filter(Boolean)

  if (statuses.length === 0) result.overall = 'UNKNOWN'
  else if (statuses.every(s => s === 'ACTIVE')) result.overall = 'ACTIVE'
  else if (statuses.some(s => s === 'PAUSED' || s === 'CAMPAIGN_PAUSED' || s === 'ADSET_PAUSED')) result.overall = 'PAUSED'
  else if (statuses.some(s => s === 'PENDING_REVIEW' || s === 'IN_PROCESS')) result.overall = 'PENDING_REVIEW'
  else if (statuses.some(s => s === 'DISAPPROVED')) result.overall = 'DISAPPROVED'
  else result.overall = statuses[statuses.length - 1] || 'UNKNOWN'

  return result
}

/** อัปเดต Daily Budget */
export async function updateAdSetBudget(
  adSetId: string,
  pageToken: string,
  dailyBudget: number
) {
  const res = await fetch(`${FB_API}/${adSetId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      daily_budget: Math.round(dailyBudget * 100),
      access_token: pageToken,
    }),
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error.message)
  return data.success as boolean
}

// ============================================
// Types
// ============================================

export interface FacebookPage {
  id: string
  name: string
  access_token: string
  picture?: { data?: { url: string } }
  category?: string
}

export interface AdAccount {
  id: string
  name: string
  currency: string
  account_status: number
}

export interface FacebookPost {
  id: string
  message?: string
  story?: string
  full_picture?: string
  permalink_url?: string
  created_time: string
  shares?: { count: number }
  reactions?: { summary?: { total_count: number } }
}

export interface AdTargeting {
  ageMin: number
  ageMax: number
  genders: number[]   // 1=ชาย, 2=หญิง, []= ทั้งหมด
  geoLocations?: { countries?: string[]; cities?: { key: string; name: string }[] }
  interests?: { id: string; name: string }[]
}

export interface FBInsights {
  impressions: string
  reach: string
  clicks: string
  spend: string
  cpm: string
  cpc: string
  ctr: string
  frequency: string
  actions?: { action_type: string; value: string }[]
  unique_clicks: string
  date_start: string
  date_stop: string
}
