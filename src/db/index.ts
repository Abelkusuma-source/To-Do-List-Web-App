import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client/web";
import { getEnv } from "../lib/env";

export type Db = ReturnType<typeof drizzle>;

let _db: Db | null = null;

/**
 * Creates a libSQL/Turso client compatible with Cloudflare Workers.
 *
 * Key compatibility notes:
 * - Uses `@libsql/client/web` which relies on standard Web APIs (fetch)
 *   instead of Node.js net/tls — works in both Node.js and Workers.
 * - Converts `libsql:` URL scheme to `https:` explicitly to avoid any
 *   scheme-resolution edge cases in the Workers runtime.
 * - Limits concurrency to a safe value for edge function environments.
 */
function createTursoClient() {
  const rawUrl = getEnv("TURSO_CONNECTION_URL");
  const authToken = getEnv("TURSO_AUTH_TOKEN");

  if (!rawUrl) {
    throw new Error(
      "TURSO_CONNECTION_URL is required. Set it in your .env file or Cloudflare Pages environment variables."
    );
  }
  if (!authToken) {
    throw new Error(
      "TURSO_AUTH_TOKEN is required. Set it in your .env file or Cloudflare Pages environment variables."
    );
  }

  // Convert libsql:// -> https:// for explicit HTTP transport on Workers.
  // Only transform if the scheme is libsql: — leave https: URLs as-is.
  const httpsUrl = rawUrl.startsWith("libsql:")
    ? rawUrl.replace(/^libsql:/, "https:")
    : rawUrl;

  return createClient({
    url: httpsUrl,
    authToken,
    concurrency: 10,
  });
}

/**
 * Get the Drizzle ORM database instance (lazy singleton).
 *
 * On Cloudflare Workers, env vars are not available at module load time.
 * This function initialises the DB client on first call, by which time
 * the middleware has populated the env store from the Workers runtime.
 */
export function getDb(): Db {
  if (!_db) {
    const client = createTursoClient();
    _db = drizzle(client);
  }
  return _db;
}
