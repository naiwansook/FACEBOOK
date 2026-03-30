import NextAuth from 'next-auth'
import FacebookProvider from 'next-auth/providers/facebook'

const handler = NextAuth({
  providers: [
    FacebookProvider({
      clientId: process.env.FACEBOOK_CLIENT_ID!,
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: 'email,public_profile,pages_show_list,pages_manage_ads,pages_read_engagement,ads_management,ads_read',
        },
      },
    }),
  ],
  callbacks: {
    async session({ session, token }) {
      session.accessToken = token.accessToken as string
      return session
    },
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token
      }
      return token
    },
  },
  pages: {
    signIn: '/login',
  },
  useSecureCookies: true,
})

export { handler as GET, handler as POST }