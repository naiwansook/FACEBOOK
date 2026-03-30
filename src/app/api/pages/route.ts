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

    const res = await fetch(
      `https://graph.facebook.com/v19.0/me/accounts?fields=id,name,access_token,picture.type(large)&access_token=${session.accessToken}`
    )
    const data = await res.json()

    if (data.error) {
      console.error('FB Pages Error:', data.error)
      return NextResponse.json({ pages: [] })
    }

    return NextResponse.json({ pages: data.data || [] })
  } catch (err: any) {
    return NextResponse.json({ pages: [] })
  }
}
