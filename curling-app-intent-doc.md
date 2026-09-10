# Curling League Manager — Intent Doc

**Status:** Draft v1 — based on interview + full review of existing Apps Script project ("Curling manager") and one sample roster export.
**Purpose of this document:** a working reference we both edit as design decisions get made. Sections marked `[ASSUMPTION]` or `[OPEN QUESTION]` need your confirmation or input; everything else reflects either something you told me directly or something I verified in the existing code.

---

## 1. Context & Motivation

The current system is a Google Sheets + Apps Script app (`Curling manager` project) that has been running the rec league for at least one season. It works, but:

- **Slow / times out on generation** — Apps Script has hard execution-time limits, and this is felt on team generation for the full roster.
- **Hard to extend or debug** — no local dev loop, no tests, no proper version control; changes are risky to make.
- **Minimal UI control** — stuck with Sheets UI + modal dialogs (`HtmlService`).

Goal: rebuild as a **local-only web app** (single user, this machine, no accounts, no network access needed) that preserves the domain logic that works, replaces the parts that are fragile or opaque, and gives you a real UI.

## 2. Domain Model (curling-specific rules)

- **Two leagues**, run independently: Monday Night, Tuesday Night.
- Each league night has **two draws**: 6:45 PM and 8:45 PM.
- Each draw = **4 matches across 4 sheets of ice**, 2 teams per sheet, 4 players per team → 32 players/draw, 64 players/night if both draws are full.
- Teams are **individual players drafted into teams of 4**, not pre-existing fixed teams.
- Teams are locked for a **cycle** (the existing code calls this "block" in older code and "cycle" in current code) — a **4-week span** — then fully reshuffled. `[stated: you confirmed 4-week rotation]`.
- A **season** groups several cycles (typically ~6) and is **shared across both leagues** — not per-league. Starting a new season is a **complete fresh start** for both Monday and Tuesday simultaneously: no history, no cycle-number continuity, and no scoring carryover from the prior season.
- **Positions**: Skip, Vice, Second, Lead (standard curling positions). Each player has a boolean eligibility flag per position and can be eligible for multiple.
- Player flags observed in the roster sheet: `Can Play Skip/Vice/Second/Lead`, `New Curler?`, `Active?`, `Mon/Tues?` (league assignment), `Notes` (free text, unused by logic).
- **New curler** flag exists specifically to prioritize placing newer players at **Lead** (traditionally the learning position).
- **Paired players** ("Timeslot Pairs"): two players (e.g. spouses/friends) who want to end up in the same *time slot group* each cycle — not necessarily the same team, just the same early/late draw grouping. Each pair has an optional `priority` and `notes` field.
- Supported team counts per league per cycle: **12, 14, or 16** — this varies cycle-to-cycle based on how many people sign up. Confirmed as the intentional full set to support for v1: an odd team count isn't feasible (no opponent for the odd team out), leagues typically run close to full, and going beyond 16 or below 12 is very unlikely given signup history. The new system does not need to generalize beyond these three.
- When fewer than 16 teams exist, the schedule/printable view still displays a 4-sheet layout; the unused slots show as **"ghost" games** rendered as "open" rather than a real matchup.

## 3. Core Requirements — v1 Scope

Agreed scope: **rosters + scheduling** (not full league management/standings yet).

- Player roster management (add/edit/deactivate, per league)
- Team generation for a cycle: draft players into balanced teams of 4, respecting position eligibility, pairing constraints, and history (avoid repeat teammates)
- Schedule generation for a cycle: assign the 4 weeks of matchups across sheets/draws
- A printable/exportable weekly view
- **Manual override**: any generated team assignment or schedule matchup must be hand-editable after generation — there will always be extraordinary cases that need a manual fix rather than a full regeneration. If a cycle's teams are edited after its schedule was already generated, the schedule is flagged **stale** (visible indicator, no auto-regeneration) until manually reviewed/rerun.

Explicitly **out of scope for v1** (may come later): standings/scores, multi-season history, multi-user access.

## 4. Hard Invariants

These must hold regardless of how we reimplement the logic — they're either things you stated or constraints the existing system enforces strictly (via `runPreChecksAndValidations` / `validateRosterConstraints`):

1. Roster size for a league/cycle must be between `numberOfTeams × 3` and `numberOfTeams × 4` (allows for at most one **SPARE** placeholder per team).
2. **Skip position can never be a SPARE** — there must be at least `numberOfTeams` skip-eligible players. This is enforced as a hard error, not a warning.
3. Vice/Second/Lead each need at least `numberOfTeams − 3` eligible players.
4. No duplicate player names within a league's active roster.
5. Every active player must be eligible for at least one position.
6. Paired players must not be routed into a "singleton" time-slot group (only relevant to the 14-team configuration, where 2 of the groups have no partner group).
7. **Teammate history and cycle numbering are strictly scoped to the current season.** A new season starts completely fresh — cycle numbers reset to 1, and no history, scoring, or decay calculation ever looks back across a season boundary. `[stated: current-season-only, fresh start each season]`.

## 5. Algorithm Intent (behavior to preserve — not necessarily the exact code)

Given "hard to extend/debug" was a named pain point, I'd treat the *outcomes* below as the spec, and the implementation as fair game to simplify — flag if you want the literal algorithm ported instead.

**Team generation**, in order:
1. Validate roster against the invariants in §4.
2. Place paired players first, into a shared time-slot group (weighted by teammate-history conflict from cycle 2 onward), with rollback if a partner can't be placed.
3. Draft remaining players in priority order: skip specialists → skip generalists → leads (new curlers first) → single-position specialists (Vice/Second) → remaining versatile players — at each step, picking the team/position combo with the lowest "conflict score" (see below).
4. Redistribute so no team has more than one empty position (swap within the same time-slot group).
5. Fill any remaining empty non-Skip positions with a `SPARE` placeholder.
6. From cycle 2 onward, run a bounded multi-pass swap optimization to reduce remaining repeat-teammate conflicts.
7. Record the resulting teams into history for future cycles.

**Conflict scoring**: a player/team pairing is penalized if that player has been teamed with anyone already on the prospective team in a past cycle, with position versatility as a lightweight tiebreaker. **Resolved**: the existing per-cycle weighting curve (10000 → 1000 → 500 as cycles progress) was tuning shaped by Apps Script's resource limits, not a principled rule — we're free to redesign the optimization approach rather than port the exact numbers.

**Teammate history model — changing by design**: the current model treats a cycle-1 teammate identically to a cycle-6 teammate (flat "ever been teammates" set, no recency). **Resolved**: replacing with **linear decay per cycle**, always computed **within the current season only** — `cyclesAgo` never crosses a season boundary, matching the season being a hard reset (§2, §4.7). Formula: for a pairing `cyclesAgo` cycles back, `weight = max(0, 1 − (cyclesAgo − 1) × decayRate)`, with `decayRate` defaulting to `1/6` (full weight for last cycle, decayed to ~0 by 6 cycles back). `decayRate` is just a scoring parameter — it doesn't require storing a season length, since cycle numbers already reset to 1 each season, so "cycle 1 of a new season" naturally has no history to look back on (same special case the existing code already has for literal cycle 1).

## 6. Scheduling: Current State + Desired Improvements

While reviewing, I found two different implementations of "generate the weekly schedule": the pasted `ScheduleGenerator.gs` (a **hardcoded fixed matchup matrix** per team count, reused identically every cycle, no opponent-repeat-avoidance), and an older version in the Google Drive project that generated matchups **dynamically at random** with opponent-repeat-avoidance and "linked teams."

**Resolved**: the fixed matrix is what's actually been used in production. The dynamic/random approach was tried and abandoned — managing that level of randomization down to the sheet level got too complex to maintain in Apps Script.

**Two goals for the new static tables, with a firm priority order**:
1. **No repeat opponents within a cycle** (hard constraint) — matches what the existing table already does correctly; never traded away.
2. **Sheet balance** (soft, best-effort) — ideally each team rotates through a different sheet each week of the cycle, but this yields to #1 if a given team-count configuration can't satisfy both. A less-than-perfect sheet rotation is acceptable for that config; a repeat opponent is not.

I checked the existing 16-team table for both properties while writing this up: it already avoids repeat opponents within a cycle (spot-checked several teams — no repeats found), but doesn't balance sheets — e.g. Team 1 plays Sheet 1 in both Week 1 and Week 3 under the current table. So opponent variety is already solved; sheet balance is the real gap, and it's a nice-to-have rather than a hard rule.

**Confirmed**: one-time build-time generation (not a re-runnable in-app tool) — a small script satisfying goal #1 as a hard constraint and goal #2 opportunistically, with the output baked in as the new lookup table per team count. This keeps runtime complexity at zero.

This was previously abandoned for complexity under Apps Script's constraints — moving the work to build time sidesteps that entirely.

**Still a real risk regardless of approach**: the fixed-matrix version has a hidden coupling — team numbers 1–8 are implicitly "early draw" and 9–16 "late draw" (matching the time-slot groups from team generation). Since we're rebuilding this piece anyway, this should become an explicit rule in the new data model rather than an implicit numbering convention.

## 7. Data Model (draft — will firm up as we design)

- **Player** — name, position eligibility (4 booleans), `isNewCurler`, `active`, league
- **League** — Monday / Tuesday
- **Season** — a top-level entity, **shared across both leagues** (not per-league); a hard boundary — cycle numbers reset to 1 within each season, and history/decay never reads across seasons
- **Cycle** — belongs to a season and to a league (each league still runs its own independent cycles within the shared season), 4-week span, has a team count (12/14/16) for that cycle, cycle number is scoped/reset per season
- **Team** — belongs to a cycle, has 4 position slots (player or SPARE)
- **TimeSlotPair** — two players, a league, `priority`, `notes`. `priority` was captured but never wired into logic in the old system (abandoned for complexity) — **to be actually implemented this time** as a tiebreaker: when multiple pairs are competing for limited group space, lower-priority pairs are the ones asked to concede.
- **TeammateHistory** — derived/queryable from past cycles' team assignments **within the current season only**, not necessarily its own table
- **Week / Match** — a cycle-week, draw time, sheet number, two teams (or "open" for a ghost game)
- **Schedule** (per cycle) — has an `isStale` flag, set when the cycle's team assignments change after the schedule was generated; cleared on manual re-review, not auto-cleared by regeneration

## 8. Tech Stack & Architecture Decisions

- **TypeScript** throughout (frontend + backend) — matches your existing comfort with AI-assisted TS/Node work.
- **Backend**: Node + Express.
- **Database**: SQLite (single file, no server process — fits a single-user local app).
- **ORM**: Prisma.
- **Frontend**: React + Vite + Tailwind + shadcn/ui.
- **Run mode**: `npm run dev`, open `localhost`, nothing leaves the machine. No auth, no multi-tenancy, no deployment story needed.

## 9. Decisions & Remaining Open Questions

**Resolved this round:**
- Team counts: 12/14/16 confirmed as the full intentional set — no need to generalize further.
- Conflict-penalty weighting curve: was Apps-Script-resource-driven tuning, not principled — free to redesign.
- Teammate history: linear decay per cycle, scoped strictly to the current season — see formula in §5.
- Scheduling: fixed matrix confirmed as production. Opponent-repeat avoidance is a hard constraint (already solved by the existing table); sheet balance is a soft, best-effort goal. New tables generated once at build time, not at runtime.
- `TimeSlotPair.priority`: to be wired in as an actual tiebreaker this time.
- Manual override: required, with a stale-flag (no auto-regen) when edits happen after schedule generation.
- **Season is now an explicit data model concept** (§7): a hard reset boundary, shared across both leagues — new season, no carryover, cycle numbers reset to 1, history/decay never crosses the boundary.

**Still open:** none outstanding right now.

## 10. Supporting Evidence

Reviewed in full: `main.gs`, `ScheduleGenerator.gs`, `DataManager.gs`, `TeamGenerator.gs`, `HistoryTracker.gs`, `ConstraintManager.gs` (pasted by user, current production), plus the `Curling manager` Apps Script project found via Google Drive (older/parallel version, used for the scheduling-discrepancy comparison in §6). One sample row set from the Player Roster sheet was also reviewed to confirm column structure.
