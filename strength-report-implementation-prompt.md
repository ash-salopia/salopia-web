# Implementation prompt — Strength (e1RM) report + report-builder tick boxes

## Context
Our athlete report generator currently produces a **Total Training Load (TTL)** report. TTL is total tonnage (sets × reps × weight) and conflates volume with strength. We want to add an **estimated 1RM (e1RM)** dimension so coaches can see strength progression, not just work done.

Our data model already stores per-set **weight and reps** for every exercise, and our engine already computes e1RM with a coach-selectable formula, manual per-exercise overrides, and fixed-vs-rolling 1RM. This work is a **reporting-layer change** — surface what the engine already produces; do not re-derive the strength engine.

## Goal
1. Add a **Strength (e1RM) report section** that mirrors the existing TTL section.
2. Add a **report-builder panel of tick boxes** shown at generation time, letting the coach choose exactly what goes in the report. Options apply to **both** the TTL and e1RM dimensions where relevant.
3. Reuse the engine's existing formula / mode / override settings — read them, don't rebuild them.

A working single-file front-end prototype exists (`athletiq-strength-report-prototype.html`) showing the target tables, radar overlay, e1RM line charts, highlights, AI-summary copy, and the manual / low-confidence tags. Match its behaviour.

---

## Report-builder tick boxes (generation-time UI)

Group the checkboxes. Mark each below as **[BUILD]** (new, needs implementing) or **[EXISTS]** (already in the current report function — wire it in, don't rebuild). Audit the current report code and correct these flags if any already exist.

### Metrics to include
- [ ] **Total Training Load (TTL)** — *[EXISTS]* keep current behaviour
- [ ] **Estimated 1RM (e1RM)** — *[BUILD]* new strength section
> If both ticked, render both sections. If neither, block generation with a validation message.

### Per-metric display components (apply the tick to whichever of TTL / e1RM is selected)
- [ ] **Progression table** (first / latest / Δ / % change per exercise) — TTL *[EXISTS]* · e1RM *[BUILD]*
- [ ] **Per-exercise weekly breakdown** (week, sessions, avg sets, value, vs-prev-week) — TTL *[EXISTS]* · e1RM *[BUILD]*
- [ ] **Sparkline / mini-trend per row** — *[BUILD]* (add to both)
- [ ] **Radar snapshot** (Week 1 vs latest, normalised to % of baseline) — *[BUILD]* (offer for both; strength is the primary use)
- [ ] **Line chart over time** (per exercise, by week) — *[BUILD]* (offer for both)
- [ ] **Highlights** — Top progressed / Worth a review — TTL ranks by load change *[EXISTS]* · e1RM ranks by strength change *[BUILD]*. Allow ranking by either or both.
- [ ] **AI summary** — *[EXISTS for TTL]*; *[BUILD]* an e1RM-aware summary that respects the 1RM mode (see below)

### e1RM options (only enabled when e1RM metric ticked — read from engine settings, expose as report toggles)
- [ ] **Formula** — Epley / Brzycki / Lombardi *[EXISTS in engine]* — display which formula was used in the report header
- [ ] **1RM mode** — Rolling / Fixed *[EXISTS in engine]* — display in header; drives summary wording
- [ ] **Show manual overrides** with a `manual` tag *[EXISTS in engine]* — *[BUILD]* the tag rendering
- [ ] **Low-confidence flag** on e1RM from sets above a rep cap (default > 12 reps) — *[BUILD]*, cap value configurable

### Scope / formatting (apply to whole report)
- [ ] Date range *[EXISTS]*
- [ ] Exercise selection / limit (cap radar to ~6–8 exercises) — *[BUILD]* the cap; selection may *[EXIST]*
- [ ] Bodyweight-relative values (e1RM ÷ bodyweight) — *[BUILD]* optional
- [ ] Recurring themes from notes *[EXISTS]*

---

## Behaviour requirements

**e1RM values** come from the engine's best-set-per-session estimate using the selected formula. Do not recompute from raw sets in the reporting layer if the engine already exposes e1RM — read it.

**Fixed vs Rolling changes the meaning and the copy:**
- *Rolling* — smooths week-to-week noise; report and AI summary should read week-over-week movement as genuine trend.
- *Fixed* — values are distance from a fixed reference max; summary must say movement reflects distance from reference, not week-to-week change. The AI summary must not misattribute the mode.

**Radar normalisation** — never plot raw kg across exercises (a 1000 kg squat total dwarfs a 70 kg hold and flattens the shape). Normalise to % of Week 1 baseline, or bodyweight-relative if that option is ticked. Cap to the selected/top exercises.

**Highlights** — TTL highlights rank by load change; e1RM highlights rank by strength change. These can tell opposite stories (a squat can drop on strength while volume holds) — surface both when both metrics are selected.

**Header disclosure** — the report must state the e1RM formula and mode in use, and mark manual and low-confidence values with visible tags, so a coach reading the PDF knows the provenance of each number.

**Validation** — at least one metric must be selected; disable e1RM sub-options when e1RM is unticked.

## Deliverables
1. Report-builder checkbox panel wired to the generation payload, with the [EXISTS]/[BUILD] audit completed against current code.
2. e1RM report section matching the prototype (table, weekly breakdown, sparklines, radar, line chart, highlights, AI summary, tags).
3. TTL section unchanged in output but re-plumbed so shared components (radar, line chart, sparkline) are metric-agnostic.
4. Header provenance line (formula, mode) and per-value tags.

## Acceptance
- Ticking only TTL reproduces today's report exactly.
- Ticking only e1RM produces a strength-only report.
- Ticking both produces a combined report with independent highlights.
- Switching formula or mode changes values and the AI summary wording accordingly.
- Manual and low-confidence values are tagged; radar is normalised and capped.
