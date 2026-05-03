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
      // 🎯 Override userinfo + fallback ทน rate limit
      // 1. ลอง /v19.0/me + access_token query param (ไม่ใช้ Bearer header
      //    เพราะ FB ตอบ 403 Forbidden กับ default ของ next-auth v4.24.7)
      // 2. ถ้า fail (เช่น FB rate limit #4) → fallback ใช้ debug_token
      //    ผ่าน APP_TOKEN (server-server, ไม่กิน user rate limit) เพื่อ
      //    เอาแค่ user_id → NextAuth ก็ create session ได้ profile name
      //    จะ fetch ทีหลังตอน user เปิด dashboard ผ่าน useSession()
      userinfo: {
        url: 'https://graph.facebook.com/v19.0/me',
        params: { fields: 'id,name,email,picture' },
        async request({ tokens, provider }: any) {
          // เก็บ diagnostic ใน throw message ตรงๆ (console.error ไม่ถึง Vercel logs)
          const diag: string[] = []
          const tokenLen = String(tokens.access_token || '').length
          diag.push(`tokenLen=${tokenLen}`)

          // 1. /me + access_token query param
          try {
            const u = new URL(provider.userinfo.url)
            for (const [k, v] of Object.entries(provider.userinfo.params || {})) {
              u.searchParams.set(k, String(v))
            }
            u.searchParams.set('access_token', tokens.access_token)
            const r = await fetch(u.toString())
            const body = await r.text()
            if (r.ok) return JSON.parse(body)
            diag.push(`/me=${r.status}:${body.slice(0, 100)}`)
          } catch (e: any) {
            diag.push(`/me_threw=${e?.message?.slice(0, 80)}`)
          }

          // 2. debug_token ผ่าน APP_TOKEN
          try {
            const appToken = `${process.env.FACEBOOK_CLIENT_ID}|${process.env.FACEBOOK_CLIENT_SECRET}`
            const dr = await fetch(
              `https://graph.facebook.com/v19.0/debug_token?input_token=${tokens.access_token}&access_token=${appToken}`
            )
            const dbody = await dr.text()
            if (dr.ok) {
              const dj = JSON.parse(dbody)
              const userId = dj?.data?.user_id
              if (userId) return { id: String(userId), name: 'User', email: null, picture: null }
              diag.push(`dt_no_user_id:${dbody.slice(0, 100)}`)
            } else {
              diag.push(`dt=${dr.status}:${dbody.slice(0, 100)}`)
            }
          } catch (e: any) {
            diag.push(`dt_threw=${e?.message?.slice(0, 80)}`)
          }

          // 3. /me?access_token=APP|USER (appsecret_proof bypass attempt)
          try {
            const appToken = `${process.env.FACEBOOK_CLIENT_ID}|${process.env.FACEBOOK_CLIENT_SECRET}`
            const ir = await fetch(
              `https://graph.facebook.com/v19.0/me?fields=id&access_token=${encodeURIComponent(appToken + '|' + tokens.access_token)}`
            )
            const ibody = await ir.text()
            if (ir.ok) {
              const ij = JSON.parse(ibody)
              if (ij?.id) return { id: ij.id, name: 'User', email: null, picture: null }
            }
            diag.push(`me_proof=${ir.status}:${ibody.slice(0, 100)}`)
          } catch (e: any) {
            diag.push(`me_proof_threw=${e?.message?.slice(0, 80)}`)
          }

          // ทุกวิธีล้ม → throw พร้อม diagnostic ในตัว message
          throw new Error(`FB userinfo failed: ${diag.join(' | ')}`)
        },
      },
    }),
  ],
  session: { strategy: 'jwt' as const, maxAge: 60 * 24 * 60 * 60 },
  callbacks: {
    async session({ session, token }: any) {
      session.accessToken = token?.accessToken
      // เก็บ FB user_id ใน session → routes ไม่ต้อง call /me ทุก request
      // (ป้องกัน rate limit + เร็วขึ้น)
      session.fbUserId = token?.fbUserId
      return session
    },
    async jwt({ token, account, profile }: any) {
      try {
        // Initial login → save short-lived ทันที + mark needsExchange
        // ห้าม await exchange ที่นี่ — เคย break OAuth callback ใน timeout
        if (account?.access_token) {
          token.accessToken = account.access_token
          token.tokenIssuedAt = Date.now()
          token.needsExchange = true
          // FB user_id มาจาก OAuth → เก็บไว้ ไม่ต้อง call /me ทุก request
          token.fbUserId = account.providerAccountId || (profile as any)?.id
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
