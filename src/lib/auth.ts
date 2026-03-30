import FacebookProvider from 'next-auth/providers/facebook'

export const authOptions = {
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
    async session({ session, token }: any) {
      session.accessToken = token.accessToken
      return session
    },
    async jwt({ token, account }: any) {
      if (account) {
        token.accessToken = account.access_token
      }
      return token
    },
  },
  pages: {
    signIn: '/login',
  },
}