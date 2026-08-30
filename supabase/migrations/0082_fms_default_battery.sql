-- ============================================================
-- 0082_fms_default_battery.sql
-- ============================================================
-- Adds the Functional Movement Screen (FMS) as a default test
-- battery for EVERY organisation — existing and future.
--
-- Two parts:
--
-- 1. seed_fms_battery(org_id) — a reusable, idempotent function
--    that creates the "FMS (Functional Movement Screen)" battery,
--    its 11 metrics (7 movement patterns, the total score, and the
--    3 clearing tests) and their benchmarks for one org. Skips
--    entirely if that org already has an FMS battery, so it's safe
--    to run repeatedly.
--
-- 2. A trigger on organisations INSERT that calls it, so orgs
--    created after this migration get FMS automatically. (0027,
--    which seeded the Salopia Youth battery, only looped existing
--    orgs and left no trigger — new orgs currently get no default
--    battery at all. This closes that gap for FMS; the youth
--    battery is a separate follow-up.)
--
-- FMS scoring model (Cook et al.):
--   3 = clean movement pattern, no compensation
--   2 = completes the pattern with compensation
--   1 = cannot complete the pattern
--   0 = pain on the movement, or a positive clearing test
-- Bilateral tests are scored per side; the lower side is what
-- counts toward the total (max 21). A total of 14 or below is
-- associated with elevated injury risk in several populations;
-- any asymmetry or any score of 0 warrants attention regardless
-- of the total.
--
-- Benchmarks here are deliberately age/sex-agnostic (a 3 is a 3):
-- one elite_youth + one general_population row per rated metric,
-- with identical thresholds, sex/age bounds NULL so matchBenchmark()
-- treats them as "applies to everyone". Threshold tuple is
-- [average, good, excellent] to match 0027 and ragStatus():
--   movements  [2, 3, 3]  -> 3 green, 2 amber, 0-1 red
--   total      [14, 15, 17] -> 18-21 green, 15-17 green, 14 amber, <=13 red
-- Clearing tests are screening_only (recorded, never RAG-rated;
-- lower is better: 0 = negative/no pain, 1 = positive/pain).
-- ============================================================

create or replace function seed_fms_battery(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  battery_id uuid;
  metric_def jsonb;
  metric_id  uuid;
  fms jsonb := '[
    {
      "sort": 0, "name": "FMS Deep Squat", "unit": "", "lower_is_better": false,
      "bilateral": false, "screening_only": false, "thresholds": [2, 3, 3],
      "what": "An overhead squat holding a dowel above the head. Screens bilateral, symmetrical mobility and control of the hips, knees and ankles, plus bilateral shoulder mobility and thoracic-spine extension.",
      "why": "The deep squat is a foundational movement in strength training and sport. Compensations here point to restrictions or stability deficits that will limit squatting, jumping and landing mechanics.",
      "excellent": "Clean overhead deep squat with no compensation — good full-body mobility and control. Load squat patterns confidently and progress depth and intensity.",
      "good": "Completes the squat but with compensation (heel lift, forward torso, dowel drift). Address the limiting factor — ankle or hip mobility, or thoracic extension — alongside loaded squatting.",
      "average": "Struggles to reach a full squat pattern. Prioritise mobility drills (ankle, hip, T-spine) and grooved bodyweight/goblet squat progressions before adding load.",
      "needs_work": "Cannot complete the squat pattern, or reports pain. Regress to supported squat variations, screen for the specific restriction, and refer on if pain is present.",
      "note": "Score 0 if there is pain at any point. A positive Shoulder Clearing Test does not affect this score."
    },
    {
      "sort": 1, "name": "FMS Hurdle Step", "unit": "", "lower_is_better": false,
      "bilateral": true, "screening_only": false, "thresholds": [2, 3, 3],
      "what": "Stepping one leg over a hurdle set at tibial-tuberosity height while standing tall on the other. Screens stride mechanics and single-leg stability, plus bilateral mobility and control of the hips, knees and ankles. Scored each side.",
      "why": "Reflects the stance-leg stability and swing-leg mobility used in running, and reveals left-right differences that often track with injury history.",
      "excellent": "Clears the hurdle each side with a level pelvis and no trunk or stance-leg wobble. Strong single-leg control.",
      "good": "Completes the step with compensation (pelvis drop, trunk lean, loss of balance) on one or both sides. Build single-leg strength and hip control.",
      "average": "Marked compensation or contact with the hurdle. Emphasise stance-leg stability work and hip-flexor mobility for the swing leg.",
      "needs_work": "Cannot perform the step, or reports pain. Regress the height, coach the pattern, and investigate the limiting side.",
      "note": "Score the LOWER side toward the FMS total. A difference between sides is a screening flag in its own right. Score 0 for pain."
    },
    {
      "sort": 2, "name": "FMS In-Line Lunge", "unit": "", "lower_is_better": false,
      "bilateral": true, "screening_only": false, "thresholds": [2, 3, 3],
      "what": "A narrow split-stance lunge on a board with a dowel held vertically along the spine. Screens hip and ankle mobility, quadriceps flexibility, and knee and trunk stability in a split stance. Scored each side.",
      "why": "The split stance loads the hips asymmetrically the way deceleration, cutting and lunging patterns do. Poor control or a side-to-side gap here is a common movement-quality limiter.",
      "excellent": "Controlled lunge each side, torso upright, dowel stays in contact, no wobble. Good split-stance control.",
      "good": "Completes the lunge with compensation (loss of balance, dowel loses contact, torso movement) on one or both sides. Add split-squat strength and hip mobility.",
      "average": "Significant instability or a clear side-to-side difference. Prioritise single-leg strength, ankle mobility and anti-rotation trunk work.",
      "needs_work": "Cannot perform the lunge, or reports pain. Regress to a supported split squat and screen the limiting side.",
      "note": "Score the LOWER side toward the FMS total. Score 0 for pain."
    },
    {
      "sort": 3, "name": "FMS Shoulder Mobility", "unit": "", "lower_is_better": false,
      "bilateral": true, "screening_only": false, "thresholds": [2, 3, 3],
      "what": "A reciprocal reach behind the back — one hand over the shoulder, the other up from below — measuring the fist-to-fist distance relative to hand length. Screens combined shoulder internal rotation/adduction on one side and external rotation/abduction on the other. Scored each side.",
      "why": "Overhead and behind-the-back shoulder range underpins pressing, pulling and throwing. Restriction or asymmetry is a frequent cause of shoulder pain and compensation.",
      "excellent": "Fists within one hand-length each side — good, symmetrical shoulder mobility. Maintain with regular mobility work.",
      "good": "Within one-and-a-half hand-lengths, or a mild side difference. Programme targeted shoulder and thoracic mobility.",
      "average": "Within two hand-lengths, or a clear asymmetry. Prioritise shoulder and T-spine mobility and monitor pressing volume.",
      "needs_work": "Fists more than two hand-lengths apart, or a positive Shoulder Clearing Test (pain), which scores this 0. Address mobility and refer on if pain persists.",
      "note": "Also perform the Shoulder Clearing Test — if positive (pain), this metric is scored 0. Score the LOWER side toward the total."
    },
    {
      "sort": 4, "name": "FMS Active Straight-Leg Raise", "unit": "", "lower_is_better": false,
      "bilateral": true, "screening_only": false, "thresholds": [2, 3, 3],
      "what": "Lying on the back, raising one straight leg as far as possible while the other stays flat. Screens active hamstring and calf flexibility of the moving leg while the pelvis and opposite leg stay stable. Scored each side.",
      "why": "Active hip flexion range with a stable pelvis relates to sprint mechanics, hip-hinge quality and lower-back load. Asymmetry here often accompanies hamstring and low-back issues.",
      "excellent": "Raised ankle passes mid-thigh / ASIS each side with the pelvis stable. Good active hip mobility.",
      "good": "Ankle reaches between mid-thigh and the knee, or a mild side difference. Programme hamstring mobility and core control.",
      "average": "Ankle stays below the knee, or a clear asymmetry. Prioritise active hamstring and hip-flexor mobility and anterior-core stability.",
      "needs_work": "Very limited raise, or reports pain. Screen for a neural component, coach the pattern, and refer on if pain is present.",
      "note": "Score the LOWER side toward the FMS total. Score 0 for pain."
    },
    {
      "sort": 5, "name": "FMS Trunk Stability Push-Up", "unit": "", "lower_is_better": false,
      "bilateral": false, "screening_only": false, "thresholds": [2, 3, 3],
      "what": "A press-up started with the hands at a set height (thumbs to forehead for men, chin for women) driving the body up as one rigid unit. Screens the ability to stabilise the spine in the sagittal plane during a closed-chain upper-body push.",
      "why": "Reflects reflexive core stability and the ability to transfer force between the upper and lower body without the low back sagging. Relevant to pressing, sprinting and contact.",
      "excellent": "Full press-up as one unit from the tougher hand position, no lag in the hips or low back. Strong trunk stability.",
      "good": "Completes the press-up from the easier hand position, or with a slight lag. Build anti-extension core strength and pressing.",
      "average": "Cannot press up as a unit from the easier position. Prioritise plank progressions, anti-extension work and scaled pressing.",
      "needs_work": "Cannot complete a rep, or a positive Extension Clearing Test (pain on spinal extension), which scores this 0.",
      "note": "Also perform the Extension Clearing Test — if positive (pain), this metric is scored 0."
    },
    {
      "sort": 6, "name": "FMS Rotary Stability", "unit": "", "lower_is_better": false,
      "bilateral": true, "screening_only": false, "thresholds": [2, 3, 3],
      "what": "From a quadruped position on a board, extending the same-side (then, if needed, opposite-side) arm and leg and bringing elbow to knee under the body. Screens multi-plane trunk stability during combined upper- and lower-limb movement. Scored each side.",
      "why": "Rotary trunk control with limb movement is fundamental to gait, throwing and change of direction. Difficulty or asymmetry here points to a reflexive-stability deficit.",
      "excellent": "Performs the same-side (ipsilateral) pattern each side with control and no loss of balance. Strong rotary stability.",
      "good": "Completes only the diagonal pattern, or with compensation, on one or both sides. Programme anti-rotation and quadruped stability work.",
      "average": "Cannot complete the diagonal pattern with control. Regress to dead bugs and bird-dogs with strict form.",
      "needs_work": "Cannot perform the pattern, or a positive Flexion Clearing Test (pain on spinal flexion), which scores this 0.",
      "note": "Also perform the Flexion Clearing Test — if positive (pain), this metric is scored 0. Score the LOWER side toward the total."
    },
    {
      "sort": 7, "name": "FMS Total Score", "unit": "/ 21", "lower_is_better": false,
      "bilateral": false, "screening_only": false, "thresholds": [14, 15, 17],
      "what": "The sum of the seven FMS test scores (using the lower side on each bilateral test). Range 0-21.",
      "why": "A single summary of movement quality. A composite score of 14 or below has been linked to a substantially higher injury rate in several athletic and tactical populations (Kiesel et al.). The total is best read alongside the individual scores, asymmetries and any pain.",
      "excellent": "18-21. Broadly clean movement across all seven patterns. Train and load with confidence; keep an eye on any single low score or asymmetry.",
      "good": "15-17. Solid overall movement with one or two patterns to develop. Target the lowest-scoring movements in warm-ups and accessory work.",
      "average": "14. Borderline — this is the level at which injury risk starts to rise in the literature. Address the limiting patterns deliberately and re-screen in 4-6 weeks.",
      "needs_work": "13 or below. Movement quality is a limiting factor. Build a corrective block around the lowest scores, manage high-risk loading, and re-screen before progressing.",
      "note": "Enter this manually after adding up the seven scores. Any score of 0 (pain) or any left-right asymmetry is a flag regardless of the total."
    },
    {
      "sort": 8, "name": "FMS Shoulder Clearing Test", "unit": "", "lower_is_better": true,
      "bilateral": false, "screening_only": true, "thresholds": [0, 0, 0],
      "what": "Hand placed on the opposite shoulder, elbow raised as high as possible. A pain response is a positive test.",
      "why": "Impingement-type pain in this position means the Shoulder Mobility result cannot be trusted and that lift/overhead loading should be limited pending assessment.",
      "excellent": "", "good": "", "average": "", "needs_work": "",
      "note": "Record 0 = negative (no pain) or 1 = positive (pain). A positive test scores FMS Shoulder Mobility as 0 and warrants referral."
    },
    {
      "sort": 9, "name": "FMS Extension Clearing Test", "unit": "", "lower_is_better": true,
      "bilateral": false, "screening_only": true, "thresholds": [0, 0, 0],
      "what": "From a press-up position, pressing the hips to the floor (prone press-up) to take the spine into extension. A pain response is a positive test.",
      "why": "Pain on spinal extension means the Trunk Stability Push-Up result cannot be trusted and extension-biased loading should be limited pending assessment.",
      "excellent": "", "good": "", "average": "", "needs_work": "",
      "note": "Record 0 = negative (no pain) or 1 = positive (pain). A positive test scores FMS Trunk Stability Push-Up as 0 and warrants referral."
    },
    {
      "sort": 10, "name": "FMS Flexion Clearing Test", "unit": "", "lower_is_better": true,
      "bilateral": false, "screening_only": true, "thresholds": [0, 0, 0],
      "what": "From quadruped, rocking the hips back toward the heels and rounding the spine into flexion. A pain response is a positive test.",
      "why": "Pain on spinal flexion means the Rotary Stability result cannot be trusted and flexion-biased loading should be limited pending assessment.",
      "excellent": "", "good": "", "average": "", "needs_work": "",
      "note": "Record 0 = negative (no pain) or 1 = positive (pain). A positive test scores FMS Rotary Stability as 0 and warrants referral."
    }
  ]'::jsonb;
begin
  -- Idempotent: skip entirely if this org already has an FMS battery.
  if exists (
    select 1 from test_batteries
    where organisation_id = p_org_id
      and name = 'FMS (Functional Movement Screen)'
  ) then
    return;
  end if;

  insert into test_batteries (organisation_id, name, description)
  values (
    p_org_id,
    'FMS (Functional Movement Screen)',
    'The seven-part Functional Movement Screen — deep squat, hurdle step, in-line lunge, shoulder mobility, active straight-leg raise, trunk stability push-up and rotary stability — plus the total score and the three clearing tests. Each pattern is scored 0-3; a total of 14 or below flags elevated injury risk.'
  )
  returning id into battery_id;

  for metric_def in select * from jsonb_array_elements(fms) loop
    insert into test_metrics (
      organisation_id, name, unit, better_direction,
      requires_bodyweight, is_bilateral, screening_only,
      what_it_measures, why_it_matters,
      commentary_excellent, commentary_good, commentary_average, commentary_needs_work,
      notes
    ) values (
      p_org_id,
      metric_def->>'name',
      metric_def->>'unit',
      case when (metric_def->>'lower_is_better')::boolean then 'lower' else 'higher' end,
      false,
      (metric_def->>'bilateral')::boolean,
      (metric_def->>'screening_only')::boolean,
      coalesce(metric_def->>'what', ''),
      coalesce(metric_def->>'why', ''),
      coalesce(metric_def->>'excellent', ''),
      coalesce(metric_def->>'good', ''),
      coalesce(metric_def->>'average', ''),
      coalesce(metric_def->>'needs_work', ''),
      coalesce(metric_def->>'note', '')
    )
    returning id into metric_id;

    insert into test_battery_metrics (test_battery_id, test_metric_id, sort_order)
    values (battery_id, metric_id, (metric_def->>'sort')::int);

    -- Rated metrics get one elite_youth + one general_population benchmark,
    -- identical thresholds, no sex/age bounds (a 3 is a 3 at any age).
    if not (metric_def->>'screening_only')::boolean then
      insert into test_benchmarks (
        test_metric_id, benchmark_type, sex, age_min, age_max,
        average_threshold, good_threshold, excellent_threshold
      ) values
        (metric_id, 'elite_youth', null, null, null,
          (metric_def->'thresholds'->>0)::numeric,
          (metric_def->'thresholds'->>1)::numeric,
          (metric_def->'thresholds'->>2)::numeric),
        (metric_id, 'general_population', null, null, null,
          (metric_def->'thresholds'->>0)::numeric,
          (metric_def->'thresholds'->>1)::numeric,
          (metric_def->'thresholds'->>2)::numeric);
    end if;
  end loop;
end;
$$;

-- ------------------------------------------------------------
-- Trigger: every new organisation gets the FMS battery.
-- ------------------------------------------------------------
create or replace function trg_seed_fms_battery()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Never let a default-battery seed failure block organisation
  -- creation / coach signup — log and carry on.
  begin
    perform seed_fms_battery(new.id);
  exception when others then
    raise warning 'seed_fms_battery failed for org %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists organisations_seed_fms on organisations;
create trigger organisations_seed_fms
  after insert on organisations
  for each row
  execute function trg_seed_fms_battery();

-- ------------------------------------------------------------
-- Backfill: seed every organisation that exists today.
-- ------------------------------------------------------------
do $$
declare
  o record;
begin
  for o in select id from organisations loop
    perform seed_fms_battery(o.id);
  end loop;
end $$;
