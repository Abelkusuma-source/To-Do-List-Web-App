import { getAuth } from "./lib/auth";
import { setEnv } from "./lib/env";
import { defineMiddleware } from "astro:middleware";
import * as Sentry from "@sentry/astro";

export const onRequest = defineMiddleware(async (context, next) => {
  // 1. Populate env from Cloudflare Workers runtime BEFORE any lazy init.
  //    In Astro v6+ the `cloudflare:workers` virtual module provides access
  //    to the Worker env bindings. Do a dynamic import for cross-platform compat.
  try {
    // @ts-expect-error - cloudflare:workers is a virtual module from the adapter
    const { env } = await import("cloudflare:workers");
    if (env) setEnv(env as Record<string, string | undefined>);
  } catch {
    // Not running on Cloudflare Workers — getEnv() will fall back to
    // import.meta.env which is correctly populated by Vite in local dev.
  }

  // 2. Skip middleware for BetterAuth API routes to avoid interfering with OAuth flow
  if (context.url.pathname.startsWith("/api/auth/")) {
    return next();
  }

  // 3. Authenticate session
  let isAuthed;
  try {
    const auth = getAuth();
    isAuthed = await auth.api.getSession({
      headers: context.request.headers,
    });
  } catch (err) {
    // Log auth errors to Sentry without modifying auth logic
    Sentry.withScope((scope) => {
      scope.setTag("component", "auth");
      scope.setExtra("pathname", context.url.pathname);
      scope.setExtra("method", context.request.method);
      scope.setLevel("warning");
      Sentry.captureException(err, {
        mechanism: { handled: true, type: "custom" },
      });
    });
    isAuthed = null;
  }

  if (isAuthed) {
    context.locals.user = isAuthed.user;
    context.locals.session = isAuthed.session;

    // Set Sentry user context for authenticated requests
    Sentry.setUser({
      id: isAuthed.user.id,
      email: isAuthed.user.email ?? undefined,
      username: isAuthed.user.name ?? undefined,
    });
  } else {
    context.locals.user = null;
    context.locals.session = null;
    // Clear any previous user context for unauthenticated requests
    Sentry.setUser(null);
  }

  const { pathname } = context.url;

  // Set request metadata for Sentry performance tracking
  Sentry.setTag("page", pathname);
  Sentry.setTag("method", context.request.method);

  // Protect dashboard route — redirect unauthenticated users to /login
  if (pathname === "/dashboard" && !isAuthed) {
    return context.redirect("/login");
  }

  // If already authenticated on /login, redirect to /dashboard
  if (pathname === "/login" && isAuthed) {
    return context.redirect("/dashboard");
  }

  return next();
});
