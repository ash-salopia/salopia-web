// Runs in the Node.js server runtime (API routes, Server Components,
// Server Actions). Loaded by instrumentation.ts. Reuses the same DSN
// as the client config — Sentry DSNs are public identifiers, not
// secrets (safe to expose via NEXT_PUBLIC_*), so one env var covers
// both. Dormant with no DSN set, same as sentry.client.config.ts.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
});
