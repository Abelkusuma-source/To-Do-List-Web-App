import { getAuth } from "./lib/auth";
import { setEnv } from "./lib/env";
import { defineMiddleware } from "astro:middleware";

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

  const auth = getAuth();
  const isAuthed = await auth.api.getSession({
    headers: context.request.headers,
  });

  if (isAuthed) {
    context.locals.user = isAuthed.user;
    context.locals.session = isAuthed.session;
  } else {
    context.locals.user = null;
    context.locals.session = null;
  }

  const { pathname } = context.url;

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
