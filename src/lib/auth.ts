import FacebookProvider from 'next-auth/providers/facebook'

export const authOptions = {
  providers: [
    FacebookProvider({
      clientId: process.env.FACEBOOK_CLIENT_ID!,
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: 'business_management,ads_management,ads_read,pages_show_list,pages_read_engagement,pages_read_user_content,pages_manage_metadata,pages_manage_posts,pages_messaging',
          auth_type: 'rerequest',
          redirect_uri: `${process.env.NEXTAUTH_URL}/api/auth/callback/facebook`,
        },
      },
    }),
  ],
  // Session 60 วัน
  session: { strategy: 'jwt' as const, maxAge: 60 * 24 * 60 * 60 },
  callbacks: {
    async session({ session, token }: any) {
      session.accessToken = token.accessToken
      return session
    },
    async jwt({ token, account }: any) {
      if (account) {
        // เก็บ short-lived ก่อน (กันพลาด)
        let finalToken = account.access_token
        // พยายามแลก long-lived (60 วัน) — ห้าม block OAuth callback ถ้า fail
        try {
          const url = `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${process.env.FACEBOOK_CLIENT_ID}&client_secret=${process.env.FACEBOOK_CLIENT_SECRET}&fb_exchange_token=${account.access_token}`
          const ctrl = new AbortController()
          const timer = setTimeout(() => ctrl.abort(), 4000)
          const res = await fetch(url, { signal: ctrl.signal })
          clearTimeout(timer)
          const data = await res.json()
          if (data?.access_token) finalToken = data.access_token
        } catch {
          // เงียบไป — ใช้ short-lived แทน
        }
        token.accessToken = finalToken
      }
      return token
    },
  },
  pages: {
    signIn: '/login',
  },
}
