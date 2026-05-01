// CRUD quick replies
import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin, getUserIdFromFbToken } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.accessToken) return NextResponse.json({ replies: [] })
    const userId = await getUserIdFromFbToken(session.accessToken as string)
    if (!userId) return NextResponse.json({ replies: [] })

    const sb = supabaseAdmin()
    const { data } = await sb
      .from('quick_replies')
      .select('*')
      .eq('user_id', userId)
      .order('use_count', { ascending: false })

    return NextResponse.json({ replies: data || [] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message, replies: [] }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.accessToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const userId = await getUserIdFromFbToken(session.accessToken as string)
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { shortcut, title, message, pageId } = await req.json()
    if (!shortcut || !title || !message) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    const sb = supabaseAdmin()
    const { data, error } = await sb
      .from('quick_replies')
      .insert({ user_id: userId, page_id: pageId || null, shortcut, title, message })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ success: true, reply: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.accessToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const userId = await getUserIdFromFbToken(session.accessToken as string)
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const sb = supabaseAdmin()
    await sb.from('quick_replies').delete().eq('id', id).eq('user_id', userId)
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
