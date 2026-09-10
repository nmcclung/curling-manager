import { describe, expect, it } from "vitest";
import { getTeamGroupIndex, getTimeSlotGroups, isSingletonGroup } from "../../src/teamGeneration/groups.js";
import type { TeamCount } from "../../src/teamGeneration/types.js";

describe("getTimeSlotGroups / getTeamGroupIndex", () => {
  const teamCounts: TeamCount[] = [12, 14, 16];

  for (const teamCount of teamCounts) {
    it(`partitions every team 1..${teamCount} into exactly one group`, () => {
      const groups = getTimeSlotGroups(teamCount);
      const allTeams = groups.flat();
      expect(new Set(allTeams).size).toBe(allTeams.length); // no team appears twice
      expect(allTeams.sort((a, b) => a - b)).toEqual(Array.from({ length: teamCount }, (_, i) => i + 1));
    });

    it(`getTeamGroupIndex agrees with getTimeSlotGroups for every team 1..${teamCount}`, () => {
      const groups = getTimeSlotGroups(teamCount);
      for (let team = 1; team <= teamCount; team++) {
        const index = getTeamGroupIndex(team, teamCount);
        expect(groups[index]).toContain(team);
      }
    });
  }

  it("throws for a team number outside the config's range", () => {
    expect(() => getTeamGroupIndex(99, 12)).toThrow();
  });

  it("14-team config has exactly two singleton groups (teams 8 and 9), which can never host a pair", () => {
    const groups = getTimeSlotGroups(14);
    const singletons = groups.filter((g) => g.length === 1).flat();
    expect(singletons.sort((a, b) => a - b)).toEqual([8, 9]);
  });

  it("isSingletonGroup matches actual group length", () => {
    const groups = getTimeSlotGroups(14);
    groups.forEach((group, index) => {
      expect(isSingletonGroup(index, 14)).toBe(group.length === 1);
    });
  });

  it("12- and 16-team configs have no singleton groups", () => {
    for (const teamCount of [12, 16] as const) {
      const groups = getTimeSlotGroups(teamCount);
      expect(groups.some((g) => g.length === 1)).toBe(false);
    }
  });
});
