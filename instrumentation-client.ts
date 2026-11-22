// Browser-side Sentry setup. Next 15.3+ loads instrumentation-client.ts
// automatically in the browser (this replaced sentry.client.config.ts on
// the move to Next 16; it works with both webpack and Turbopack builds).
//
// Entirely dormant until NEXT_PUBLIC_SENTRY_DSN is set — Sentry.init()
// with an empty dsn is a documented no-op (nothing captured, nothing
// sent, no error thrown), so this ships safely with zero configuration
// and turns on the moment a real DSN is added to env vars.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Off by default — performance tracing is a separate Sentry quota
  // from error tracking. Raise this (e.g. 0.1 = 10% of transactions)
  // once error reporting itself is confirmed working and you want
  // performance data too.
  tracesSampleRate: 0,

  // Quieten the SDK's own console output in the browser.
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
});

// Lets Sentry tie client-side navigations to the errors that follow them.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
