import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client/web";

/**
 * Turso/libSQL database client using the web-compatible entry point.
 *
 * `@libsql/client/web` uses standard Web APIs (fetch) instead of Node.js
 * net/tls, making it compatible with both Node.js (local dev/build)
 * and Cloudflare Workers (production edge runtime).
 *
 * Node.js 18+ has global fetch, so this works everywhere.
 */
const client = createClient({
  url: import.meta.env.TURSO_CONNECTION_URL!,
  authToken: import.meta.env.TURSO_AUTH_TOKEN!,
});

export const db = drizzle(client);
