# Demo / seed scripts

All read `.env.local` for `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
(and `DEMO_COACH_EMAIL` / `DEMO_COACH_PASSWORD` for the base org). They target
the **"VIS BUILD Demo"** org only — a coach signs into it via `/demo`.

## Run order for a full demo

```bash
node scripts/seed-demo-org.js            # wipes + rebuilds the demo org:
                                         #   org + owner coach, library, 7 athletes,
                                         #   strength sessions + PBs, testing setup
                                         #   (cloned from the real org), 1 template,
                                         #   1 programme, 1 pinned announcement
node scripts/seed-demo-feature-data.js   # additive: check-ins, direct messages,
                                         #   VBT velocity profiles, testing histories
                                         #   + a group test session, recent sessions
                                         #   for "progress vs last time"
node scripts/seed-demo-extras.js         # additive: 2nd coach, groups + group chat,
                                         #   competitions, PB reactions/comments,
                                         #   challenges, weekly reflections, recovery
                                         #   sessions, cardio/hybrid + aerobic profiles,
                                         #   sport sessions, documents, Coach Forum
node scripts/seed-mas-hr-zones-demo.js   # "Marcus Vale (MAS)" — aerobic profile +
                                         #   weekly zoned cardio/hybrid block: 6 weeks
                                         #   logged, planned through END_DATE
node scripts/seed-training-load-rtp-demo.js  # "Rico Alvarez (RTP)" — 13 weeks of
                                             #   load/RTP data (ACWR spike, monotony,
                                             #   pain check-ins, return-to-play status),
                                             #   then planned sessions through END_DATE
node scripts/seed-rir-demo.js            # "Priya Anand (RIR)" — fixed 1RMs + a
                                         #   6-week Target RIR block (8 reps then
                                         #   5 reps, each 3→2→1 RIR); week 4 is
                                         #   today, unlogged, so the suggested-kg
                                         #   placeholder shows live
```

## `seed-demo-fill-gaps.js`

Non-destructive top-up, NOT part of the full-rebuild chain above — only
ever INSERTS new sessions on dates that don't already exist (the tail after
each athlete's last session, plus any gap longer than 7 days), for the 7 base
athletes + Marcus Webb (VBT) + Ryan Foster (continues each athlete's actual
last logged weight per exercise). Run this any time the demo's calendar has
gone stale (nothing scheduled past whenever it was last seeded) to restore
continuous no-gaps coverage through `END_DATE` (currently 2026-12-31 — bump
this constant in the file as time passes). Safe to re-run.

Marcus Vale (MAS) and Rico Alvarez (RTP) aren't covered by this script —
their own dedicated scripts above already regenerate relative to "today"
when re-run, so just re-run those directly to freshen them instead. Each
of those (and `seed-rir-demo.js`) has its own `END_DATE` constant too —
bump all four together.

```bash
node scripts/seed-demo-fill-gaps.js
DRY_RUN=1 node scripts/seed-demo-fill-gaps.js   # preview only, no writes
```

`seed-demo-org.js` is destructive (rebuilds the org). The rest are additive and
idempotent — safe to re-run individually; each deletes the rows it owns first.

## Requires migrations applied

`seed-demo-extras.js` uses tables from `0010`, `0011`, `0024`, `0025`, `0026`,
`0074`, `0085` (guarded — skips a section whose table is missing).
`seed-training-load-rtp-demo.js` and the RTP parts of `seed-demo-extras.js`
need `0088` + `0089`. `seed-mas-hr-zones-demo.js` needs `0086`.
`seed-rir-demo.js` needs `0112`.

## Not covered by any script

Power/Speed sprint/jump sessions, the Session Library grant flow, guided
multi-block recovery routines. Add these by hand in the demo org if needed.

## `set-demo-programme-status.js`

Standalone — sets one athlete's marker session date so the dashboard
"Programme status" panel shows a chosen state. Takes an offset in days.
