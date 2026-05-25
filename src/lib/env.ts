/**
 * Global env store for Cloudflare Workers compatibility.
 *
 * ## The Problem
 *
 * On Cloudflare Workers, `import.meta.env` is statically replaced at build
 * time with only Vite's standard vars (BASE_URL, DEV, MODE, PROD, SITE, SSR).
 * Worker secrets set via `wrangler secret put` are **not** included.
 * Similarly, `process.env` is an empty polyfill on Workers.
 *
 * So when `betterAuth()` or `drizzle()` is called at module level, all env
 * vars (BETTER_AUTH_SECRET, GOOGLE_CLIENT_ID, TURSO_CONNECTION_URL, etc.)
 * are `undefined`.
 *
 * ## The Solution
 *
 * - `setEnv(env)` — called by middleware/endpoints to populate the store
 *   from the **Cloudflare Workers runtime** (`context.locals.runtime.env`).
 * - `getEnv(key)` — reads from the populated store, falling back to
 *   `import.meta.env` for local dev (Vite) or `process.env`.
 * - Lazy singletons (`getDb()`, `getAuth()`) use `getEnv()` and are
 *   initialized on first use, by which time the middleware has already
 *   populated the store.
 */

const _env: Record<string, any> = {};

/**
 * Populate the env store from the Cloudflare Workers runtime bindings.
 * Also writes string values to `process.env` so that libraries reading
 * from `process.env` (e.g. better-auth's internal `getEnvVar()`) work.
 *
 * Call this **once per request** at the start of middleware, before any
 * lazy singleton is initialised.
 */
export function setEnv(env: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === "string") {
      _env[key] = value;
      // Also set process.env for libraries that read from it directly
      try {
        // @ts-expect-error - process.env may be a polyfill on Workers
        process.env[key] = value;
      } catch {
        // ignore on platforms without writable process.env
      }
    }
  }
}

/**
 * Read an env var from the runtime store, falling back to `import.meta.env`
 * (for local Vite dev) or `process.env`.
 */
export function getEnv(key: string): string | undefined {
  return (
    _env[key] ??
    (typeof import.meta !== "undefined"
      ? // @ts-expect-error - import.meta.env may not be typed
        import.meta.env?.[key]
      : undefined) ??
    // @ts-expect-error - process.env may be a polyfill
    process.env?.[key]
  );
}
