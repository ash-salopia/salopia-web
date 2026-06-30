-- ============================================================
-- 0027_testing_real_norms.sql
-- ============================================================
-- Ports the real, research-backed norms from the original
-- salopia_report_engine.py (Python/ReportLab) tool into the
-- database-driven testing system.
--
-- Key changes from the earlier placeholder seed:
--
-- 1. test_benchmarks moves from a 2-threshold (green/amber) RAG
--    model to the real 4-tier model: Excellent / Good / Average /
--    Needs Work, with explicit thresholds for the first three (a
--    result worse than "average" is Needs Work by elimination —
--    this matches the Python source, where a "needs_work" value
--    was stored but never actually used as a boundary).
--
-- 2. test_metrics gains rich commentary fields (what it measures,
--    why it matters, and per-tier guidance text) so reports can
--    show the same auto-generated, personalised commentary the
--    original tool produced — ported verbatim from TEST_INFO.
--
-- 3. test_metrics gains `screening_only` for tests like Single Leg
--    CMJ that are deliberately never rated against norms (no youth
--    normative height data exists) — used for asymmetry screening
--    instead, per the original tool's design.
--
-- 4. athletes gains sex + date_of_birth (needed to match benchmarks
--    by sex/age band — carried over from the earlier migration
--    attempt, included here since that migration is being replaced).
--
-- Both "elite_youth" and "general_population" benchmarks are
-- always shown side by side in reports (never just one) — this is
-- a deliberate design decision from the original tool: a single
-- scale either looks discouraging (elite-only) or meaninglessly
-- easy (population-only) on its own.
-- ============================================================

alter table athletes
  add column if not exists sex text check (sex in ('male', 'female')),
  add column if not exists date_of_birth date;

-- ------------------------------------------------------------
-- Rebuild test_benchmarks with the real 4-tier threshold model
-- ------------------------------------------------------------
alter table test_benchmarks
  drop column if exists green_threshold,
  drop column if exists amber_threshold;

alter table test_benchmarks
  add column if not exists excellent_threshold numeric,
  add column if not exists good_threshold numeric,
  add column if not exists average_threshold numeric;

-- Backfilled values are required going forward; any pre-existing
-- placeholder rows (from the earlier 0027 attempt, now superseded)
-- are removed below before the NOT NULL constraint is enforced.
delete from test_benchmarks where excellent_threshold is null;

alter table test_benchmarks
  alter column excellent_threshold set not null,
  alter column good_threshold set not null,
  alter column average_threshold set not null;

-- ------------------------------------------------------------
-- Rich per-metric commentary + screening flag
-- ------------------------------------------------------------
alter table test_metrics
  add column if not exists screening_only boolean not null default false,
  add column if not exists what_it_measures text default '',
  add column if not exists why_it_matters text default '',
  add column if not exists commentary_excellent text default '',
  add column if not exists commentary_good text default '',
  add column if not exists commentary_average text default '',
  add column if not exists commentary_needs_work text default '';

-- ------------------------------------------------------------
-- Clear out any placeholder battery/metrics/benchmarks from the
-- earlier (superseded) seed migration before re-seeding with the
-- real data, so re-running this migration is idempotent and orgs
-- don't end up with both the placeholder and real versions.
-- ------------------------------------------------------------
delete from test_batteries where name = 'General Fitness Battery';
delete from test_metrics where name in (
  '10m Sprint', '20m Sprint', 'Countermovement Jump (CMJ)',
  'Standing Broad Jump', '505 Change of Direction'
) and not exists (
  select 1 from test_results r where r.test_metric_id = test_metrics.id
);

-- ------------------------------------------------------------
-- Seed real Salopia Youth Testing Battery + metrics + dual
-- benchmarks (elite_youth + general_population) for every
-- organisation. Wrapped in a DO block driven by a JSONB literal
-- so the (substantial) norms table stays readable and is
-- transcribed faithfully from salopia_report_engine.py.
-- ------------------------------------------------------------
do $$
declare
  org record;
  battery_id uuid;
  metric_id uuid;
  metric_def jsonb;
  band jsonb;
  sex_key text;
  m record;

  -- Each metric: key, display name, unit, lower_is_better, bilateral,
  -- requires_bodyweight, screening_only, what/why/commentary, and an
  -- array of age bands. Each band: age_min, age_max, then per-sex
  -- elite [average, good, excellent] and gen_pop [average, good, excellent]
  -- thresholds (the "needs_work" value from the Python source is the
  -- 1st of its 4-tuple and is never used as a boundary, so it's
  -- intentionally omitted here).
  norms jsonb := '[
    {
      "name": "10m Sprint", "unit": "s", "lower_is_better": true, "bilateral": false,
      "requires_bodyweight": false, "screening_only": false,
      "what": "The 10m sprint measures acceleration — the ability to generate speed rapidly from a standing start. This reflects neuromuscular explosiveness, stride mechanics, and fast-twitch muscle fibre recruitment.",
      "why": "Acceleration underpins first-step quickness in virtually every sport — pressing, chasing, explosive changes of direction. One of the most important physical qualities in field and court sports.",
      "excellent": "Excellent acceleration for elite youth athletes. Among the fastest in their age group in a trained population. Maintain with sprint mechanics and lower-body power work.",
      "good": "Good acceleration for their age. A solid foundation — progressive sprint training and plyometrics will continue to develop this quality.",
      "average": "Average acceleration for their age. Sprint mechanics coaching, resisted sprints, and lower-body power development should be prioritised in the next training block.",
      "needs_work": "Below average acceleration for their age. Highly trainable — focused sprint technique work, plyometrics, and strength foundations will drive rapid improvement.",
      "bands": [
        {"min":8,"max":10,  "M":{"elite":[2.30,2.15,2.00],"gen_pop":[2.48,2.32,2.18]}, "F":{"elite":[2.40,2.25,2.10],"gen_pop":[2.62,2.46,2.30]}},
        {"min":11,"max":12, "M":{"elite":[2.05,1.98,1.85],"gen_pop":[2.32,2.18,2.05]}, "F":{"elite":[2.18,2.10,1.96],"gen_pop":[2.46,2.30,2.15]}},
        {"min":13,"max":14, "M":{"elite":[1.95,1.85,1.75],"gen_pop":[2.20,2.05,1.93]}, "F":{"elite":[2.12,2.00,1.90],"gen_pop":[2.36,2.20,2.06]}},
        {"min":15,"max":16, "M":{"elite":[1.85,1.75,1.65],"gen_pop":[2.10,1.95,1.83]}, "F":{"elite":[2.05,1.94,1.83],"gen_pop":[2.28,2.12,1.98]}},
        {"min":17,"max":18, "M":{"elite":[1.78,1.68,1.58],"gen_pop":[2.03,1.88,1.76]}, "F":{"elite":[1.98,1.87,1.76],"gen_pop":[2.22,2.07,1.93]}}
      ]
    },
    {
      "name": "Countermovement Jump", "unit": "cm", "lower_is_better": false, "bilateral": false,
      "requires_bodyweight": false, "screening_only": false,
      "what": "The Countermovement Jump (CMJ) measures lower-body explosive power and the stretch-shortening cycle — the ability to store elastic energy in a downward dip and release it explosively upward. Arms held on hips to isolate lower-body contribution.",
      "why": "Jump height reflects combined power output of the hips, knees, and ankles. Predicts sprint speed, change-of-direction ability, and overall athletic explosiveness.",
      "excellent": "Excellent jump height — explosive power well beyond age expectations. Continue with high-intensity plyometrics and progressive lower-body strength work.",
      "good": "Good explosive power for their age. A strong platform — progress towards depth jumps and bounding, and increase lower-body strength loading.",
      "average": "Average jump height for their age. Develop hip and knee extensor strength alongside progressive plyometric training.",
      "needs_work": "Below average jump height for their age. Focus on fundamental lower-body strength and introduce basic plyometrics with quality mechanics before increasing intensity.",
      "bands": [
        {"min":8,"max":10,  "M":{"elite":[22,27,32],"gen_pop":[18,22,27]}, "F":{"elite":[18,22,27],"gen_pop":[14,18,22]}},
        {"min":11,"max":12, "M":{"elite":[27,31,35],"gen_pop":[23,27,31]}, "F":{"elite":[22,26,31],"gen_pop":[18,22,26]}},
        {"min":13,"max":14, "M":{"elite":[33,38,44],"gen_pop":[28,33,38]}, "F":{"elite":[24,29,34],"gen_pop":[20,24,29]}},
        {"min":15,"max":16, "M":{"elite":[38,44,50],"gen_pop":[33,38,44]}, "F":{"elite":[26,31,36],"gen_pop":[22,26,31]}},
        {"min":17,"max":18, "M":{"elite":[42,48,54],"gen_pop":[36,42,48]}, "F":{"elite":[27,32,37],"gen_pop":[22,27,32]}}
      ]
    },
    {
      "name": "Reactive Strength Index (10-5)", "unit": "m/s", "lower_is_better": false, "bilateral": false,
      "requires_bodyweight": false, "screening_only": false,
      "what": "Reactive Strength Index (RSI) via the 10-5 test measures the quality of the fast stretch-shortening cycle — how quickly an athlete can absorb ground impact and redirect force upward across 10 repeated maximal hops. Calculated as jump height divided by ground contact time (m/s).",
      "why": "RSI reflects tendon stiffness, neuromuscular timing, and plyometric capacity. Directly linked to sprint speed, agility, and resilience to lower-limb injury.",
      "excellent": "Excellent RSI for elite youth athletes. Outstanding fast SSC capacity — continue with advanced reactive work (drop jumps, hurdle hops) emphasising minimal ground contact.",
      "good": "Good RSI for their age. The reactive system is developing well. Continue with progressive plyometric loading, emphasising quick ground contact time.",
      "average": "Average RSI for their age. Focus on ankle stiffness drills, pogo jumps, and plyometric progressions cued for quick ground contact.",
      "needs_work": "Below average RSI for their age. Begin with ankle stiffness and pogo work before advancing to bounding and reactive plyometrics.",
      "note": "Not the same scale as CMJ-derived RSI-modified, which produces much lower values (~0.2-0.7 m/s) for the same athlete. Using RSImod norms here will badly under-rate athletes.",
      "bands": [
        {"min":8,"max":10,  "M":{"elite":[0.80,1.05,1.35],"gen_pop":[0.60,0.80,1.05]}, "F":{"elite":[0.70,0.90,1.15],"gen_pop":[0.50,0.70,0.90]}},
        {"min":11,"max":12, "M":{"elite":[0.95,1.25,1.60],"gen_pop":[0.75,0.95,1.25]}, "F":{"elite":[0.80,1.05,1.35],"gen_pop":[0.60,0.80,1.05]}},
        {"min":13,"max":14, "M":{"elite":[1.15,1.45,1.80],"gen_pop":[0.90,1.15,1.45]}, "F":{"elite":[0.90,1.20,1.50],"gen_pop":[0.70,0.90,1.20]}},
        {"min":15,"max":16, "M":{"elite":[1.30,1.65,2.00],"gen_pop":[1.05,1.30,1.65]}, "F":{"elite":[1.05,1.35,1.65],"gen_pop":[0.80,1.05,1.35]}},
        {"min":17,"max":18, "M":{"elite":[1.45,1.80,2.20],"gen_pop":[1.15,1.45,1.80]}, "F":{"elite":[1.10,1.40,1.70],"gen_pop":[0.85,1.10,1.40]}}
      ]
    },
    {
      "name": "Squat Jump", "unit": "cm", "lower_is_better": false, "bilateral": false,
      "requires_bodyweight": false, "screening_only": false,
      "what": "The Squat Jump (SJ) measures concentric-only lower-body explosive power. The athlete pauses at the bottom of the squat position for 2-3 seconds before jumping, removing the stretch-shortening cycle (SSC) contribution. Isolates pure force-generating capacity from a static position.",
      "why": "Comparing SJ with CMJ reveals how much an athlete benefits from the SSC. A large CMJ-SJ gap indicates good elastic energy storage. SJ also measures foundational leg strength and concentric power independent of reactive ability.",
      "excellent": "Excellent squat jump height — strong concentric leg power and a solid force-producing foundation. Continue with progressive strength and explosive work.",
      "good": "Good squat jump height for their age. A strong base — continue developing lower-body strength through compound movements alongside plyometric progressions.",
      "average": "Average squat jump height for their age. Increasing lower-body strength work should be a priority — compound lifts such as squats and hip hinges will directly improve this quality.",
      "needs_work": "Below average squat jump height for their age. Focus on building foundational lower-body strength through progressive compound movements before increasing jump training volume.",
      "bands": [
        {"min":8,"max":10,  "M":{"elite":[18,23,28],"gen_pop":[13,18,23]}, "F":{"elite":[15,20,25],"gen_pop":[11,15,20]}},
        {"min":11,"max":12, "M":{"elite":[23,29,35],"gen_pop":[18,23,29]}, "F":{"elite":[19,24,30],"gen_pop":[15,19,24]}},
        {"min":13,"max":14, "M":{"elite":[27,33,40],"gen_pop":[22,27,33]}, "F":{"elite":[22,28,34],"gen_pop":[18,22,28]}},
        {"min":15,"max":16, "M":{"elite":[33,40,47],"gen_pop":[27,33,40]}, "F":{"elite":[26,32,39],"gen_pop":[21,26,32]}},
        {"min":17,"max":18, "M":{"elite":[38,45,52],"gen_pop":[32,38,45]}, "F":{"elite":[29,35,42],"gen_pop":[23,29,35]}}
      ]
    },
    {
      "name": "IMTP Peak Force (kg)", "unit": "kg", "lower_is_better": false, "bilateral": false,
      "requires_bodyweight": false, "screening_only": false,
      "what": "The Isometric Mid Thigh Pull (IMTP) measures the maximum force an athlete can produce through the whole body in a static pull — engaging the legs, glutes, back, and grip simultaneously against a fixed bar. This row shows absolute peak force in kilograms.",
      "why": "The strength of the legs, glutes, back, and grip working together is one of the strongest predictors of speed, power, and injury resilience in young athletes. Athletes who can produce more total force have a significant advantage in virtually every sport.",
      "excellent": "Excellent absolute peak force for their age — a strong result even accounting for body size differences. Continue with progressive compound movements to build on this.",
      "good": "Good absolute peak force for their age. Continue developing with progressive compound lifts — deadlifts, trap bar and RDLs. Record bodyweight at the next session for a more precise relative strength comparison.",
      "average": "Average absolute peak force for their age. Increasing strength work to improve force production should be a priority in the next training block. Record bodyweight at the next session for a relative strength comparison.",
      "needs_work": "Below average absolute peak force for their age. Focus on building foundational strength through compound movements. Record bodyweight at the next session for a more precise comparison.",
      "note": "Only shown when bodyweight is not recorded — prefer IMTP Relative (N/kg) whenever bodyweight is known. Never show both in the same report.",
      "bands": [
        {"min":8,"max":10,  "M":{"elite":[75,100,125],"gen_pop":[55,75,100]}, "F":{"elite":[60,80,100],"gen_pop":[45,60,80]}},
        {"min":11,"max":12, "M":{"elite":[105,130,160],"gen_pop":[80,105,130]}, "F":{"elite":[85,110,135],"gen_pop":[65,85,110]}},
        {"min":13,"max":14, "M":{"elite":[140,175,210],"gen_pop":[110,140,175]}, "F":{"elite":[110,140,170],"gen_pop":[85,110,140]}},
        {"min":15,"max":16, "M":{"elite":[185,225,270],"gen_pop":[150,185,225]}, "F":{"elite":[140,170,205],"gen_pop":[110,140,170]}},
        {"min":17,"max":18, "M":{"elite":[225,270,320],"gen_pop":[185,225,270]}, "F":{"elite":[165,200,240],"gen_pop":[130,165,200]}}
      ]
    },
    {
      "name": "IMTP Relative (N/kg)", "unit": "N/kg", "lower_is_better": false, "bilateral": false,
      "requires_bodyweight": true, "screening_only": false,
      "what": "The Isometric Mid Thigh Pull (IMTP) measures the maximum force an athlete can produce through the whole body in a static pull — engaging the legs, glutes, back, and grip simultaneously against a fixed bar. This row expresses force relative to bodyweight (N/kg), the gold-standard comparison as it accounts for body size.",
      "why": "The strength of the legs, glutes, back, and grip working together is one of the strongest predictors of speed, power, and injury resilience in young athletes. Expressing this relative to bodyweight allows meaningful comparison across athletes of different sizes and ages.",
      "excellent": "Excellent relative strength for trained youth athletes of this age. A strong, powerful athlete — continue with progressive compound lifting and monitor for left-right asymmetries.",
      "good": "Good relative strength for their age. A solid base — continue developing with progressive compound lifts including deadlifts, trap bar and Romanian deadlifts.",
      "average": "Average relative strength for their age. Increasing strength work to improve force production should be a priority — introduce and progress compound lower-body and hip hinge movements with appropriate loading.",
      "needs_work": "Below average relative strength for their age. Increasing strength work to improve force production is the key priority — focus on technical mastery of fundamental movements first, then build load consistently.",
      "note": "Research found a moderate-large correlation (r=0.54-0.72) between grip strength and IMTP peak force in elite footballers — an athlete with strong compound lift numbers but a surprisingly low IMTP score may be grip-limited rather than genuinely weak through the legs/hips/back. Worth a retest with lifting straps if this pattern shows up.",
      "bands": [
        {"min":8,"max":10,  "M":{"elite":[20,26,32],"gen_pop":[14,20,26]}, "F":{"elite":[16,21,27],"gen_pop":[12,16,21]}},
        {"min":11,"max":12, "M":{"elite":[24,30,37],"gen_pop":[18,24,30]}, "F":{"elite":[20,25,31],"gen_pop":[15,20,25]}},
        {"min":13,"max":14, "M":{"elite":[28,35,42],"gen_pop":[22,28,35]}, "F":{"elite":[23,29,35],"gen_pop":[18,23,29]}},
        {"min":15,"max":16, "M":{"elite":[32,39,46],"gen_pop":[26,32,39]}, "F":{"elite":[26,32,38],"gen_pop":[21,26,32]}},
        {"min":17,"max":18, "M":{"elite":[36,42,50],"gen_pop":[30,36,42]}, "F":{"elite":[28,34,41],"gen_pop":[22,28,34]}}
      ]
    },
    {
      "name": "505 Change of Direction", "unit": "s", "lower_is_better": true, "bilateral": true,
      "requires_bodyweight": false, "screening_only": false,
      "what": "The 5-0-5 Change of Direction test measures the time to sprint 5m, perform a 180-degree turn, and sprint 5m back through the timing gate. Tested off each foot independently to screen for left-right asymmetries.",
      "why": "Change of direction speed is a critical performance quality in most field and court sports. Testing each leg separately reveals asymmetries that could indicate injury risk or movement deficiencies.",
      "excellent": "Excellent change of direction speed for their age. A genuine athletic strength — maintain with reactive agility work and single-leg strength development.",
      "good": "Good change of direction speed for their age. Continue developing with deceleration mechanics coaching and single-leg strength progressions.",
      "average": "Average change of direction speed for their age. Focus on deceleration mechanics, single-leg strength, and reactive footwork patterns.",
      "needs_work": "Below average change of direction speed. Prioritise deceleration and re-acceleration technique coaching, single-leg strength, and hip control.",
      "bands": [
        {"min":8,"max":10,  "M":{"elite":[2.78,2.65,2.52],"gen_pop":[2.90,2.78,2.65]}, "F":{"elite":[2.92,2.78,2.65],"gen_pop":[3.05,2.92,2.78]}},
        {"min":11,"max":12, "M":{"elite":[2.67,2.54,2.42],"gen_pop":[2.80,2.67,2.54]}, "F":{"elite":[2.82,2.68,2.55],"gen_pop":[2.95,2.82,2.68]}},
        {"min":13,"max":14, "M":{"elite":[2.60,2.46,2.33],"gen_pop":[2.75,2.60,2.46]}, "F":{"elite":[2.76,2.62,2.48],"gen_pop":[2.90,2.76,2.62]}},
        {"min":15,"max":16, "M":{"elite":[2.50,2.37,2.24],"gen_pop":[2.65,2.50,2.37]}, "F":{"elite":[2.68,2.54,2.40],"gen_pop":[2.82,2.68,2.54]}},
        {"min":17,"max":18, "M":{"elite":[2.44,2.31,2.18],"gen_pop":[2.58,2.44,2.31]}, "F":{"elite":[2.62,2.48,2.35],"gen_pop":[2.76,2.62,2.48]}}
      ]
    },
    {
      "name": "Anterior Hold", "unit": "s", "lower_is_better": false, "bilateral": false,
      "requires_bodyweight": false, "screening_only": false,
      "what": "The Anterior Hold measures endurance of the deep anterior core — transverse abdominis, rectus abdominis, and hip flexors — in maintaining a stable position against gravity. The athlete holds a specific position for as long as possible with good form.",
      "why": "Anterior core stability is essential for force transfer between the lower and upper body, spinal protection under load, and injury prevention at the hips and lower back. A fundamental quality for all athletes.",
      "excellent": "Excellent anterior core endurance for trained youth. Strong stability — progress with weighted planks, hollow holds, and anti-extension exercises.",
      "good": "Good anterior core endurance for their age. Continue developing through progressive loading — hollow body positions, dead bugs, and plank progressions.",
      "average": "Average anterior hold time for their age. Focus on building endurance quality — hollow body, dead bugs, and front plank before adding external load.",
      "needs_work": "Below average anterior core endurance for their age. Begin with supported positions, focus on breathing and tension quality, and progress duration before adding load.",
      "note": "No published youth normative study exists for this test — practitioner benchmarks only, single age band 8-18.",
      "bands": [
        {"min":8,"max":18, "M":{"elite":[35,50,65],"gen_pop":[20,35,50]}, "F":{"elite":[35,50,65],"gen_pop":[20,35,50]}}
      ]
    },
    {
      "name": "Side Plank", "unit": "s", "lower_is_better": false, "bilateral": false,
      "requires_bodyweight": false, "screening_only": false,
      "what": "The Side Plank test measures lateral core endurance — specifically the obliques, quadratus lumborum, and hip abductors working to resist lateral spinal flexion under sustained load.",
      "why": "Lateral core stability supports frontal-plane control during running, cutting, and landing. Directly linked to knee valgus reduction, hip stability, and injury resilience.",
      "excellent": "Excellent lateral core endurance for trained youth. Continue developing with side plank variations and hip abductor strengthening.",
      "good": "Good lateral core endurance for their age. Progress with side plank variations (with reach, hip dips) and include dedicated hip abductor work.",
      "average": "Average lateral core endurance for their age. Focus on side plank quality and consistency, adding clamshells and lateral band walks.",
      "needs_work": "Below average lateral core endurance for their age. Begin with modified side plank (from knees) and integrate glute medius activation work.",
      "note": "No published youth normative study exists for this test — practitioner benchmarks only, single age band 8-18.",
      "bands": [
        {"min":8,"max":18, "M":{"elite":[45,65,85],"gen_pop":[25,45,65]}, "F":{"elite":[45,65,85],"gen_pop":[25,45,65]}}
      ]
    },
    {
      "name": "Grip Strength", "unit": "kg", "lower_is_better": false, "bilateral": false,
      "requires_bodyweight": false, "screening_only": false,
      "what": "Grip strength measures the maximum isometric force of the hand and forearm flexors, tested using a hand dynamometer and expressed in kilograms.",
      "why": "Grip strength is a reliable proxy for overall upper body and systemic muscular strength in youth athletes. Predicts pulling capacity, carry strength, and general robustness.",
      "excellent": "Excellent grip strength for their age. Strong upper body development — maintain through pulling movements, carries, and loaded gripping work.",
      "good": "Good grip strength for their age. A solid foundation — continue with pulling movements and consider increasing pulling volume.",
      "average": "Average grip strength for their age. Introduce pulling movements (rows, deadlifts, farmer carries) and specific grip training — dead hangs, plate pinches.",
      "needs_work": "Below average grip strength for their age. Build pulling strength fundamentals — banded rows, inverted rows, dead hangs. Grip responds quickly to consistent loading.",
      "bands": [
        {"min":8,"max":10,  "M":{"elite":[17,22,27],"gen_pop":[13,17,22]}, "F":{"elite":[14,18,22],"gen_pop":[11,14,18]}},
        {"min":11,"max":12, "M":{"elite":[22,27,34],"gen_pop":[17,22,27]}, "F":{"elite":[18,22,27],"gen_pop":[14,18,22]}},
        {"min":13,"max":14, "M":{"elite":[30,38,47],"gen_pop":[23,30,38]}, "F":{"elite":[22,27,33],"gen_pop":[18,22,27]}},
        {"min":15,"max":16, "M":{"elite":[40,49,58],"gen_pop":[32,40,49]}, "F":{"elite":[25,30,36],"gen_pop":[20,25,30]}},
        {"min":17,"max":18, "M":{"elite":[46,55,64],"gen_pop":[38,46,55]}, "F":{"elite":[26,31,37],"gen_pop":[21,26,31]}}
      ]
    },
    {
      "name": "Single Leg CMJ", "unit": "cm", "lower_is_better": false, "bilateral": true,
      "requires_bodyweight": false, "screening_only": true,
      "what": "Single Leg CMJ measures unilateral lower-body explosive power — each leg jumping independently. Used here purely as a left/right asymmetry screen.",
      "why": "Significant left-right asymmetry in single-leg power output is an established injury-risk marker, particularly for non-contact ACL and hamstring injuries.",
      "excellent": "", "good": "", "average": "", "needs_work": "",
      "note": "No published youth normative data exists for Single Leg CMJ jump height itself, so it is never rated — shown for asymmetry screening only. Asymmetry benchmarks: <10% normal, 10-15% monitor, >15% clinical concern (Donskov et al. 2021).",
      "bands": []
    }
  ]'::jsonb;

begin
  for org in select id from organisations loop
    if exists (select 1 from test_batteries where organisation_id = org.id and name = 'Salopia Youth Testing Battery') then
      continue;
    end if;

    insert into test_batteries (organisation_id, name, description)
    values (org.id, 'Salopia Youth Testing Battery', 'Standard youth physical testing battery — sprint, jump, strength, agility, and core tests with elite youth + general population benchmarks.')
    returning id into battery_id;

    for metric_def in select * from jsonb_array_elements(norms) loop
      insert into test_metrics (
        organisation_id, name, unit, better_direction, requires_bodyweight, is_bilateral,
        screening_only, what_it_measures, why_it_matters,
        commentary_excellent, commentary_good, commentary_average, commentary_needs_work,
        notes
      ) values (
        org.id,
        metric_def->>'name',
        metric_def->>'unit',
        case when (metric_def->>'lower_is_better')::boolean then 'lower' else 'higher' end,
        (metric_def->>'requires_bodyweight')::boolean,
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
      select battery_id, metric_id, (row_number() over ()) - 1
      where not exists (select 1 from test_battery_metrics where test_battery_id = battery_id and test_metric_id = metric_id);

      for band in select * from jsonb_array_elements(metric_def->'bands') loop
        foreach sex_key in array array['M','F'] loop
          insert into test_benchmarks (
            test_metric_id, benchmark_type, sex, age_min, age_max,
            average_threshold, good_threshold, excellent_threshold
          ) values (
            metric_id, 'elite_youth',
            case sex_key when 'M' then 'male' else 'female' end,
            (band->>'min')::numeric, (band->>'max')::numeric,
            (band->sex_key->'elite'->>0)::numeric,
            (band->sex_key->'elite'->>1)::numeric,
            (band->sex_key->'elite'->>2)::numeric
          );
          insert into test_benchmarks (
            test_metric_id, benchmark_type, sex, age_min, age_max,
            average_threshold, good_threshold, excellent_threshold
          ) values (
            metric_id, 'general_population',
            case sex_key when 'M' then 'male' else 'female' end,
            (band->>'min')::numeric, (band->>'max')::numeric,
            (band->sex_key->'gen_pop'->>0)::numeric,
            (band->sex_key->'gen_pop'->>1)::numeric,
            (band->sex_key->'gen_pop'->>2)::numeric
          );
        end loop;
      end loop;
    end loop;
  end loop;
end $$;
