import FacebookProvider from 'next-auth/providers/facebook'

const FB_API = 'https://graph.facebook.com/v19.0'

async function exchangeForLongLivedToken(
  shortLivedToken: string,
  timeoutMs = 5000,
): Promise<string | null> {
  if (!shortLivedToken) {
    console.error('[auth] exchange skipped — empty token')
    return null
  }
  if (!process.env.FACEBOOK_CLIENT_ID || !process.env.FACEBOOK_CLIENT_SECRET) {
    console.error('[auth] exchange aborted — missing FACEBOOK_CLIENT_ID/SECRET')
    return null
  }
  try {
    const url = `${FB_API}/oauth/access_token?grant_type=fb_exchange_token&client_id=${process.env.FACEBOOK_CLIENT_ID}&client_secret=${process.env.FACEBOOK_CLIENT_SECRET}&fb_exchange_token=${shortLivedToken}`
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    const res = await fetch(url, { signal: ctrl.signal })
    clearTimeout(timer)
    const data = await res.json()
    if (data.error) {
      console.error('[auth] exchange FB error:', JSON.stringify(data.error).slice(0, 400))
      return null
    }
    if (!data.access_token) {
      console.error('[auth] exchange no access_token in response:', JSON.stringify(data).slice(0, 300))
      return null
    }
    console.log(`[auth] exchange OK — long-lived token (expires_in=${data.expires_in})`)
    return data.access_token as string
  } catch (e: any) {
    console.error('[auth] exchange threw:', e?.name, e?.message)
    return null
  }
}

export const authOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    FacebookProvider({
      clientId: process.env.FACEBOOK_CLIENT_ID!,
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: 'business_management,ads_management,ads_read,pages_show_list,pages_read_engagement,pages_read_user_content,pages_manage_metadata,pages_manage_posts,pages_messaging',
        },
      },
      // 🎯 Override userinfo เพราะ default ของ next-auth v4.24.7 เรียก
      // https://graph.facebook.com/me (ไม่มี version) ด้วย Bearer header →
      // FB ตอบ 403 Forbidden → OAUTH_CALLBACK_ERROR
      // แก้: ใช้ v19 endpoint + ส่ง access_token เป็น query param แทน
      userinfo: {
        url: 'https://graph.facebook.com/v19.0/me',
        params: { fields: 'id,name,email,picture' },
        async request({ tokens, provider }: any) {
          const u = new URL(provider.userinfo.url)
          for (const [k, v] of Object.entries(provider.userinfo.params || {})) {
            u.searchParams.set(k, String(v))
          }
          u.searchParams.set('access_token', tokens.access_token)
          const r = await fetch(u.toString())
          if (!r.ok) {
            const body = await r.text()
            throw new Error(`FB userinfo ${r.status}: ${body.slice(0, 200)}`)
          }
          return r.json()
        },
      },
    }),
  ],
  session: { strategy: 'jwt' as const, maxAge: 60 * 24 * 60 * 60 },
  callbacks: {
    async session({ session, token }: any) {
      session.accessToken = token?.accessToken
      return session
    },
    async jwt({ token, account }: any) {
      try {
        // Initial login → save short-lived ทันที + mark needsExchange
        // ห้าม await exchange ที่นี่ — เคย break OAuth callback ใน timeout
        if (account?.access_token) {
          token.accessToken = account.access_token
          token.tokenIssuedAt = Date.now()
          token.needsExchange = true
          return token
        }

        // ถ้ายังไม่ได้ exchange (ครั้งแรก fail) → ลองใหม่
        if (token?.needsExchange && token?.accessToken) {
          const longLived = await exchangeForLongLivedToken(token.accessToken as string, 5000)
          if (longLived) {
            token.accessToken = longLived
            token.tokenIssuedAt = Date.now()
            token.needsExchange = false
          }
        }

        // Auto-refresh ทุก 25 วัน เพื่อ extend long-lived token
        const REFRESH_AFTER_MS = 25 * 24 * 60 * 60 * 1000
        if (!token?.needsExchange && token?.accessToken && token?.tokenIssuedAt) {
          const age = Date.now() - (token.tokenIssuedAt as number)
          if (age > REFRESH_AFTER_MS) {
            const refreshed = await exchangeForLongLivedToken(token.accessToken as string, 5000)
            if (refreshed) {
              token.accessToken = refreshed
              token.tokenIssuedAt = Date.now()
            }
          }
        }
        return token
      } catch (e: any) {
        console.error('[auth.jwt] threw:', e?.message)
        return token
      }
    },
  },
  pages: {
    signIn: '/login',
  },
  debug: true,
  events: {
    async signIn(msg: any) {
      console.log('[auth.events.signIn]', { provider: msg?.account?.provider, userId: msg?.user?.id || msg?.profile?.id })
    },
  },
  logger: {
    error(code: string, metadata: any) {
      const err = metadata?.error || metadata
      console.error('[NextAuth.error]', JSON.stringify({
        code,
        name: err?.name,
        message: err?.message,
        stack: err?.stack?.toString().slice(0, 600),
      }))
    },
    warn(code: string) {
      console.warn('[NextAuth.warn]', code)
    },
  },
}
