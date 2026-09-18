import * as Sentry from "@sentry/nextjs";

// Next.js's instrumentation hook — runs once when each server runtime
// boots, before it starts handling requests. This is how the two
// server-side Sentry configs actually get loaded; sentry.client.config.ts
// is picked up separately by withSentryConfig's webpack plugin.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
