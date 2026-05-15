// GET /api/me — current user info + role context
// Frontend ใช้ตัดสินใจ render owner-only vs agent-only UI
import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { getCurrentUserContext } from '@/lib/team'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.accessToken) {
      return NextResponse.json({ authenticated: false }, { status: 401 })
    }

    const ctx = await getCurrentUserContext(session.accessToken as string, (session as any).fbUserId)
    if (!ctx) return NextResponse.json({ authenticated: false }, { status: 401 })

    const sb = supabaseAdmin()
    const { data: user } = await sb
      .from('users')
      .select('id, name, email, image, facebook_id')
      .eq('id', ctx.userId)
      .single()

    return NextResponse.json({
      authenticated: true,
      user: {
        id: ctx.userId,
        name: user?.name || (session.user as any)?.name || null,
        email: user?.email || (session.user as any)?.email || null,
        image: user?.image || (session.user as any)?.image || null,
        facebookId: user?.facebook_id || ctx.fbUserId,
      },
      role: {
        isOwner: ctx.isOwner,
        isAgentOnly: ctx.isAgentOnly,
        ownedPageCount: ctx.ownedPageIds.size,
        accessiblePageCount: ctx.accessiblePageIds.size,
      },
    })
  } catch (err: any) {
    return NextResponse.json({ authenticated: false, error: err.message }, { status: 500 })
  }
}
