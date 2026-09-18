// Runs in the browser through Next.js's instrumentation-client convention.
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

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
