const { withSentryConfig } = require("@sentry/nextjs/config");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Keep the application portable. AWS ECS/Fargate and Azure App Service can
  // run the self-contained Node server emitted by this build mode.
  output: "standalone",
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
