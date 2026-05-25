import { betterAuth } from "better-auth/minimal";
import * as schema from "../db/schema";
import { createAdapter } from "../lib/adapter";
import { getEnv } from "../lib/env";
import { getDb } from "../db";

let _auth: ReturnType<typeof betterAuth> | null = null;

/**
 * Get the BetterAuth instance (lazy singleton).
 *
 * On Cloudflare Workers, env vars are not available at module load time.
 * This function initialises the auth instance on first call, by which time
 * the middleware has populated the env store from the Workers runtime.
 */
export function getAuth() {
  if (_auth) return _auth;

  const secret = getEnv("BETTER_AUTH_SECRET");
  const baseURL = getEnv("BETTER_AUTH_URL");
  const googleClientId = getEnv("GOOGLE_CLIENT_ID");
  const googleClientSecret = getEnv("GOOGLE_CLIENT_SECRET");

  if (!secret) {
    throw new Error(
      "BETTER_AUTH_SECRET is required. Set it in your .env file. " +
        "Generate one with: openssl rand -base64 32"
    );
  }

  if (!baseURL) {
    throw new Error(
      "BETTER_AUTH_URL is required. Set it in your .env file. " +
        "E.g.: BETTER_AUTH_URL=http://localhost:4321"
    );
  }

  const db = getDb();

  _auth = betterAuth({
    baseURL,
    secret,
    database: createAdapter(db, {
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
        clientId: googleClientId!,
        clientSecret: googleClientSecret!,
      },
    },
    session: {
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60, // 5 minutes
      },
    },
  });

  return _auth;
}
