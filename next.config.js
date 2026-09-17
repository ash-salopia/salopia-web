const { withSentryConfig } = require("@sentry/nextjs/config");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Required on Next.js 14 for instrumentation.ts to actually run —
    // this is what loads sentry.server.config.ts / sentry.edge.config.ts.
    // Stable (no flag needed) from Next 15 onward; harmless to leave in
    // if/when this repo upgrades.
    instrumentationHook: true,
  },
};

module.exports = withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Uploading source maps needs SENTRY_AUTH_TOKEN (a build-time secret,
  // separate from the DSN — create one at sentry.io/settings/account/api/auth-tokens/).
  // With no org/project/token set, this plugin skips the upload step
  // and quietly no-ops rather than failing the build — nothing here
  // requires Sentry to be configured to build and deploy normally.
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  webpack: {
    treeshake: { removeDebugLogging: true },
  },
});
