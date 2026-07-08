import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { apiKey } from "@better-auth/api-key"
import { db, schema } from "./db"

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  trustedOrigins: [process.env.WEB_URL ?? "http://localhost:5173"],
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
      apikey: schema.apikey,
    },
  }),
  emailAndPassword: {
    enabled: true,
  },
  plugins: [apiKey()],
})

export type Session = typeof auth.$Infer.Session
