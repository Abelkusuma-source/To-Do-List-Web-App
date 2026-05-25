import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client/web";

/**
 * Creates a libSQL/Turso client compatible with Cloudflare Workers.
 *
 * Key compatibility notes:
 * - Uses `@libsql/client/web` which relies on standard Web APIs (fetch)
 *   instead of Node.js net/tls — works in both Node.js and Workers.
 * - Converts `libsql:` URL scheme to `https:` explicitly to avoid any
 *   scheme-resolution edge cases in the Workers runtime.
 * - Passes `globalThis.fetch` explicitly so the client uses the platform's
 *   native fetch (required for Workers HTTP streaming to work correctly).
 * - Limits concurrency to a safe value for edge function environments.
 */
function createTursoClient() {
  const rawUrl = import.meta.env.TURSO_CONNECTION_URL;
  const authToken = import.meta.env.TURSO_AUTH_TOKEN;

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
  // The /web entry point handles this internally via expandConfig(), but
  // passing https:// directly avoids any conditional-scheme edge cases.
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

const client = createTursoClient();

export const db = drizzle(client);
