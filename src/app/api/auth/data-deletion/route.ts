import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    url: 'https://fb-ads-manager.vercel.app/',
    confirmation_code: 'data-deletion-request',
    message: 'หากต้องการลบข้อมูลของคุณ กรุณาติดต่อผู้ดูแลระบบ',
  })
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const confirmationCode = `del-${Date.now()}`

    return NextResponse.json({
      url: 'https://fb-ads-manager.vercel.app/',
      confirmation_code: confirmationCode,
    })
  } catch {
    return NextResponse.json({
      url: 'https://fb-ads-manager.vercel.app/',
      confirmation_code: 'error',
    })
  }
}
