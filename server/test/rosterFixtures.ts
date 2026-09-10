import type { DraftPlayer, TeamCount } from "../src/teamGeneration/types.js";

// Shared by the unit tests and scripts/simulate-season.ts (which imports
// this instead of keeping its own copy) — a synthetic-but-valid roster with
// real slack (versatile 2/3-position players, not just bare-minimum
// specialist counts), tuned so it generates warning-free. A roster built to
// just barely pass validateRosterForGeneration's minimums is NOT the same
// thing as one the draft+redistribution algorithm can actually place with
// zero warnings — this shape is the one that's been verified to do that.
let nextId = 0;
function player(
  overrides: Partial<DraftPlayer> & Pick<DraftPlayer, "canPlaySkip" | "canPlayVice" | "canPlaySecond" | "canPlayLead">,
): DraftPlayer {
  const eligibilityCount =
    Number(overrides.canPlaySkip) +
    Number(overrides.canPlayVice) +
    Number(overrides.canPlaySecond) +
    Number(overrides.canPlayLead);
  const frontEndEligibilityCount =
    Number(overrides.canPlayVice) + Number(overrides.canPlaySecond) + Number(overrides.canPlayLead);
  nextId++;
  return {
    id: `p${nextId}`,
    name: `Player ${nextId}`,
    isNewCurler: false,
    eligibilityCount,
    frontEndEligibilityCount,
    ...overrides,
  };
}

export function buildSyntheticRoster(teamCount: TeamCount): DraftPlayer[] {
  const players: DraftPlayer[] = [];

  const skipOnly = teamCount - 2;
  const skipGeneralist = 3;
  const viceOnly = Math.round(teamCount * 0.25);
  const secondOnly = Math.round(teamCount * 0.25);
  const leadOnly = Math.round(teamCount * 0.25);
  const viceSecond = Math.round(teamCount * 0.55);
  const viceLead = Math.round(teamCount * 0.35);
  const secondLead = Math.round(teamCount * 0.35);
  const allFrontEnd = Math.round(teamCount * 0.5);

  for (let i = 0; i < skipOnly; i++) players.push(player({ canPlaySkip: true, canPlayVice: false, canPlaySecond: false, canPlayLead: false }));
  for (let i = 0; i < skipGeneralist; i++) players.push(player({ canPlaySkip: true, canPlayVice: true, canPlaySecond: false, canPlayLead: false }));
  for (let i = 0; i < viceOnly; i++) players.push(player({ canPlaySkip: false, canPlayVice: true, canPlaySecond: false, canPlayLead: false }));
  for (let i = 0; i < secondOnly; i++) players.push(player({ canPlaySkip: false, canPlayVice: false, canPlaySecond: true, canPlayLead: false }));
  for (let i = 0; i < leadOnly; i++)
    players.push(player({ canPlaySkip: false, canPlayVice: false, canPlaySecond: false, canPlayLead: true, isNewCurler: i % 3 === 0 }));
  for (let i = 0; i < viceSecond; i++) players.push(player({ canPlaySkip: false, canPlayVice: true, canPlaySecond: true, canPlayLead: false }));
  for (let i = 0; i < viceLead; i++) players.push(player({ canPlaySkip: false, canPlayVice: true, canPlaySecond: false, canPlayLead: true }));
  for (let i = 0; i < secondLead; i++) players.push(player({ canPlaySkip: false, canPlayVice: false, canPlaySecond: true, canPlayLead: true }));
  for (let i = 0; i < allFrontEnd; i++) players.push(player({ canPlaySkip: false, canPlayVice: true, canPlaySecond: true, canPlayLead: true }));

  return players;
}
