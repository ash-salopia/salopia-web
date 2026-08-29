-- ============================================================
-- 0081_ai_report_cache.sql
-- ============================================================
-- Turns the `reports` table (0005) into a result cache for the paid
-- AI Training Load report summary (training-report-ai). Before calling
-- the model, the route hashes the exact data that feeds the prompt
-- (see lib/ai/report-cache.ts) and looks for a row with a matching
-- input_hash; a hit returns the stored text with no model call.
-- Regenerating a report with no new data underneath — re-open,
-- re-print, bulk "Download reports as ZIP" re-run — becomes free.
--
-- Additive: existing report-history rows just have NULL content /
-- input_hash / model. RLS is unchanged (0005 already scopes reports
-- by athlete → organisation).
-- ============================================================

alter table reports add column if not exists content    jsonb;
alter table reports add column if not exists input_hash  text;
alter table reports add column if not exists model       text;

create index if not exists reports_cache_idx
  on reports (athlete_id, report_type, input_hash);
