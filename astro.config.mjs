import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import cloudflare from "@astrojs/cloudflare";
import sentry from "@sentry/astro";

export default defineConfig({
  site: "https://todo-app.kusumaabel07.workers.dev",
  srcDir: "./src",
  outDir: "./dist",
  output: "server",
  adapter: cloudflare({
    platformProxy: {
      enabled: true,
    },
  }),
  integrations: [
    sentry({
      // DSN is auto-read from SENTRY_DSN env var by @sentry/cloudflare
      // Only set explicit org/project/authToken for source maps upload
      ...(import.meta.env.SENTRY_AUTH_TOKEN
        ? {
            org: import.meta.env.SENTRY_ORG,
            project: import.meta.env.SENTRY_PROJECT,
            authToken: import.meta.env.SENTRY_AUTH_TOKEN,
          }
        : {}),
      sourceMapsUploadOptions: {
        enabled: Boolean(import.meta.env.SENTRY_AUTH_TOKEN),
      },
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
