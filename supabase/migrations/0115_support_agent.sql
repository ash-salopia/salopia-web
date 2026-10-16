-- ============================================================
-- 0115_support_agent.sql
-- ============================================================
-- Log for the Help page's "Speak to an agent" AI assistant
-- (app/api/support-agent). One row per question a coach asks.
-- Two jobs:
--   * per-coach daily question cap (the route counts today's rows)
--   * a record of what coaches ask - especially rows with
--     answered = false, i.e. questions the help articles didn't
--     cover, which is the to-do list for new FAQ articles.
--     Read it in the Supabase table editor.
-- RLS on with NO policies: only the service role (the route) can
-- read or write it.
-- ============================================================

create table if not exists support_agent_messages (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references organisations(id) on delete cascade,
  coach_id uuid references coaches(id) on delete set null,
  question text not null,
  answer text,
  article_ids text[] not null default '{}',
  answered boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists support_agent_messages_coach_day
  on support_agent_messages (coach_id, created_at desc);

alter table support_agent_messages enable row level security;
-- Intentionally no policies: service role only.
