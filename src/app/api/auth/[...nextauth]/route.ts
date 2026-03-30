import NextAuth from 'next-auth'
import FacebookProvider from 'next-auth/providers/facebook'

const handler = NextAuth({
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    FacebookProvider({
      clientId: process.env.FACEBOOK_CLIENT_ID!,
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: 'ads_management,ads_read,pages_show_list,pages_read_engagement',
          redirect_uri: 'https://fb-ads-manager.vercel.app/api/auth/callback/facebook',
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
})

export { handler as GET, handler as POST }