import FacebookProvider from 'next-auth/providers/facebook'

const FB_API = 'https://graph.facebook.com/v19.0'

/** แลก short-lived user token (1-2 ชม.) เป็น long-lived (~60 วัน) */
async function exchangeForLongLivedToken(shortLivedToken: string): Promise<{ token: string; expiresIn: number } | null> {
  try {
    const url = `${FB_API}/oauth/access_token?grant_type=fb_exchange_token&client_id=${process.env.FACEBOOK_CLIENT_ID}&client_secret=${process.env.FACEBOOK_CLIENT_SECRET}&fb_exchange_token=${shortLivedToken}`
    const res = await fetch(url)
    const data = await res.json()
    if (data.error || !data.access_token) {
      console.error('[auth] Long-lived token exchange failed:', data.error)
      return null
    }
    return {
      token: data.access_token,
      expiresIn: data.expires_in || 5184000, // default 60 days
    }
  } catch (e: any) {
    console.error('[auth] Token exchange exception:', e.message)
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
          redirect_uri: `${process.env.NEXTAUTH_URL}/api/auth/callback/facebook`,
        },
      },
    }),
  ],
  // Session expires after 60 days (matching FB long-lived token)
  session: { strategy: 'jwt' as const, maxAge: 60 * 24 * 60 * 60 },
  jwt: { maxAge: 60 * 24 * 60 * 60 },
  callbacks: {
    async session({ session, token }: any) {
      session.accessToken = token.accessToken
      session.tokenExpiresAt = token.tokenExpiresAt
      return session
    },
    async jwt({ token, account }: any) {
      // ตอน initial login → แลก short-lived เป็น long-lived ทันที
      if (account?.access_token) {
        const longLived = await exchangeForLongLivedToken(account.access_token)
        if (longLived) {
          token.accessToken = longLived.token
          token.tokenExpiresAt = Date.now() + longLived.expiresIn * 1000
        } else {
          // fallback ใช้ short-lived ถ้า exchange fail
          token.accessToken = account.access_token
          token.tokenExpiresAt = Date.now() + 60 * 60 * 1000 // 1 ชม.
        }
      }
      return token
    },
  },
  pages: {
    signIn: '/login',
  },
}
