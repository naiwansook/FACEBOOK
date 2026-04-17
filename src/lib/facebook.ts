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
// Interest Validation
// ============================================

/** ค้นหา interest จริงจาก Facebook Ad Interest Search API โดยใช้ชื่อ
 *  AI มักสร้าง interest IDs ปลอม — ฟังก์ชันนี้ใช้ชื่อค้นหา ID จริงแทน */
export async function validateInterests(
  accessToken: string,
  interests: { id: string; name: string }[]
): Promise<{ id: string; name: string }[]> {
  if (!interests || interests.length === 0) return []
  const valid: { id: string; name: string }[] = []
  const seen = new Set<string>() // ป้องกัน duplicate

  for (const interest of interests) {
    try {
      // ใช้ Ad Interest Search API ค้นหาจากชื่อ — ได้ ID จริงที่ใช้ targeting ได้
      const q = encodeURIComponent(interest.name)
      const r = await fetch(
        `${FB_API}/search?type=adinterest&q=${q}&limit=3&locale=th_TH&access_token=${accessToken}`
      )
      const d = await r.json()
      if (!d.error && d.data && d.data.length > 0) {
        // เอาตัวแรกที่ตรงที่สุด
        const match = d.data[0]
        if (!seen.has(match.id)) {
          seen.add(match.id)
          valid.push({ id: match.id, name: match.name })
        }
      }
    } catch {
      // ข้ามถ้า search ไม่ได้
    }
  }
  return valid
}

/** Alias for backward compat — same as validateInterests */
export async function resolveInterests(
  keywords: { id?: string; name: string }[],
  accessToken: string
): Promise<{ id: string; name: string }[]> {
  return validateInterests(accessToken, keywords.map(k => ({ id: k.id || '', name: k.name })))
}

// ============================================
// Ad Creation
// ============================================

/** สร้าง Campaign — ใช้ OUTCOME_AWARENESS เป็น default เพราะ compatible กับ post boost */
export async function createCampaign(
  adAccountId: string,
  pageToken: string,
  name: string,
  objective: string = 'OUTCOME_AWARENESS'
) {
  const res = await fetch(`${FB_API}/${adAccountId}/campaigns`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      objective,
      status: 'ACTIVE',
      buying_type: 'AUCTION',
      special_ad_categories: [],
      is_adset_budget_sharing_enabled: false,
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
    dailyBudget: number   // หน่วย: บาท (จะ convert เป็นสตางค์ในฟังก์ชัน)
    startTime: string     // ISO string
    endTime: string
    targeting: AdTargeting
    pageId: string
    optimizationGoal?: string
    billingEvent?: string
    destinationType?: string
  }
) {
  // Validate interests before using
  let validInterests = opts.targeting.interests || []
  if (validInterests.length > 0) {
    validInterests = await validateInterests(pageToken, validInterests)
  }

  // Targeting แบบเรียบง่าย — ไม่ใช้ targeting_automation เพราะ conflict กับบาง objective
  const targetingObj: any = {
    age_min: opts.targeting.ageMin || 18,
    age_max: 65,  // Advantage+ audience ต้องเป็น 65 เท่านั้น
    genders: opts.targeting.genders,
    geo_locations: opts.targeting.geoLocations || { countries: ['TH'] },
    targeting_automation: { advantage_audience: 1 },
  }

  // เพิ่ม interests ถ้ามี (validated แล้ว)
  if (validInterests.length > 0) {
    targetingObj.flexible_spec = [{ interests: validInterests }]
  }

  const adsetBody: any = {
    name: opts.name,
    campaign_id: campaignId,
    daily_budget: Math.round(opts.dailyBudget * 100),
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    start_time: opts.startTime,
    end_time: opts.endTime,
    billing_event: 'IMPRESSIONS',
    optimization_goal: 'REACH',
    targeting: targetingObj,
    promoted_object: { page_id: opts.pageId },
    access_token: pageToken,
    status: 'ACTIVE',
  }

  const res = await fetch(`${FB_API}/${adAccountId}/adsets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(adsetBody),
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error.error_user_msg || data.error.message)
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
    'actions', 'action_values', 'unique_clicks',
    'inline_link_clicks', 'inline_post_engagement',
    'date_start', 'date_stop'
  ].join(',')

  const res = await fetch(
    `${FB_API}/${campaignId}/insights?fields=${fields}&date_preset=maximum&access_token=${pageToken}`
  )
  const data = await res.json()
  if (data.error) throw new Error(data.error.message)
  return data.data?.[0] as FBInsights | null
}

/** แปลง insights raw → metrics สรุป (likes/comments/shares/messages ฯลฯ) ที่ตรงกับ Ads Manager */
export function parseInsightActions(insights: FBInsights | null | undefined) {
  const actions = insights?.actions || []
  const getAction = (type: string) => {
    const a = actions.find(x => x.action_type === type)
    return a ? Number(a.value) || 0 : 0
  }
  // Facebook action types — ตรงกับ FB Ads Manager
  const likes = getAction('like') + getAction('post_reaction')
  const comments = getAction('comment')
  const shares = getAction('post') // shares on post
  const postEngagement = getAction('post_engagement')
  const pageEngagement = getAction('page_engagement')
  // Messaging conversations (Messenger-destination ads)
  const messages = getAction('onsite_conversion.messaging_conversation_started_7d')
    || getAction('onsite_conversion.messaging_first_reply')
    || getAction('messaging_conversation_started_7d')
  // Link clicks (traffic ads)
  const linkClicks = Number(insights?.inline_link_clicks || 0) || getAction('link_click')
  // Phone calls
  const calls = getAction('click_to_call_call_confirm') || getAction('onsite_conversion.flow_complete')

  return { likes, comments, shares, postEngagement, pageEngagement, messages, linkClicks, calls }
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

/** ดึงสถานะจริงจาก Facebook ทั้ง 3 ระดับ + error details */
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
    errors: string[]
    fetchedAt: string
  } = { overall: 'UNKNOWN', errors: [], fetchedAt: new Date().toISOString() }

  const fetchStatus = async (id: string, level: string): Promise<{ status: string; effective_status: string } | null> => {
    try {
      const r = await fetch(`${FB_API}/${id}?fields=status,effective_status&access_token=${accessToken}`)
      const d = await r.json()
      if (d.error) {
        result.errors.push(`${level} (${id}): ${d.error.message}`)
        // Error code 100 (object not found) or 190 (token expired) means the object may have been deleted
        if (d.error.code === 100 || d.error.message?.includes('does not exist')) {
          return { status: 'DELETED', effective_status: 'DELETED' }
        }
        return null
      }
      return { status: d.status, effective_status: d.effective_status }
    } catch (e: any) {
      result.errors.push(`${level} (${id}): ${e.message}`)
      return null
    }
  }

  // Fetch all three in parallel for speed
  const [campaignData, adsetData, adData] = await Promise.all([
    fetchStatus(fbCampaignId, 'Campaign'),
    fbAdSetId ? fetchStatus(fbAdSetId, 'AdSet') : Promise.resolve(null),
    fbAdId ? fetchStatus(fbAdId, 'Ad') : Promise.resolve(null),
  ])

  if (campaignData) result.campaign = campaignData
  if (adsetData) result.adset = adsetData
  if (adData) result.ad = adData

  // Determine overall status — comprehensive mapping to FB Ads Manager statuses
  const statuses = [
    result.campaign?.effective_status,
    result.adset?.effective_status,
    result.ad?.effective_status,
  ].filter(Boolean) as string[]

  if (statuses.length === 0) {
    result.overall = 'UNKNOWN'
  } else if (statuses.some(s => s === 'DELETED')) {
    result.overall = 'DELETED'
  } else if (statuses.some(s => s === 'ARCHIVED')) {
    result.overall = 'ARCHIVED'
  } else if (statuses.some(s => s === 'DISAPPROVED')) {
    result.overall = 'DISAPPROVED'
  } else if (statuses.some(s => s === 'WITH_ISSUES' || s === 'ADSET_DISAPPROVED' || s === 'CAMPAIGN_DISAPPROVED')) {
    result.overall = 'WITH_ISSUES'
  } else if (statuses.some(s => s === 'PENDING_REVIEW' || s === 'IN_PROCESS' || s === 'PENDING_BILLING_INFO')) {
    result.overall = 'PENDING_REVIEW'
  } else if (statuses.some(s => s === 'PAUSED' || s === 'CAMPAIGN_PAUSED' || s === 'ADSET_PAUSED')) {
    result.overall = 'PAUSED'
  } else if (statuses.every(s => s === 'ACTIVE')) {
    result.overall = 'ACTIVE'
  } else {
    // Fallback: show the worst (non-active) status
    result.overall = statuses.find(s => s !== 'ACTIVE') || 'UNKNOWN'
  }

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

/** อัปเดต End Time ของ Ad Set */
export async function updateAdSetEndTime(
  adSetId: string,
  accessToken: string,
  endTime: string // ISO 8601
) {
  const params = new URLSearchParams({
    end_time: endTime,
    access_token: accessToken,
  })
  const res = await fetch(`${FB_API}/${adSetId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
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
  action_values?: { action_type: string; value: string }[]
  unique_clicks: string
  inline_link_clicks?: string
  inline_post_engagement?: string
  date_start: string
  date_stop: string
}
