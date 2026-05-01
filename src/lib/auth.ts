import FacebookProvider from 'next-auth/providers/facebook'

const FB_API = 'https://graph.facebook.com/v19.0'

async function exchangeForLongLivedToken(shortLivedToken: string): Promise<string | null> {
  if (!shortLivedToken) {
    console.error('[auth] exchange skipped: empty short-lived token')
    return null
  }
  if (!process.env.FACEBOOK_CLIENT_ID || !process.env.FACEBOOK_CLIENT_SECRET) {
    console.error('[auth] exchange aborted: FACEBOOK_CLIENT_ID/SECRET env not set on this deployment')
    return null
  }
  try {
    const url = `${FB_API}/oauth/access_token?grant_type=fb_exchange_token&client_id=${process.env.FACEBOOK_CLIENT_ID}&client_secret=${process.env.FACEBOOK_CLIENT_SECRET}&fb_exchange_token=${shortLivedToken}`
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 5000)
    const res = await fetch(url, { signal: ctrl.signal })
    clearTimeout(timer)
    const data = await res.json()
    if (data.error) {
      console.error('[auth] FB exchange returned error:', JSON.stringify(data.error))
      return null
    }
    if (!data.access_token) {
      console.error('[auth] FB exchange: no access_token in response:', JSON.stringify(data).slice(0, 300))
      return null
    }
    console.log(`[auth] exchange success — long-lived token received (expires_in=${data.expires_in})`)
    return data.access_token as string
  } catch (e: any) {
    console.error('[auth] exchange threw:', e?.name, e?.message)
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
          // ตั้งใจไม่ใส่ auth_type='rerequest' และ redirect_uri ตรงๆ:
          // - rerequest บังคับ FB ขอ permissions ใหม่ทุกครั้ง อาจ trigger
          //   error เมื่อ user เคยให้สิทธิ์แล้ว
          // - redirect_uri ปล่อยให้ NextAuth auto-detect จาก request
          //   (เพิ่มเข้าไปจะ error=OAuthCallback ถ้า NEXTAUTH_URL ไม่ตรง 100%)
        },
      },
    }),
  ],
  session: { strategy: 'jwt' as const, maxAge: 60 * 24 * 60 * 60 },
  callbacks: {
    async session({ session, token }: any) {
      session.accessToken = token.accessToken
      return session
    },
    async jwt({ token, account }: any) {
      // Initial login → save short-lived first, then try upgrade to long-lived
      if (account?.access_token) {
        token.accessToken = account.access_token
        token.tokenIssuedAt = Date.now()
        const longLived = await exchangeForLongLivedToken(account.access_token)
        if (longLived) {
          token.accessToken = longLived
          token.tokenIssuedAt = Date.now()
        }
        return token
      }

      // Subsequent requests → auto-refresh if token is older than 25 days
      // (Facebook allows re-exchanging long-lived for another long-lived,
      // resetting the 60-day clock. As long as user opens app once per 60d,
      // session never effectively expires.)
      const REFRESH_AFTER_MS = 25 * 24 * 60 * 60 * 1000
      if (token?.accessToken && token?.tokenIssuedAt) {
        const age = Date.now() - (token.tokenIssuedAt as number)
        if (age > REFRESH_AFTER_MS) {
          const refreshed = await exchangeForLongLivedToken(token.accessToken as string)
          if (refreshed) {
            token.accessToken = refreshed
            token.tokenIssuedAt = Date.now()
          }
        }
      }
      return token
    },
  },
  pages: {
    signIn: '/login',
  },
  // ─── Debug & error visibility ────────────────────────────────
  // เพิ่ม events handler เพื่อ log error ตัวจริงใน Vercel logs
  // (error=OAuthCallback ใน URL ไม่บอกอะไรเลย ต้องอ่าน server log)
  debug: true,
  events: {
    async signIn(message: any) {
      console.log('[auth.events.signIn]', { user: message?.user?.email || message?.user?.name, account: message?.account?.provider })
    },
    async signOut() {
      console.log('[auth.events.signOut]')
    },
  },
  logger: {
    error(code: string, metadata: any) {
      console.error('[auth.logger.error]', code, JSON.stringify(metadata)?.slice(0, 600))
    },
    warn(code: string) {
      console.warn('[auth.logger.warn]', code)
    },
  },
}
