# Curling League Manager

Local-only, single-user web app for running a rec curling league (rosters,
teams, scheduling). Replaces a Google Sheets + Apps Script system.

**Full spec lives in [`curling-app-intent-doc.md`](./curling-app-intent-doc.md)**
— domain rules, data model, algorithm intent, all decisions/open questions.
Read it before making non-trivial changes. This file is just the durable
quick-reference; don't duplicate spec detail here — update the intent doc
instead and keep this pointing at it.

## Stack

- TypeScript throughout.
- `server/` — Node + Express API. Dev via `tsx watch`.
- `client/` — React + Vite + Tailwind v4 + shadcn/ui.
- `server/prisma/` — Prisma + SQLite (single file, `server/prisma/dev.db`, gitignored).
- npm workspaces (single repo, two packages: `server`, `client`), not a monorepo tool.
- No auth, no deployment target — runs on localhost only.

## Commands (run from repo root)

- `npm run dev` — runs backend (`:3001`) and frontend (`:5173`) together via `concurrently`. Vite proxies `/api/*` to the backend.
- `npm run build` — builds both workspaces.
- `npm run prisma:generate` / `prisma:migrate` / `prisma:studio` / `prisma:seed` — Prisma workflows, run against `server/prisma/schema.prisma`.
- Add shadcn components with `npx shadcn@latest add <component> --yes` from `client/` (see shadcn/ui note below — plain `-y` alone isn't enough for `add`).

## Current state

The app has three routed pages (`react-router-dom`, shell + nav in
`client/src/App.tsx`): **Roster**, **Teams**, **Schedule**.

- **Roster** (`client/src/features/roster/`, `server/src/routes/players.ts` +
  `timeslot-pairs.ts`) — full `Player`/`TimeSlotPair` CRUD, two-league
  tabbed UI. Built and working.
- **Season/Cycle** (`server/src/routes/seasons.ts` + `cycles.ts`,
  `client/src/features/cycles/CyclePicker.tsx`) — create seasons and cycles
  (team count 12/14/16, cycle number auto-incremented per season+league).
  Shared picker component used by both Teams and Schedule pages. Built and
  working.
- **Teams** (`client/src/features/teams/`, `server/src/teamGeneration/`,
  `server/src/routes/teams.ts`) — full team generation is built and working:
  roster-readiness checklist, "Generate Teams" (§5 algorithm: pair
  placement, priority-ordered drafting, redistribution, SPARE-filling,
  season-scoped decay-weighted history + bounded swap optimization from
  cycle 2 on), a team grid, and manual per-slot override (each slot is a
  player-reassignment dropdown, SPARE excluded for Skip). Regenerating an
  already-generated cycle asks for confirmation and flags any existing
  Schedule stale. See `server/src/teamGeneration/` for the pure algorithm
  (`generate.ts`, `groups.ts`, `history.ts`, `score.ts`) — it's a faithful
  port of the old system's actual logic (see `reference/` below), not a
  guess at the intent doc's prose summary.
- **Schedule** (`client/src/features/schedule/SchedulePage.tsx`) — picks a
  cycle, UI still a placeholder. But the fixed matchup **data** it'll read
  from is done: `server/src/scheduleGeneration/fixedSchedules.ts` is
  generated (not hand-written) by `server/scripts/generate-fixed-schedules.ts`,
  satisfying two HARD constraints by construction plus a ranked set of
  best-effort soft ones:
  1. No team plays the same opponent twice within the cycle (round-robin
     scheduling — satisfied structurally, no search needed).
  2. **Every team-generation time-slot group
     (`server/src/teamGeneration/groups.ts`) stays entirely within one draw
     (early/late) each week — never split.** This was missing from the
     first version of this script and is the whole reason "same time-slot
     group" placement during team generation (TimeSlotPair, §5 step 2)
     means anything real: two paired players placed in the same group are
     thereby guaranteed to curl at the same time each week, even though
     *which* time that group gets can rotate week to week. Confirmed by
     re-deriving it from every week of the old system's actual matrices
     (reference/ScheduleGenerator.gs) — never stated in the intent doc's
     prose. Enforced by only ever building a draw-side from whole groups
     (subset-sum over group sizes), never individual teams.
  3. SOFT / best-effort objectives from randomized-restart search, in this
     priority order (confirmed with the user — ghost placement matters more
     than raw sheet-rotation variety, which only breaks ties):
     a. **No team ever plays the same sheet 3+ times across the cycle** —
        2x on one sheet is fine (confirmed acceptable/ideal), 3x+ is not.
        Weighted highest so the search never trades this away for the
        objectives below.
     b. Players prefer the middle sheets (2/3), so ghost ("open") games are
        pushed onto 1/4 instead — also means more real games land on the
        preferred middle sheets. Currently **100% of ghost games** (both
        12- and 14-team) avoid the middle sheets.
     c. Real-team sheet-rotation variety, as a tiebreak only. Current
        numbers: 16-team often reaches a fully perfect 16/16 (every team
        all 4 distinct sheets); 12-team lands around 5/12 perfect with the
        rest at 3 distinct (one sheet repeated twice, never worse — see
        (a)); 14-team similar, around 10/14 perfect.
     Note the 12-team tradeoff was deliberate and re-litigated once: an
     earlier variety-first version got 12/12 perfect but only 4/8 ghosts
     off the middle; full ghost-avoidance costs real-team variety, but only
     down to "one sheet repeated twice" in the worst case, never worse —
     confirmed acceptable.

  Re-run the script (`npx tsx scripts/generate-fixed-schedules.ts` from
  `server/`) and it overwrites `fixedSchedules.ts` with a fresh random draw
  if the approach ever needs revisiting — don't hand-edit that file, and
  don't regress constraint 2 if you do touch the script again.
  Still to build: the actual Match-row generation from this data plus the
  route/UI wiring on the Schedule page.

**`reference/`** (gitignored, local-only) holds the old Apps Script source
(`main.gs`, `TeamGenerator.gs`, `ScheduleGenerator.gs`, `DataManager.gs`,
`HistoryTracker.gs`, `ConstraintManager.gs`) the user pasted in as ground
truth for exactly how team generation and scheduling used to work. Consult
it before redesigning either algorithm — several details (the time-slot
group structure below, the fixed schedule matrices, the pair-placement
rollback logic) came from reading this code directly, not from the intent
doc's prose, which undersold how intricate the real structure is.

**Seed data**: `server/prisma/seed-data/{roster,timeslot-pairs}.csv` is a
real anonymized former league roster (120 players, 19 pairs across both
leagues — names swapped for synthetic ones, all other fields real) used by
`npm run prisma:seed`. The original real-name CSVs (if present at repo
root) are gitignored — never commit them. Monday's real data only supports
a 12-team cycle (12 skip-eligible players, so 14 teams would fail the
skip-minimum invariant); Tuesday supports 12 or 14 (14 skips exactly meets
a 14-team minimum). Good for exercising invariant edge cases in team
generation — e.g. Tuesday's 14-team config actually has pairs spanning the
singleton groups, and generation correctly falls back to drafting those
players individually.

**shadcn/ui note**: this project's CLI version (shadcn 4.x, "radix-ui"/"cn"
based) needs `baseUrl` + `paths` in *both* `client/tsconfig.json` and
`tsconfig.app.json` to resolve the `@/*` alias when adding components —
without it, `add` silently writes files into a literal `./@/` directory
instead of `src/`. Also pass `--overwrite` if a shared file (e.g.
`button.tsx`) already exists and you want the registry's latest version.

## Invariants that matter most when building features (see intent doc §4 for the full list)

- A **season** is a hard reset shared across both leagues: cycle numbers
  restart at 1, and teammate history / decay never looks back across a
  season boundary.
- **Skip can never be a SPARE** — this is a hard error, not a soft warning.
- Team counts per cycle are only ever **12, 14, or 16** — don't generalize
  beyond that.
- Generated teams and schedules must be **manually editable** after the
  fact; editing a cycle's teams after its schedule was generated must set
  the schedule's `isStale` flag rather than silently regenerating anything.
- **A team's draw time (early/late) is not a fixed per-cycle attribute** —
  confirmed against the real fixed schedule matrix that it varies week to
  week (e.g. Team 1 plays early in weeks 1-2 but late in weeks 3-4 under
  the 12-team matrix). It lives on `Match.drawTime` (per week), not on
  `Team`. Don't reintroduce a `Team.timeSlot` field — this was tried and
  reverted once already.
- Separately, team **generation** uses its own "time-slot group" concept
  (`server/src/teamGeneration/groups.ts`) — a fixed partition of team
  *numbers* (not draw times) used only to decide which teams a timeslot
  pair can jointly land on and to scope the swap-optimization pass. It's
  finer than early/late: 12/16 teams have 4 groups, 14 teams has 6 (4 real
  + 2 singletons — teams 8 and 9 — which can never host a pair, satisfying
  §4.6 by construction rather than by a validation check).
- **That time-slot group is only meaningful because the fixed schedule
  respects it**: every team in the same group lands in the same draw
  together, every week (never split) — see `generate-fixed-schedules.ts`.
  If either of these two pieces changes independently of the other, the
  TimeSlotPair feature silently stops doing anything real. Keep them in
  sync.
