import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.accessToken) {
      return NextResponse.json({ pages: [] })
    }

    const FB = 'https://graph.facebook.com/v19.0'
    const fields = 'id,name,access_token,picture.type(large),category,fan_count,followers_count'
    const allPages: any[] = []

    // First request
    const firstRes = await fetch(
      `${FB}/me/accounts?fields=${fields}&limit=100&access_token=${session.accessToken}`
    )
    const firstData = await firstRes.json()
    if (firstData.error) {
      console.error('FB Pages Error:', firstData.error)
      return NextResponse.json({ pages: [] })
    }
    allPages.push(...(firstData.data || []))

    // Follow pagination if more pages exist
    let nextCursor: string | undefined = firstData.paging?.next
    while (nextCursor) {
      const pageRes = await fetch(nextCursor)
      const pageData = await pageRes.json()
      if (pageData.error) break
      allPages.push(...(pageData.data || []))
      nextCursor = pageData.paging?.next
    }

    return NextResponse.json({ pages: allPages })
  } catch (err: any) {
    return NextResponse.json({ pages: [] })
  }
}
