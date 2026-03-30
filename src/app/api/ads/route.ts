import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.accessToken) {
      return NextResponse.json({ campaigns: [] })
    }

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ campaigns: [] })
    }

    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    // Get Facebook user ID to find their user record
    const meRes = await fetch(
      `https://graph.facebook.com/v19.0/me?fields=id&access_token=${session.accessToken}`
    )
    const meData = await meRes.json()
    if (meData.error || !meData.id) {
      return NextResponse.json({ campaigns: [] })
    }

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('facebook_id', meData.id)
      .single()

    if (!user) {
      return NextResponse.json({ campaigns: [] })
    }

    const { data } = await supabase
      .from('ad_campaigns')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    return NextResponse.json({ campaigns: data || [] })
  } catch {
    return NextResponse.json({ campaigns: [] })
  }
}
