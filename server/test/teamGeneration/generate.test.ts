import { describe, expect, it } from "vitest";
import { generateTeams, validateRosterForGeneration } from "../../src/teamGeneration/generate.js";
import { getTeamGroupIndex } from "../../src/teamGeneration/groups.js";
import { POSITIONS, type DraftPair, type DraftPlayer, type TeamCount } from "../../src/teamGeneration/types.js";
import { buildSyntheticRoster } from "../rosterFixtures.js";

let idCounter = 0;
function mkPlayer(
  name: string,
  flags: Partial<Pick<DraftPlayer, "canPlaySkip" | "canPlayVice" | "canPlaySecond" | "canPlayLead" | "isNewCurler">> = {},
): DraftPlayer {
  idCounter += 1;
  const canPlaySkip = flags.canPlaySkip ?? false;
  const canPlayVice = flags.canPlayVice ?? false;
  const canPlaySecond = flags.canPlaySecond ?? false;
  const canPlayLead = flags.canPlayLead ?? false;
  return {
    id: `extra-${idCounter}`,
    name,
    canPlaySkip,
    canPlayVice,
    canPlaySecond,
    canPlayLead,
    isNewCurler: flags.isNewCurler ?? false,
    eligibilityCount: Number(canPlaySkip) + Number(canPlayVice) + Number(canPlaySecond) + Number(canPlayLead),
    frontEndEligibilityCount: Number(canPlayVice) + Number(canPlaySecond) + Number(canPlayLead),
  };
}

describe("validateRosterForGeneration", () => {
  it("passes the tuned synthetic 12-team roster with no issues", () => {
    const issues = validateRosterForGeneration(buildSyntheticRoster(12), 12);
    expect(issues).toEqual([]);
  });

  it("flags a roster that's too small", () => {
    const issues = validateRosterForGeneration(buildSyntheticRoster(12).slice(0, 10), 12);
    expect(issues.some((i) => i.includes("Roster size"))).toBe(true);
  });

  it("flags too few skip-eligible players", () => {
    const roster = buildSyntheticRoster(12).filter((p) => !p.canPlaySkip);
    const issues = validateRosterForGeneration(roster, 12);
    expect(issues.some((i) => i.includes("skip-eligible"))).toBe(true);
  });

  it("gates skip-only specialist oversupply deterministically (specialists > teamCount)", () => {
    const roster = buildSyntheticRoster(12);
    // The tuned roster has 10 skip-only specialists (teamCount - 2) — push
    // it to 15, three over the 12-slot limit.
    for (let i = 0; i < 5; i++) roster.push(mkPlayer(`Extra Skip ${i}`, { canPlaySkip: true }));
    const issues = validateRosterForGeneration(roster, 12);
    expect(issues.some((i) => i.includes("15 players are eligible for Skip only") && i.includes("3 of them"))).toBe(
      true,
    );
  });

  it("does NOT gate when skip-only specialists sit right at teamCount", () => {
    const roster = buildSyntheticRoster(12);
    // Top the 10 skip-only specialists up to exactly 12 — the documented
    // ideal, not a violation (gate only fires strictly above teamCount).
    for (let i = 0; i < 2; i++) roster.push(mkPlayer(`Extra Skip ${i}`, { canPlaySkip: true }));
    const issues = validateRosterForGeneration(roster, 12);
    expect(issues.some((i) => i.includes("Skip only"))).toBe(false);
  });
});

describe("generateTeams", () => {
  const teamCount: TeamCount = 12;

  function generate(players: DraftPlayer[], pairs: DraftPair[] = []) {
    return generateTeams({
      teamCount,
      cycleNumber: 1,
      players,
      pairs,
      history: new Map(),
    });
  }

  it("produces exactly teamCount teams, each with all four positions represented", () => {
    const result = generate(buildSyntheticRoster(12));
    expect(result.teams).toHaveLength(teamCount);
    for (const team of result.teams) {
      expect(Object.keys(team.slots).sort()).toEqual([...POSITIONS].sort());
    }
  });

  it("never leaves Skip as a SPARE or unfilled — the one hard invariant that can't be a warning", () => {
    const result = generate(buildSyntheticRoster(12));
    for (const team of result.teams) {
      expect(team.slots.SKIP).not.toBe("SPARE");
      expect(team.slots.SKIP).not.toBeNull();
    }
  });

  it("places every player with zero warnings on a well-tuned roster", () => {
    const result = generate(buildSyntheticRoster(12));
    expect(result.warnings).toEqual([]);
    expect(result.conflictScore).toBe(0); // cycle 1, empty history — nothing to conflict with yet
  });

  it("warns (rather than silently dropping) players guaranteed unplaceable by the oversupply gate", () => {
    const roster = buildSyntheticRoster(12);
    // Base roster has 10 skip-only specialists (teamCount - 2); add 5 more
    // to reach 15 total — 3 over the 12-slot limit, so
    // validateRosterForGeneration guarantees exactly 3 unplaced every run
    // (which specific 3 isn't deterministic, only the count is).
    for (let i = 0; i < 5; i++) roster.push(mkPlayer(`Extra Skip ${i}`, { canPlaySkip: true }));

    const result = generate(roster);
    expect(result.warnings).toHaveLength(3);
    for (const warning of result.warnings) {
      expect(warning).toContain("Skip");
    }
  });

  it("keeps a timeslot pair's two players in the same team-generation group", () => {
    const roster = buildSyntheticRoster(12);
    const [playerA, playerB] = roster.filter((p) => p.canPlayVice && p.canPlaySecond && p.canPlayLead && !p.canPlaySkip);
    const pairs: DraftPair[] = [{ id: "pair1", playerAId: playerA.id, playerBId: playerB.id, priority: 2 }];

    const result = generate(roster, pairs);
    const teamOf = (playerId: string) =>
      result.teams.find((t) => POSITIONS.some((pos) => t.slots[pos] === playerId));

    const teamA = teamOf(playerA.id);
    const teamB = teamOf(playerB.id);
    expect(teamA).toBeDefined();
    expect(teamB).toBeDefined();
    expect(getTeamGroupIndex(teamA!.teamNumber, teamCount)).toBe(getTeamGroupIndex(teamB!.teamNumber, teamCount));
  });
});
