-- ============================================================
-- 0119_ai_usage.sql
-- ============================================================
-- One row per paid AI call from the coach dashboard (build from notes,
-- voice build, modify sessions, assign-programme parsing, AI report
-- summaries). lib/ai/usage-guard.ts counts a coach's rows for the last
-- 24h to enforce a daily cap per feature, so a leaked session or the
-- shared public demo login can't run up the AI bill. The support
-- assistant keeps its own log (support_agent_messages, 0115).
--
-- Service-role only (RLS on, no policies), like 0115.
-- ============================================================

create table if not exists ai_usage (
  id bigint generated always as identity primary key,
  organisation_id uuid references organisations(id) on delete cascade,
  coach_id uuid references coaches(id) on delete cascade,
  feature text not null,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_coach_feature_created
  on ai_usage (coach_id, feature, created_at desc);

alter table ai_usage enable row level security;
-- Intentionally no policies: service role only.
