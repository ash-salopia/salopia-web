// Runs in the Edge runtime — middleware.ts, and any route explicitly
// opted into `export const runtime = "edge"`. Loaded by
// instrumentation.ts. Same dormant-until-configured behaviour as the
// other two config files.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
});
