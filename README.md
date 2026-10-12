# Curling League Manager

A local-only, single-user web app for running a recreational curling
league — rosters, team generation, and scheduling. Built to replace a
Google Sheets + Apps Script system that had grown past what spreadsheet
formulas could reasonably handle.

Runs entirely on `localhost`: no auth, no hosting, no multi-user support.
It's a tool for one league manager running one league (across two
weeknight leagues, in practice) season after season.

## Core Features

### Roster Management

Each season starts with an empty roster per league. Players carry name,
position eligibility (Skip/Vice/Second/Lead), new-curler status, active
status, years of experience, and notes — all editable inline in a
sortable table. A CSV importer brings in a season's starting roster in
bulk from the club's registration export. Players who want to curl in the
same time slot each week can be linked as a "timeslot pair." Once a
player has ever been assigned to a team, they can no longer be deleted
(only deactivated), to keep history intact.

### Team Generation

Generates a cycle's teams from the active roster: timeslot pairs are
placed together first, then players are drafted in priority order (skip
specialists, new-curler leads, etc.), redistributed to balance teams, and
any remaining slots are filled with a SPARE placeholder — except Skip,
which can never be a SPARE. From the second cycle of a season onward,
generation also weighs each season's accumulated teammate history to
avoid repeat teammates, with hundreds of randomized attempts kept the
best-scoring one. Generated teams are fully editable afterward, including
a direct swap between two teams' same-position players — the only way to
move a Skip between teams, since Skip can't pass through an empty slot.

### Schedule Creation

Maps a cycle's generated teams onto a fixed weekly matchup schedule (no
repeat opponents within a cycle, sheet rotation, ghost games balanced
onto less-preferred sheets) and renders a printable weekly schedule plus
team roster sheet, exportable to PDF straight from the browser's print
dialog. Editing a cycle's teams after its schedule exists flags the
schedule stale until it's regenerated or marked reviewed.

## Tech Stack

- TypeScript throughout
- **Backend**: Node + Express, `tsx watch` for dev
- **Frontend**: React + Vite + Tailwind v4 + shadcn/ui
- **Database**: Prisma + SQLite (single local file)
- npm workspaces (`server`, `client`) in a single repo

## Getting Started

```bash
npm install
npm run prisma:migrate   # set up the local SQLite database
npm run prisma:seed      # optional: loads an anonymized sample roster
npm run dev               # runs backend (:3001) and frontend (:5173) together
```

Then open `http://localhost:5173` — Vite proxies `/api/*` to the backend.

## Testing

```bash
npm test          # server + client unit/integration tests (vitest)
npm run test:e2e  # one real-browser Playwright spec covering the core loop
```

## More Detail

[`CLAUDE.md`](./CLAUDE.md) is the living technical reference — current
build state, architecture, testing layers, and the domain invariants that
matter most when changing anything (season scoping, the Skip-can-never-
be-a-SPARE rule, team counts, etc.). The full domain spec lives in
[`curling-app-intent-doc.md`](./curling-app-intent-doc.md).
