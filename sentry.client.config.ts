import * as Sentry from "@sentry/astro";

Sentry.init({
  environment: import.meta.env.PROD ? "production" : "development",
  tracesSampleRate: import.meta.env.PROD ? 0.25 : 1.0,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration(),
  ],
});
