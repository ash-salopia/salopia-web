-- ============================================================
-- 0053_primer_activation_flag.sql
-- ============================================================
-- Lets a coach flag a whole session, and/or an individual exercise
-- within it, as "primer/activation" -- a deliberately lighter effort
-- (e.g. a pre-match activation squat) that must NOT be read as a
-- genuine strength drop. Flagged rows are excluded from:
--   - the Training Load Report (lib/report-calc.ts)
--   - the Strength/e1RM Report (lib/strength-report-calc.ts)
--   - the rolling %1RM estimate used to prescribe future loads
--     (lib/one-rm.ts's bestRollingOneRM, and its 3 call sites)
-- A session-level flag is equivalent to flagging every exercise in
-- it; an exercise-level flag lets a coach mark just one lift within
-- an otherwise-normal session (the common case: one lighter primer
-- lift alongside real working sets on other exercises).
-- Purely additive/nullable-safe -- defaults to false, so every
-- existing session and exercise is completely unaffected.
-- ============================================================

alter table sessions add column if not exists is_primer boolean not null default false;
alter table session_exercises add column if not exists is_primer boolean not null default false;
