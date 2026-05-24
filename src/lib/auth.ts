import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { db } from "../db";
import * as schema from "../db/schema";

const BETTER_AUTH_SECRET = import.meta.env.BETTER_AUTH_SECRET;
const BETTER_AUTH_URL = import.meta.env.BETTER_AUTH_URL;

if (!BETTER_AUTH_SECRET) {
  throw new Error(
    "BETTER_AUTH_SECRET is required. Set it in your .env file. " +
    "Generate one with: openssl rand -base64 32"
  );
}

if (!BETTER_AUTH_URL) {
  throw new Error(
    "BETTER_AUTH_URL is required. Set it in your .env file. " +
    "E.g.: BETTER_AUTH_URL=http://localhost:4321"
  );
}

export const auth = betterAuth({
  baseURL: BETTER_AUTH_URL,
  secret: BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  socialProviders: {
    google: {
      clientId: import.meta.env.GOOGLE_CLIENT_ID!,
      clientSecret: import.meta.env.GOOGLE_CLIENT_SECRET!,
    },
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 minutes
    },
  },
});
