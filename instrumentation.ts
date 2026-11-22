// Next.js's instrumentation hook — runs once when each server runtime
// boots, before it starts handling requests. This is how the two
// server-side Sentry configs actually get loaded; the browser side is
// instrumentation-client.ts.
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Errors thrown while rendering server components / route handlers are
// passed to Sentry here (Next 15+ hook). A no-op until a DSN is set.
export const onRequestError = Sentry.captureRequestError;
