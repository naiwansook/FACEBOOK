import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const pageToken = searchParams.get('pageToken')
    const pageId = searchParams.get('pageId')

    if (!pageToken || !pageId) {
      return NextResponse.json({ posts: [] })
    }

    const res = await fetch(
      `https://graph.facebook.com/v19.0/${pageId}/posts?fields=id,message,story,full_picture,created_time,reactions.summary(true)&limit=20&access_token=${pageToken}`
    )
    const data = await res.json()

    if (data.error) {
      console.error('FB Posts Error:', data.error)
      return NextResponse.json({ error: data.error.message, posts: [] })
    }

    return NextResponse.json({ posts: data.data || [] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message, posts: [] })
  }
}
