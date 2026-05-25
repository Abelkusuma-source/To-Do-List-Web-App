import * as Sentry from "@sentry/astro";

Sentry.init({
  environment: import.meta.env.PROD ? "production" : "development",
  tracesSampleRate: import.meta.env.PROD ? 0.25 : 1.0,
  // Cloudflare Workers don't support Node.js CPU profiling
  // Performance tracing is handled via browserTracingIntegration on the client
});
