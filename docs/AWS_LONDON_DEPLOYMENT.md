# VIS BUILD AWS London deployment

The application runs as a portable Next.js container on Amazon ECS Express
Mode in `eu-west-2` (London). Supabase remains the managed data, authentication,
realtime, and storage platform during this migration.

## Safety and cutover

- Vercel remains live until the AWS service passes smoke tests.
- The first AWS deployment uses the AWS-provided HTTPS address.
- Supabase redirect URLs are extended to include AWS before any user testing.
- DNS is changed only after authentication, uploads, reporting, AI features,
  Stripe webhooks, push notifications, and scheduled jobs are verified.
- A rollback is a DNS switch back to the existing Vercel deployment. No
  database export/import occurs in this phase, so there is no data-copy window.

## AWS resources

- ECR repository: `vis-build-app`
- ECS Express Mode service: `vis-build-app`
- Region: `eu-west-2`
- Container port: `3000`
- Health check: `/api/health`
- Minimum tasks: `1`; maximum tasks: `4`
- CloudWatch logs and an HTTPS Application Load Balancer are managed by ECS
  Express Mode.

## GitHub environment

Create an `aws-london` environment with these secrets:

- `AWS_GITHUB_ROLE_ARN`
- `AWS_ECS_EXECUTION_ROLE_ARN`
- `AWS_ECS_INFRASTRUCTURE_ROLE_ARN`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SENTRY_DSN`
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
- `ECS_RUNTIME_SECRETS_JSON`
- `CRON_SECRET`

`ECS_RUNTIME_SECRETS_JSON` is the JSON array accepted by the official ECS
Express deployment action. Each entry maps an application environment variable
to an AWS Secrets Manager ARN. Do not put secret values directly in the file or
repository.

Create the GitHub environment variable `APP_BASE_URL` after the first deploy.
Set it to the AWS HTTPS endpoint for staging, then to the production app domain
after cutover.

## Runtime environment inventory

The AWS secret must provide the variables used by the current production app:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`
- `YOUTUBE_API_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- Stripe price IDs for Starter, Pro, and Unlimited monthly/yearly plans
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`
- `CRON_SECRET`
- demo coach credentials, if the public demo remains enabled
- Sentry variables, if error monitoring is enabled

## Deployment

Run the `Deploy VIS BUILD to AWS London` workflow manually. It authenticates to
AWS with GitHub OIDC, builds the container, pushes it to ECR, updates ECS with a
canary deployment, and verifies the health endpoint.

The scheduled-notifications workflow replaces the two Vercel cron entries once
the AWS branch becomes the default production branch.
