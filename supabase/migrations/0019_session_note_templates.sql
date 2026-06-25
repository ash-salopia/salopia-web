-- ============================================================
-- 0019_session_note_templates.sql
-- ============================================================
-- Replaces hardcoded note templates in SessionNotesBlock with
-- DB-backed, coach-editable templates.
-- ============================================================

create table session_note_templates (
  id            uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  name          text not null,
  content       text not null default '',
  category      text not null default 'general'
                  check (category in ('general', 'warm_up', 'strength', 'power_speed', 'cardio')),
  sort_order    int not null default 0,
  created_at    timestamptz not null default now()
);

create index session_note_templates_org_idx on session_note_templates(organisation_id);

alter table session_note_templates enable row level security;

create policy "Coaches manage note templates" on session_note_templates
  for all using (organisation_id = my_organisation_id())
  with check (organisation_id = my_organisation_id());

-- Seed the 4 default templates that were previously hardcoded
-- These are inserted as a one-time seed; coaches can edit/delete them after.
-- We use a DO block so we can look up the org_id dynamically.
-- NOTE: This seeds for ALL existing orgs. Safe to re-run (ON CONFLICT DO NOTHING).

INSERT INTO session_note_templates (organisation_id, name, content, category, sort_order)
SELECT
  o.id,
  t.name,
  t.content,
  t.category,
  t.sort_order
FROM organisations o
CROSS JOIN (VALUES
  (
    'Sprint Warm-Up Protocol',
    E'Sprint Warm-Up Protocol\n─────────────────────────\n1. General warm-up: 5 min easy jog / cycle\n2. Dynamic mobility: leg swings, hip circles, ankle rolls (2×10 each)\n3. Activation: glute bridges, banded clamshells (2×15)\n4. Running drills: A-march, A-skip, B-skip, straight leg bound (2×20m each)\n5. Strides: 3×60m @ 75–80% — full recovery between each\n─────────────────────────\nCoaching cues:\n- Drive phase: shin angle, triple extension, arm mechanics\n- Eyes forward, relaxed shoulders\n- Full recovery between maximal efforts',
    'power_speed',
    0
  ),
  (
    'Plyometric Progression',
    E'Plyometric Session Protocol\n─────────────────────────\nClassification: [Introductory / Intermediate / Advanced / Maximal]\nTotal contacts today: ___\n\nWarm-up jumps (low intensity):\n- Ankle hops 2x20 contacts\n- Squat jumps 2x8\n\nMain block: [exercises below]\n\nCoaching cues:\n- Land soft, absorb through ankle > knee > hip\n- Reactive jumps: minimise ground contact time\n- Full recovery for maximal output',
    'power_speed',
    1
  ),
  (
    'French Contrast Block',
    E'French Contrast Method\n─────────────────────────\nStructure: 4 exercises as one complex, 3-5 min rest between sets\nRecommended: 3-4 sets of full complex\n\nExercise 1 - Heavy compound (85-95% 1RM): ___\nExercise 2 - Plyometric (bodyweight): ___\nExercise 3 - Loaded ballistic (30% BW): ___\nExercise 4 - Assisted/unloaded explosive: ___\n\nRest within complex: 30-60s between exercises\nRest between complexes: 3-5 min (CNS recovery)',
    'power_speed',
    2
  ),
  (
    'General Warm-Up',
    E'General Warm-Up\n─────────────────────────\n5 min: [cardio modality]\nMobility circuit (2 rounds):\n- [movement 1]\n- [movement 2]\n- [movement 3]\nActivation:\n- [activation 1]\n- [activation 2]',
    'warm_up',
    3
  )
) AS t(name, content, category, sort_order)
ON CONFLICT DO NOTHING;
