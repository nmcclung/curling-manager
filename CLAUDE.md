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
- Dark mode: a toggle in the header (`client/src/lib/theme.ts`) flips a
  `dark` class on `<html>`, persisted to `localStorage`, defaulting to the
  OS preference. The `.dark` CSS variables were already in `index.css` from
  initial shadcn setup — this just wires up the switch.

## Commands (run from repo root)

- `npm run dev` — runs backend (`:3001`) and frontend (`:5173`) together via `concurrently`. Vite proxies `/api/*` to the backend.
- `npm run build` — builds both workspaces.
- `npm run prisma:generate` / `prisma:migrate` / `prisma:studio` / `prisma:seed` — Prisma workflows, run against `server/prisma/schema.prisma`.
- Add shadcn components with `npx shadcn@latest add <component> --yes` from `client/` (see shadcn/ui note below — plain `-y` alone isn't enough for `add`).
- `npm test` — server (vitest: unit + real-DB integration tests) then client (vitest: unit tests) — see Testing below.
- `npm run test:e2e` — Playwright, one real-browser spec covering the full core loop.

## Testing

Three layers, none of them ever touch `server/prisma/dev.db` (the actual
dev/seed data) — the two automated layers use a throwaway DB, and the E2E
layer works inside its own fully self-contained season on the real dev DB
and deletes it when done.

- **Server unit + integration tests** (`server/test/`, `vitest`, run via
  `npm test -w server`): pure-function unit tests for the highest-risk
  logic — `teamGeneration/generate.ts` (the specialist-oversupply gate,
  Skip-never-SPARE, pair placement, zero-warnings on a well-tuned roster),
  `teamGeneration/groups.ts`, and the committed `fixedSchedules.ts` data
  (its two hard invariants: no repeat opponents, time-slot groups never
  split across a draw) — plus Express-route integration tests (via
  `supertest` against `src/app.ts`, which is `index.ts` minus the
  `app.listen()` call so tests can drive it without binding a port) for
  season-scoping, cascade deletes, and batch-update atomicity. These run
  against a real SQLite file built fresh from the actual migration history
  each run (`server/test/global-setup.ts` → `server/test/test.db`, gitignored),
  not a hand-maintained schema copy that could drift. Each test gets its
  own uniquely-named League+Season fixture (`server/test/helpers.ts`) so
  parallel/rerun test files never collide on `League.name`'s uniqueness.
  `server/test/rosterFixtures.ts` holds a synthetic-but-realistic roster
  shape verified to generate warning-free (shared with
  `scripts/simulate-season.ts`, which now imports it instead of keeping
  its own copy) — a roster that just barely clears
  `validateRosterForGeneration`'s minimums is *not* the same thing as one
  the draft+redistribution algorithm can actually place warning-free, and
  an earlier version of these tests learned that the hard way.
- **Client unit tests** (`client/src/**/*.test.ts`, `vitest`): currently
  just `lib/csv.ts` (the registration-CSV importer's parser) against a
  sample mirroring the real export's quirks — report-header lines before
  the real CSV header, a trailing empty column, whitespace-padded names.
- **E2E** (`e2e/core-loop.spec.ts`, Playwright, root `playwright.config.ts`,
  `npm run test:e2e`): drives a real Chromium browser through the actual
  v1 core loop — create a season, seed a generation-ready roster, generate
  teams, generate a schedule, view the printable page, toggle dark mode —
  then deletes the season it created. Roster seeding happens via direct
  API calls rather than 40+ scripted "Add Player" dialogs (impractically
  slow/brittle; the UI itself is what's under test in the surrounding
  steps, not bulk data entry). `webServer.reuseExistingServer: true`
  unconditionally, since there's no CI here and `npm run dev` is usually
  already running locally.

## Current state

The app has three routed pages (`react-router-dom`, shell + nav in
`client/src/App.tsx`): **Roster**, **Teams**, **Schedule**.

- **Roster** (`client/src/features/roster/`, `server/src/routes/players.ts` +
  `timeslot-pairs.ts`) — full `Player`/`TimeSlotPair` CRUD, two-league
  tabbed UI. Position eligibility, new-curler, and active status are all
  inline checkboxes right in the table (no dialog needed for quick edits —
  the dialog remains for name/notes and creating new players). Sortable by
  name or status, defaulting to active-first. Deactivating a player who's
  in a `TimeSlotPair` offers to remove the pair(s) too rather than leaving
  them stale; existing stale pairs (an inactive member some other way) show
  a warning inline. Pair creation validates both players are active,
  client-side (the picker only lists active players) and server-side.
  Built and working.

  **Roster import** (`client/src/features/roster/ImportRosterDialog.tsx`,
  `client/src/lib/csv.ts`, `POST /api/players/import`) — brings in an
  initial roster from the club's registration-tool CSV export (a
  "League Registration Report", not our own internal format: First
  Name/Last Name/Experience/Member Since/Notes for League Manager, with a
  few report-header lines before the real CSV header — the header row is
  located by content, not a fixed line offset, since that framing text
  isn't guaranteed stable). Upload → editable preview table (rows matching
  an existing player's name by case-insensitive exact match are flagged
  "possible duplicate" and left unchecked, everything else checked by
  default) → explicit "Import N" commit, so nothing hits the DB before a
  human reviews it. Deliberately narrow about what it imports: name,
  `experienceYears` (a new nullable `Player` field — years curling, from
  the export's "Experience" column, shown/editable as its own roster-table
  column now), and the raw "Notes for League Manager" text verbatim. It
  does **not** infer `isNewCurler` or any position eligibility — this data
  doesn't reliably distinguish "new to curling" from "new to this club,"
  and there's no position-eligibility signal at all (occasional prose
  mentions like "Vice or Second please!" aren't parsed). Every imported
  player lands `active: false` with all four positions `false`
  (server-enforced regardless of what the client sends), satisfying the
  "active player needs ≥1 position" invariant automatically and leaving a
  clear manual-review queue rather than guessing. Same reasoning killed
  auto-detecting `TimeSlotPair` candidates from notes text (several rows
  do reference another player by name, e.g. "I need to be on the same
  draw as Wayne Lewchuk") — the raw note just imports as-is on that
  player's `notes` field for a human to read and act on.
- **Season/Cycle** (`server/src/routes/seasons.ts` + `cycles.ts`,
  `client/src/features/cycles/CyclePicker.tsx`) — create seasons and cycles
  (team count 12/14/16, cycle number auto-incremented per season+league).
  Shared picker component used by both Teams and Schedule pages (season
  selection itself now lives in `SeasonPicker`, see the roster-scoping
  invariant below — `CyclePicker` composes it alongside its own league/
  cycle UI). Seasons can also be deleted (cascades to all its cycles/
  teams/matches/schedules *and* its entire roster via schema `onDelete:
  Cascade`) — safe in isolation since a season is a hard history boundary,
  so no other season can reference into it. No delete for individual
  cycles yet, only whole seasons. Built and working.
- **Teams** (`client/src/features/teams/`, `server/src/teamGeneration/`,
  `server/src/routes/teams.ts`) — full team generation is built and working:
  roster-readiness checklist, "Generate Teams" (§5 algorithm: pair
  placement, priority-ordered drafting, redistribution, SPARE-filling,
  season-scoped decay-weighted history + bounded swap optimization from
  cycle 2 on, plus a random-restart wrapper — see below), a team grid, and manual per-slot override (each slot's
  dropdown is filtered to players eligible for that position who aren't
  already on another team this cycle — plus the slot's current occupant
  even if they no longer qualify, since a manual override doesn't enforce
  eligibility; SPARE is offered for every position except Skip, which can
  never be one). Generation warnings (unplaceable player / pair) name real
  numbers (e.g. "19 eligible players for 16 slots") and concrete next
  steps, not just names — the dropdown filtering above is what actually
  lets someone act on them (e.g. swap a leftover skip-only specialist into
  an open Skip slot).

  **Single-position-specialist oversupply is a gated, not advisory, check**
  (roster readiness checklist *and* `validateRosterForGeneration` server-
  side — both must pass, generation returns 400 otherwise). This is derived
  from §4 rather than stated there directly, but it's fully deterministic,
  not a heuristic: a player eligible for exactly one position competes only
  against same-position specialists for that position's `teamCount` slots,
  with zero fallback if they lose (Skip can never be a SPARE; Vice/Second/
  Lead specialists who miss out aren't retried elsewhere since every slot
  for their one position is already full by the time they'd be reconsidered).
  So "specialists for position X > teamCount" doesn't just risk a leftover
  player, it guarantees exactly `specialists - teamCount` of them every run
  — worth gating rather than leaving as a post-hoc warning.

  **Random-restart wrapper** (`generateTeams` in `generate.ts` — the single-
  pass logic moved to `generateTeamsOnce`): runs the full draft+swap-
  optimization pipeline up to `GENERATION_TRIALS` (1000) times with fresh
  shuffles, keeps whichever trial has the fewest warnings, then the lowest
  `totalConflictScore`. The old system ran a single deterministic-ish pass
  because Apps Script's execution-time budget forced it to — that
  constraint doesn't apply here, and this was cheap to add (a single trial
  is sub-millisecond; even 1000 finishes in well under 100ms end-to-end,
  confirmed against a real API call). Validated with
  `server/scripts/simulate-season.ts` (synthetic-but-valid rosters per team
  count, no DB writes, 12 independent repeats of a 7-cycle season, trials=1
  baseline vs trials=1000) before committing to it — restart eliminated
  generation warnings entirely (0.00 avg every cycle, every config, vs. up
  to ~1.25/cycle for the single-pass baseline) and cut residual teammate-
  conflict roughly in half to a quarter by cycle 7 across all three team
  counts. A follow-up trial-count scaling check found diminishing returns
  past ~1000-3000 trials — a small residual conflict persists even at 8000
  trials, suggesting a real ceiling for this swap-based local search rather
  than under-searching. **This is the "start simple" checkpoint**: if a
  real season later shows a league unhappy with late-season repeat
  teammates despite this, that residual-ceiling finding is the evidence
  that motivates reaching for something bigger (the problem is small enough
  for an exact MIP/CP solver — e.g. `highs.js`, a WASM solver with no
  native-binding build story — to find the provable optimum instead; not
  attempted yet since this hasn't been shown necessary).

  Regenerating an already-generated cycle asks for
  confirmation and flags any existing Schedule stale. See
  `server/src/teamGeneration/` for the pure algorithm
  (`generate.ts`, `groups.ts`, `history.ts`, `score.ts`) — it's a faithful
  port of the old system's actual logic (see `reference/` below), not a
  guess at the intent doc's prose summary.
- **Schedule** (`client/src/features/schedule/`, `server/src/routes/schedule.ts`,
  `server/src/scheduleGeneration/generateMatches.ts`) — full generation is
  built and working: maps the fixed matchup table onto a cycle's actual
  `Team` rows (by `teamNumber`) into `Match` rows, requires the cycle's
  teams to exist first (400 with a clear message otherwise), renders a
  printable-style weekly grid (Sheet × Early/Late, ghost games as "open",
  skip name shown per team). `Schedule.isStale` is wired end-to-end: set by
  either team regeneration or a manual `TeamSlot` edit (already handled in
  `routes/teams.ts`), shown as a banner with two ways to clear it —
  regenerating the schedule, or an explicit "Mark Reviewed" button for
  when no regeneration is actually needed (§3's "manually reviewed/rerun").

  **Printable export** (`client/src/features/schedule/PrintSchedulePage.tsx`,
  route `/print/:cycleId`, deliberately rendered *outside* `App.tsx`'s
  `Layout` — no nav/chrome, just the printable content): a standalone page
  showing the two sections the old Sheets printable schedule had (verified
  against `reference/ScheduleGenerator.gs` before building this) — a team
  roster grid (all 4 positions per team) and the weekly matchup grid with
  real calendar dates. Dates come from `Schedule.startDate` (new field,
  optional — set via a date input right on this page, `PATCH
  .../schedule/start-date`; falls back to "Week 1"/"Week 2" labels if
  unset), computed the same way the old system did (`startDate + 7*(N-1)
  days` per week). PDF export is just the browser's native
  print-to-PDF (a "Print / Export PDF" button calling `window.print()`) —
  no PDF-generation dependency needed. On-screen, the page follows the
  app's dark mode toggle like everywhere else; the *printed/exported*
  output always forces light colors regardless of that (`dark:print:`
  overrides throughout), since paper/PDF output should look right
  regardless of the viewer's screen theme when they made it. The
  team-group color chips are a partial exception: their pastel backgrounds
  are always the same literal hex values on-screen or off, so their own
  text is pinned to a dark color rather than inheriting the page's
  light/dark text color. Printing stays **portrait** (`@page { size:
  portrait }`, tried landscape first — user found it left too much
  whitespace) with tightened spacing/type sizes and a 3-column team grid
  (bold position labels, one team per compact card), which is what gets a
  full cycle (up to 16 teams + its 4-week schedule) onto a single page.

  **Color-coding matches the old system**: team roster cards are colored by
  `Team.groupIndex` (new API field, computed server-side via
  `getTeamGroupIndex` in `fetchTeamsWithPlayers`, `routes/teams.ts` — not
  stored, derived from `teamNumber` + `cycle.teamCount` same as everywhere
  else groups are used) using the same pastel palette
  `reference/ScheduleGenerator.gs` used (`applyTeamSectionFormatting`).
  This isn't just cosmetic parity — group membership is the actual
  mechanism keeping a `TimeSlotPair` together (see the Season/Cycle
  invariants below), so same-colored teams are genuinely "linked." The
  schedule table's sheet-number columns are shown once in a `<thead>`
  (colored with the old system's sheet palette) instead of repeating
  "Sheet N" on every match, with alternating week row shading for
  readability — both direct asks after the first version came out
  functional but visually flat.

  The fixed matchup **data** itself is generated (not hand-written) by
  `server/scripts/generate-fixed-schedules.ts`,
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
  don't regress constraint 2 (or the worst-case-sheet-repeat guard) if you
  do touch the script again.

With this, all three pages (Roster, Teams, Schedule) are functionally
complete for the core v1 loop: build a roster, generate teams, generate a
schedule. Not yet built: exporting/printing the schedule, standings/scores
(explicitly out of v1 scope per §3), and any polish pass on the UI itself.

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
- **Rosters are season-scoped, not permanent** — `Player` and
  `TimeSlotPair` both carry a `seasonId` (added after realizing a club's
  actual roster can change dramatically season to season; originally they
  only had `leagueId` and persisted forever, which was wrong). A season
  starts with a genuinely empty roster per league; populate it via "Add
  Player" or the CSV importer, same as before, just scoped one level
  deeper now. Deleting a season cascades to its entire roster too, not
  just cycles/teams/schedules. The intended workflow: create a season →
  build its roster → generate cycles/teams/schedules, which can now only
  ever draw from that season's own players (this was the actual bug being
  fixed — team generation used to query by `leagueId` alone, so it would
  silently pull in every player ever added to that league across every
  season). `Player.name` uniqueness is `[seasonId, leagueId, name]` now,
  not `[leagueId, name]` — the same name can exist independently in two
  different seasons. `RosterPage` and `CyclePicker` both render a shared
  `SeasonPicker` (`client/src/features/seasons/SeasonPicker.tsx`) for
  season select/create/delete, extracted out of `CyclePicker` once Roster
  needed the identical capability — its delete-confirmation summarizes
  everything about to cascade away (players, pairs, cycles, teams,
  matches, schedules), not just cycles like before.
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
