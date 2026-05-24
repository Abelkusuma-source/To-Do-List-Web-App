import { auth } from "./lib/auth";
import { defineMiddleware } from "astro:middleware";

export const onRequest = defineMiddleware(async (context, next) => {
  // Skip middleware for BetterAuth API routes to avoid interfering with OAuth flow
  if (context.url.pathname.startsWith("/api/auth/")) {
    return next();
  }

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
