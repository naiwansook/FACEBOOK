import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const FB = 'https://graph.facebook.com/v19.0'

/** ลบ campaigns ที่ค้างใน Facebook (ไม่มี ad ข้างใน) */
export async function POST() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.accessToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const userToken = session.accessToken as string

    // 1. Get user's ad account
    const accRes = await fetch(`${FB}/me/adaccounts?fields=id&limit=5&access_token=${userToken}`)
    const accData = await accRes.json()
    if (accData.error || !accData.data?.length) {
      return NextResponse.json({ error: 'ไม่พบ Ad Account' }, { status: 400 })
    }
    const adAccountId = accData.data[0].id

    // 2. Get all campaigns
    const campRes = await fetch(
      `${FB}/${adAccountId}/campaigns?fields=id,name,status,effective_status,ads{id}&limit=50&access_token=${userToken}`
    )
    const campData = await campRes.json()
    if (campData.error) {
      return NextResponse.json({ error: campData.error.message }, { status: 400 })
    }

    // 3. Find orphaned campaigns (no ads inside, or status=PAUSED with no delivery)
    const orphaned = (campData.data || []).filter((c: any) => {
      const hasAds = c.ads?.data?.length > 0
      return !hasAds // No ads = orphaned
    })

    // 4. Delete orphaned campaigns
    const deleted: string[] = []
    const errors: string[] = []

    for (const camp of orphaned) {
      try {
        const r = await fetch(`${FB}/${camp.id}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ access_token: userToken }),
        })
        const d = await r.json()
        if (d.error) {
          errors.push(`${camp.name}: ${d.error.message}`)
        } else {
          deleted.push(camp.name || camp.id)
        }
      } catch (e: any) {
        errors.push(`${camp.name}: ${e.message}`)
      }
    }

    return NextResponse.json({
      success: true,
      totalCampaigns: campData.data?.length || 0,
      orphanedFound: orphaned.length,
      deleted,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
