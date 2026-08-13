-- ============================================================
-- 0055_template_programme_notes.sql
-- ============================================================
-- Templates/Programmes are now built exclusively by saving a real
-- session out of the athlete session builder (Save as
-- template/programme), rather than edited in place. That means a
-- session's coach-authored `session_notes` needs somewhere to land
-- when snapshotted, and somewhere to come back out of when loaded
-- onto an athlete's calendar again — mirrors sessions.session_notes,
-- scoped the same way hyrox_config/recovery_config already are.

alter table template_defs add column if not exists notes text not null default '';
alter table programme_sessions add column if not exists notes text not null default '';
