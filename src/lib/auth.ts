import FacebookProvider from 'next-auth/providers/facebook'

const FB_API = 'https://graph.facebook.com/v19.0'

/** แลก short-lived user token (1-2 ชม.) เป็น long-lived (~60 วัน) — ปลอดภัย return null ถ้า fail */
async function exchangeForLongLivedToken(shortLivedToken: string): Promise<string | null> {
  if (!shortLivedToken) return null
  try {
    const url = `${FB_API}/oauth/access_token?grant_type=fb_exchange_token&client_id=${process.env.FACEBOOK_CLIENT_ID}&client_secret=${process.env.FACEBOOK_CLIENT_SECRET}&fb_exchange_token=${shortLivedToken}`
    // 5s timeout — ป้องกัน OAuth callback hang
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 5000)
    const res = await fetch(url, { signal: ctrl.signal })
    clearTimeout(timer)
    const data = await res.json()
    if (data.error || !data.access_token) return null
    return data.access_token as string
  } catch {
    return null
  }
}

export const authOptions = {
  providers: [
    FacebookProvider({
      clientId: process.env.FACEBOOK_CLIENT_ID!,
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: 'business_management,ads_management,ads_read,pages_show_list,pages_read_engagement,pages_read_user_content,pages_manage_metadata,pages_manage_posts,pages_messaging',
          auth_type: 'rerequest',
        },
      },
    }),
  ],
  // Session 60 วัน — match กับ FB long-lived token
  session: { strategy: 'jwt' as const, maxAge: 60 * 24 * 60 * 60 },
  callbacks: {
    async session({ session, token }: any) {
      session.accessToken = token.accessToken
      return session
    },
    async jwt({ token, account }: any) {
      if (account?.access_token) {
        // เก็บ short-lived ก่อนเสมอ (กันพลาด)
        token.accessToken = account.access_token
        // พยายามแลก long-lived — ถ้าไม่สำเร็จก็ใช้ short-lived ที่เก็บไว้
        const longLived = await exchangeForLongLivedToken(account.access_token)
        if (longLived) token.accessToken = longLived
      }
      return token
    },
  },
  pages: {
    signIn: '/login',
  },
}
