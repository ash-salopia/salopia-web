-- ============================================================
-- 0116_support_feedback_and_requests.sql
-- ============================================================
-- Run AFTER 0115_support_agent.sql.
--
-- 1. support_agent_messages.helpful - the coach's 👍 (true) / 👎 (false)
--    on an assistant answer; null = not rated. 👎 rows are answers to
--    fix; answered = false rows are missing FAQ articles.
-- 2. support_requests - "Email support" from the assistant panel.
--    Saved here first so nothing is ever lost, then emailed to support
--    via Resend when RESEND_API_KEY is set (app/api/support-request).
--    Read/manage it in the Supabase table editor; set status to
--    'resolved' when done.
-- Both service-role only (RLS on, no policies), like 0115.
-- ============================================================

alter table support_agent_messages
  add column if not exists helpful boolean;

create table if not exists support_requests (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references organisations(id) on delete cascade,
  coach_id uuid references coaches(id) on delete set null,
  coach_email text,
  coach_name text,
  message text not null,
  transcript text,
  page text,
  emailed boolean not null default false,
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now()
);

create index if not exists support_requests_status_created
  on support_requests (status, created_at desc);

alter table support_requests enable row level security;
-- Intentionally no policies: service role only.
