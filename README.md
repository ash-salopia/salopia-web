# Salopia Health & Performance — Web App

Coach-managed programme builder, rebuilt as a real web app (Next.js +
Supabase) from the Claude.ai prototype. This file explains what's here
and what's left to set up.

## What's in this repo so far

```
salopia-web/
├── app/                  # Next.js pages (routes)
│   ├── login/            # Coach sign-in (magic link)
│   └── auth/callback/    # Magic-link callback handler
├── components/           # Shared React components — being built next
├── lib/
│   ├── data/              # All Supabase queries, one file per entity
│   │   ├── athletes.ts
│   │   ├── sessions.ts
│   │   └── library.ts
│   ├── csv-import.ts      # CSV import logic, ported from the prototype
│   ├── date-utils.ts      # Date helpers (includes the timezone fix)
│   ├── supabase-browser.ts
│   └── supabase-server.ts
├── types/
│   └── index.ts          # TypeScript types matching the DB schema exactly
├── supabase/
│   ├── migrations/        # Numbered, version-controlled schema changes
│   │   ├── 0001_organisations_and_coaches.sql
│   │   ├── 0002_athletes_and_library.sql
│   │   ├── 0003_templates_and_programmes.sql
│   │   ├── 0004_sessions_and_exercises.sql
│   │   ├── 0005_testing_system.sql
│   │   ├── 0006_grant_service_role_privileges.sql
│   │   ├── 0007_grant_authenticated_role_privileges.sql
│   │   ├── 0008_archive_athletes.sql
│   │   └── 0009_live_group.sql
│   └── tests/
│       └── rls_permission_tests.sql   # Manual RLS verification checklist
├── middleware.ts          # Session refresh + route protection
├── package.json
├── tsconfig.json
├── next.config.js
├── .env.example           # Copy to .env.local and fill in real values
└── .gitignore
```

## Data model

Two structural decisions worth understanding before extending this:

**Organisations sit above coaches.** A solo coach today is simply an
organisation of one, but athletes, the exercise library, templates,
and programmes all belong to the *organisation*, not an individual
coach. This means a second coach added to the same organisation later
automatically sees the same athlete roster — no data re-entry, no
manual sharing step needed.

**The testing system is a separate module from the programme builder.**
`test_batteries`, `test_metrics`, `test_benchmarks`, `test_sessions`,
and `test_results` (migration 0005) bring the existing Python testing
tool's data model (sprint times, CMJ, IMTP, 5-0-5, etc., with dual
elite-youth/general-population RAG benchmarking) into the same
database as programme data, so both live against the same athlete
record rather than in disconnected tools.

## One-time setup

1. **Create accounts** (all free tier, no card needed):
   - [github.com](https://github.com) — where this code will live
   - [vercel.com](https://vercel.com) — hosts the live app (sign in with GitHub)
   - [supabase.com](https://supabase.com) — the database + auth backend

2. **Create a new Supabase project.** Once it's ready, go to the SQL
   Editor and run each file in `supabase/migrations/` **in order**
   (0001, then 0002, then 0003, and so on) — each one builds on the
   last. Do not skip ahead or run them out of order.

3. **Get your API credentials.** In your Supabase project: Settings →
   API. Copy the "Project URL", the "anon / public" key, and the
   "service_role" key (click "Reveal" — Supabase hides it by default
   since it bypasses all security rules).

4. **Set up environment variables.** Copy `.env.example` to `.env.local`
   and paste in the three values from step 3. The service role key is
   used server-side only, in two places: the athlete share-link view,
   and provisioning a coach's account on their first sign-in (see
   `app/auth/callback/route.ts`) — see the warning comment in
   `lib/supabase-service.ts` for why it must never be exposed to the
   browser.

5. **Push this code to a new GitHub repository**, then connect that
   repository to a new Vercel project. Vercel will ask for the same
   three environment variables — paste them in there too (Project
   Settings → Environment Variables in Vercel). Double-check the
   service role key is NOT accidentally prefixed with `NEXT_PUBLIC_`
   when you paste it in.

6. **Deploy.** Vercel builds and deploys automatically. From then on,
   any code pushed to the repository's main branch redeploys
   automatically within about a minute — no manual steps.

7. **Create your own coach account.** Go to your deployed app's
   `/login` page, click "First time? Set up your account", fill in
   your name and business name, then enter your email and request a
   sign-in link. Clicking that link automatically creates your
   organisation and your coach profile — no manual database setup
   needed. Anyone you invite later (not built yet) would join your
   existing organisation instead of creating a new one.

8. **Verify RLS is actually working.** Before relying on this with
   real athlete data, work through `supabase/tests/rls_permission_tests.sql`
   with two real test accounts to confirm one coach genuinely cannot
   see or modify another organisation's data. This hasn't been run
   against a live Postgres instance yet (no local Postgres available
   in the environment this was built in) — it's the first real-world
   test the schema needs.

## Future schema changes

Add a new file to `supabase/migrations/` (e.g.
`0006_whatever_comes_next.sql`) rather than editing an existing
migration or making ad-hoc changes through the Supabase dashboard.
Each migration should be small and focused on one change, run in
order, and never modified once it's been applied to a real database
— if something needs fixing, write a new migration that corrects it.

## Athlete access (current approach)

Athletes don't have full login accounts yet. Each athlete has a private,
unguessable share link (`athletes.share_token`, a UUID) at `/a/<token>`
that opens their own sessions — no sign-in needed. Proper athlete
logins are a planned addition once initial coach-side testing is solid.

**How this stays secure without an athlete login:** the share-link
pages run entirely server-side using the Supabase **service role key**
(see `.env.example` and `lib/supabase-service.ts`), which bypasses Row
Level Security completely. That's necessary because an anonymous
visitor has no `auth.uid()` for RLS to check against — but it means
the route code itself is now the only thing standing between a token
holder and every other coach's data, so it's written deliberately
defensively:

- Every page and API route re-validates the token from scratch on
  every request — nothing is cached or trusted from a previous load.
- An invalid, expired, or made-up token gets an identical 404 to a
  session/exercise ID that exists but belongs to someone else —
  never a different error that would help someone probe for valid
  tokens or IDs.
- Writes (logging a set, marking progress) double-check that the
  specific exercise/session being modified actually belongs to the
  athlete matching the presented token, even though the service role
  key would technically allow writing anywhere — see the comments in
  `lib/data/athlete-share-link.ts`.
- The service role key itself is server-only (enforced by the
  `server-only` package, which throws a build error if it's ever
  imported into a "use client" file) and must never carry a
  `NEXT_PUBLIC_` prefix.

**Revoke a leaked link** by regenerating the athlete's `share_token`
(`regenerateShareLink` in `lib/data/athletes.ts`) — the old link stops
working immediately since it no longer matches any row.

**What an athlete can and can't do:** they can view their prescribed
sessions and log their own sets (weight, reps, done) and mark
session-level progress feedback. They cannot edit prescribed fields
(sets, reps, load, tempo, exercise names, notes) — those stay
coach-only, enforced by the API routes only ever accepting a `log` or
`progress` value, never a generic patch.

## What's built vs. what's next

- [x] Database schema as version-controlled migrations (organisations, coaches, athletes, library, templates, programmes, sessions, exercises, testing system)
- [x] TypeScript types matching the schema
- [x] Supabase client setup (browser + server)
- [x] Coach authentication (magic-link email sign in/out, middleware route protection)
- [x] Coach signup (first sign-in auto-provisions an organisation + coach profile)
- [x] Data access layer (athletes, sessions, library — create/read/update/delete)
- [x] CSV import (column matching, library linking, repeat-days feature)
- [x] Date utilities (with the timezone fix discovered during the prototype build)
- [x] RLS permission test checklist (not yet executed against a live database)
- [x] Coach shell (sidebar nav, header, sign out)
- [x] Athlete list page (view, search, add, delete)
- [x] Athlete detail page (session list, add session by type)
- [x] Session detail page (exercise editor, set logging, CSV import, apply-to-future)
- [x] Exercise library page (list, search, add, edit, delete, bulk CSV import, bulk YouTube playlist import)
- [x] Programme expiry dashboard (sorted by urgency, colour-coded, click-through)
- [x] Hyrox/Cardio interval timer (work/rest/rounds, with the debugged audio system ported faithfully)
- [x] Athlete share-link view (no login — token-based, server-only service role access, read prescribed fields + log sets/reps/done)
- [x] Template Library (build reusable session structures, set repeat days, save an existing session as a template, load onto an athlete generating real dated sessions)
- [x] Programme Library (bundle template sessions into a programme, assign to athletes, load an individual programme session onto an athlete's calendar)
- [x] Reports (4/8/12-week presets plus custom date range, per-exercise tonnage table with week-over-week % change, ported with the per-set reps fix and each-side doubling preserved exactly)
- [x] Session check-in (4-question readiness questionnaire with rule-based suggestions, available on both the athlete share-link session view and the coach's session view)
- [x] Archive athletes (soft-delete — hides from active roster/dashboard/assignment pickers without touching any data; restorable any time from Athletes → Archived; permanent delete still available separately)
- [x] Exercise order field, with automatic reordering — typing a plain number into an exercise's order box moves it to that position in the session, renumbering everything else; non-numeric labels (e.g. "1A"/"1B" for supersets) just relabel without moving anything
- [x] Live group (`/live`) — star athletes from their profile or the athlete list to add them to a compact multi-athlete view for running a group session, with tappable set-completion dots per athlete
- [x] Copy sessions / Delete range — duplicate every session in a date range forward by N weeks (logged weights not carried over), or bulk-delete every session in a date range, both from the athlete detail page
- [x] Set auto-complete on weight entry — fixed a real bug where logging a weight no longer auto-marked the set done (the rebuild only checked the literal `done` flag, never deriving it from a logged weight the way the original build did). Typing a weight now marks the set done, clearing it back out un-marks it, on both the coach's session view and the athlete share-link view.
- [x] Session progress bar — restored on both the coach's session view and the athlete share-link view, showing sets-completed/total and a percentage, using the same completion logic as the auto-complete fix above
- [ ] Fuller Hyrox config types (cycling supersets, EMOM, fixed-step workouts, circuit/AMRAP — currently only simple interval timing is wired up)
- [ ] Testing system UI (test batteries, entering results, RAG reports)
- [ ] Voice/text-to-session (Claude API)
- [ ] Undo — present in the prototype (a 20-deep snapshot of the entire
  in-memory app state, restorable in one action) but **not yet
  rebuilt here, and not a simple port**. The prototype's whole state
  lived in React memory as one JS object, so "undo" meant swapping
  back to a previous snapshot of that object. The web app's state
  lives in a real shared database — there's no single in-memory
  "everything" to snapshot, so undo here means reversing actual
  database writes, which needs its own design (most likely an audit/
  history table capturing the previous value of whatever a mutating
  action changed, with undo replaying that backward) rather than a
  direct port of the prototype's approach. Worth scoping as its own
  piece of work rather than bolting on partially.

## Ideas for improving what's already built

Features below are working and shipped, but were flagged during use as
worth revisiting later — not bugs, just room to go further.

- **Session check-in** (`lib/checkin.ts`, `components/CheckInModal.tsx`):
  currently a fixed set of rules mapped to fixed suggestion text (e.g.
  "energy ≤2 → reduce load ~20%"). Two directions worth exploring:
  1. *Auto-adjust the actual session* — rather than just showing a
     suggestion as text, let a "rough day" check-in actually reduce
     the prescribed sets/load on that day's exercises (with the
     athlete able to confirm or undo), so the adjustment is applied,
     not just advised.
  2. *Smarter recommendations* — the current scoring is a simple
     additive rule set with no memory of the athlete's history. A
     more accurate version would look at recent training load (the
     same data the Reports feature already calculates) alongside the
     check-in answers — e.g. "low energy" means something different
     after a deload week than after three weeks of rising tonnage.
     This would likely mean moving the scoring logic from a pure
     client-side function to a server-side check that has access to
     the athlete's recent `generateReport` data.

## A note on testing

The CSV import and date-utility logic in `lib/` has been tested against
real sample data (matching the exact scenarios already proven in the
Claude.ai prototype) before being included here — see the conversation
history for the specific test cases. The database schema has been
checked for balanced syntax, valid foreign keys, and complete Row Level
Security coverage across all 18 tables, but has NOT been run against a
live Postgres instance yet (no local Postgres available in the
environment this was built in) — running the migrations in
`supabase/migrations/` against a real Supabase project, then working
through `supabase/tests/rls_permission_tests.sql`, is the first
real-world test this needs.
# salopia-web
