import { prisma } from "../src/prisma.js";
import { buildSyntheticRoster } from "./rosterFixtures.js";

let counter = 0;

// Unique per call (timestamp + counter + random suffix) so parallel/rerun
// test runs never collide on League.name's global uniqueness constraint —
// tests get their own League rather than reusing the app's "Monday"/
// "Tuesday" convention, which is a seed-data/UI convention, not a schema
// requirement (League.name just needs to be unique).
function uniqueName(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function createTestLeague() {
  return prisma.league.create({ data: { name: uniqueName("League") } });
}

export async function createTestSeason() {
  return prisma.season.create({ data: { name: uniqueName("Season") } });
}

export type MinimalPlayerInput = {
  name: string;
  canPlaySkip?: boolean;
  canPlayVice?: boolean;
  canPlaySecond?: boolean;
  canPlayLead?: boolean;
  isNewCurler?: boolean;
  active?: boolean;
  notes?: string | null;
};

export async function createTestPlayer(seasonId: string, leagueId: string, input: MinimalPlayerInput) {
  return prisma.player.create({
    data: {
      name: input.name,
      seasonId,
      leagueId,
      canPlaySkip: input.canPlaySkip ?? false,
      canPlayVice: input.canPlayVice ?? false,
      canPlaySecond: input.canPlaySecond ?? false,
      canPlayLead: input.canPlayLead ?? false,
      isNewCurler: input.isNewCurler ?? false,
      active: input.active ?? true,
      notes: input.notes ?? null,
    },
  });
}

// Deleting the season cascades to its players/pairs/cycles (and those
// cycles' teams/matches/schedules) — see schema.prisma. The league itself
// has no cascade FK, so it's deleted separately once nothing references it.
export async function cleanupTestData(seasonId: string, leagueId: string) {
  await prisma.season.delete({ where: { id: seasonId } }).catch(() => {});
  await prisma.league.delete({ where: { id: leagueId } }).catch(() => {});
}

// Same tuned, verified-warning-free shape used by the pure unit tests and
// scripts/simulate-season.ts (see rosterFixtures.ts) — a roster that just
// barely passes validateRosterForGeneration's minimums is NOT the same
// thing as one the draft+redistribution algorithm can actually place
// without warnings, so integration tests need this real-slack version too.
export function build12TeamRoster(): MinimalPlayerInput[] {
  return buildSyntheticRoster(12).map((p) => ({
    name: p.name,
    canPlaySkip: p.canPlaySkip,
    canPlayVice: p.canPlayVice,
    canPlaySecond: p.canPlaySecond,
    canPlayLead: p.canPlayLead,
    isNewCurler: p.isNewCurler,
  }));
}
