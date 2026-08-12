# VIS BUILD — Project Context for Claude Code

This file is read automatically by Claude Code at the start of every session
in this folder. It exists so you don't have to re-explain the project from
scratch each time.

## What this is

VIS BUILD (formerly Salopia, then AthletiQ) is a commercial coaching platform
for sports coaches and athletes. Ash is the solo developer and owner, and
also a practicing coach who uses the platform himself. Long-term goal: sell
seat-based licenses to other coaches.

## Stack

Next.js 14 (App Router), TypeScript, Tailwind CSS, Supabase (Postgres + RLS
+ Auth), Vercel, Node v24, npm 11.

## Architecture — two separate surfaces

1. **Coach dashboard** — `/app/(coach)/...` — requires Supabase Auth login,
   RLS-protected via `my_organisation_id()` (defined in
   `0001_organisations_and_coaches.sql`), which derives from `auth.uid()`.
   Every coach-facing table's RLS policy checks against this.

2. **Athlete share-link app** — `/app/a/[token]/...` and
   `/app/api/athlete-link/*` — athletes have NO Supabase Auth account.
   They access their data via a unique `share_token` on the athletes table.
   These routes use `createServiceRoleClient()` (from `lib/supabase-service.ts`),
   which **bypasses RLS entirely**. This means: every athlete-link route
   MUST manually verify the resolved athlete (from
   `getAthleteByShareToken(token)`) owns whatever it's reading/writing.
   Never trust an `athleteId` passed in a request body — always resolve
   it from the token first, then use that resolved ID for all queries.

## Critical gotchas (learned the hard way — don't repeat these)

- **`/api/athlete-link/*` middleware rule**: this whole prefix bypasses the
  login-redirect check in `middleware.ts` (athletes have no login session).
  API routes under this prefix must NEVER redirect to `/login` — always
  return JSON errors. Any NEW route under this prefix must do its OWN
  security check if it's actually coach-only (see `detect-pb/route.ts` for
  the pattern — it lives under `/api/athlete-link/` for historical reasons
  but is coach-only, so it checks `auth.getUser()` itself).

- **`lib/supabase-service.ts` must stay untouched/minimal.** Do not add a
  custom `global.fetch` override to force cache behaviour — this broke
  every WRITE operation (POST/PATCH/DELETE) in production because
  Node's undici fetch rejects a `cache` option on non-GET requests.
  If you need fresh reads, use `unstable_noStore()` from `next/cache`
  inside the specific data function instead (see
  `getAthleteSessions` in `lib/data/athlete-share-link.ts` for the
  correct pattern).

- **Next.js caching is layered and easy to get wrong.** For any
  athlete-facing page/route that must always show fresh data:
  `export const dynamic = "force-dynamic";` at the top of the
  page/route, AND `unstable_noStore()` inside the actual data-fetching
  function. Client-side fetches also need `{ cache: "no-store" }`
  explicitly — mobile Safari caches aggressively otherwise.

- **`personal-bests.ts` corrupts if opened in TextEdit** (emoji chars
  break encoding). Always edit via VS Code or direct file write, never
  copy/paste through TextEdit.

- **PB detection (`detectPBAsync` in `app/api/athlete-link/log/route.ts`)**
  must NEVER use `sessions!inner(date)` style embedded joins — use two
  separate queries (get exercise → get session) with explicit error
  logging. Silent join failures previously caused PBs to not be
  recorded with zero visible error.

- **Weight/reps inputs in the athlete app save on `onBlur`, not
  `onChange`.** Saving on every keystroke caused false PB detection
  (e.g. typing "50" would fire a save for "5" first, with `done: true`
  already set, registering a fake 5kg PB before the full value landed).

- **`source_session_id`** (added in `0029_source_session_id.sql`) is a
  self-referencing FK into `sessions(id)`, linking a copied session
  back to its original and enabling "update all future occurrences"
  propagation (`propagateFutureOccurrences` in `lib/data/sessions.ts`).
  Only sessions created via `copySessionToDates` or `copySessionsRange`
  have this set — both copy from a real prior `sessions` row, so the FK
  is satisfiable. `loadProgrammeSessionForAthlete` and
  `loadTemplateForAthlete` deliberately leave it unset: their source is
  a `programme_sessions`/`template_defs` row, a different table/id-space
  that can never satisfy that FK (2026-08-10 fix — it previously set
  `source_session_id: programmeSession.id` here, which violated the FK
  constraint on literally every "Load onto athlete" / "Assign
  programme" attempt). Scratch-built sessions never have it either —
  the "update future occurrences" UI only shows when it's present.

## Reliability infrastructure (in place as of this session)

- **Husky pre-push hook** runs `tsc --noEmit` automatically before every
  push (installed via `npm install`, hook lives in `.husky/pre-push`).
  If a push is blocked and you're certain it's a false positive, bypass
  with `git push --no-verify`, but treat that as a last resort.
- **Seat licensing groundwork**: `organisations.seat_limit` +
  `organisations.plan` columns, enforced by a DB trigger
  (`check_seat_limit()` in `0030_seat_licensing.sql`). `createAthlete`
  in `lib/data/athletes.ts` translates the trigger's exception into a
  friendly error message.
- **Session RPE**: `sessions.rpe` (1-10) + `rpe_logged_at`, logged by
  the athlete via `/api/athlete-link/rpe` once every set in a session
  is ticked done. Wired into the Training Load Report's "Session RPE"
  section (`ReportModal.tsx`, gated by `options.sessionRpe`): range
  average, a weekly-trend line chart (reuses `MultiTrendLineChart` with
  a fixed 0-10 y-axis via its `yDomain` prop), then the chronological
  per-session list. `lib/report-calc.ts`'s `collectRPE()` builds both
  `rpeEntries` (flat) and `rpeWeekly` (weekly avg) from `allSessions`.
- **Save retry queue** (`lib/save-queue.ts`): athlete app saves that
  fail (bad gym signal) get queued and retried every 30s + immediately
  on reconnect, rather than just failing silently or losing data.

## Workflow preferences

- **Diagnose before building.** Don't propose fixes or make assumptions
  before understanding the actual root cause — read the relevant code
  first.
- **Run `npm run build` locally before considering a task done.** This
  is the whole point of using Claude Code over the previous manual
  zip-based workflow — catch type errors and build failures before
  they reach Vercel.
- **Commit after each logical fix**, not batched into one giant commit.
- **Deploy command**: `git add -A && git commit -m "..." && git push origin main`
  — pushing to `main` auto-deploys to production via Vercel. (A `dev`
  branch + staging Supabase project may exist by the time you read
  this — check `git branch -a` and ask Ash if unsure which branch to
  work on for a given task, since production data safety matters a lot
  here — this app has real coaches and athletes using it.)
- **SQL migrations**: numbered sequentially in `supabase/migrations/`,
  run manually via the Supabase SQL editor (not an automated migration
  tool). Check the highest existing number before creating a new one.
- Ash is not a professional developer — explain technical tradeoffs in
  plain language when they matter for a decision he needs to make, but
  don't over-explain implementation details he doesn't need.

## Product context

- Testing system (youth physical testing, dual elite/general-population
  norms) is the platform's genuine competitive differentiator — treat
  changes to `lib/data/testing.ts`, `TestReportModal.tsx`, and the norms
  logic with extra care, and reference `salopia_report_engine.py` /
  `Salopia_Report_Engine_README.md` (original Python prototype) if
  norms or commentary logic need clarifying — they contain important
  documented reasoning (e.g. why gen-pop sprint norms can't use the
  standard step-down extrapolation method).
- Outstanding roadmap items: structured clinical notes field on athlete
  model, testing admin UI commentary fields for custom (non-seeded)
  metrics, wiring session RPE into Training Load Report, "recent
  testing results" card on athlete profile to bridge testing and PB
  systems (kept deliberately separate as data sources, per product
  decision — don't merge them without discussing first).
