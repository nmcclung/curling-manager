import { describe, expect, it } from "vitest";
import { getTimeSlotGroups } from "../../src/teamGeneration/groups.js";
import { FIXED_SCHEDULES, type TeamCount } from "../../src/scheduleGeneration/fixedSchedules.js";

// Guards the two HARD constraints documented in CLAUDE.md for this
// generated (not hand-written) data file: no repeat opponents within a
// cycle, and every team-generation time-slot group stays entirely within
// one draw each week. If someone hand-edits fixedSchedules.ts or re-runs
// generate-fixed-schedules.ts with a bug, this is what would catch it —
// these two properties are what makes TimeSlotPair placement during team
// generation mean anything real (see groups.ts's comment).
describe("FIXED_SCHEDULES", () => {
  const teamCounts: TeamCount[] = [12, 14, 16];

  for (const teamCount of teamCounts) {
    describe(`${teamCount}-team config`, () => {
      const weeks = FIXED_SCHEDULES[teamCount];

      it("has exactly 4 weeks, each with 4 games per draw", () => {
        expect(weeks).toHaveLength(4);
        for (const week of weeks) {
          expect(week.early).toHaveLength(4);
          expect(week.late).toHaveLength(4);
        }
      });

      it("never repeats a real-vs-real opponent pairing across the cycle", () => {
        const seen = new Set<string>();
        for (const week of weeks) {
          for (const [a, b] of [...week.early, ...week.late]) {
            if (a > teamCount || b > teamCount) continue; // ghost involved
            const key = [a, b].sort((x, y) => x - y).join("-");
            expect(seen.has(key), `opponent pair ${key} repeats within the ${teamCount}-team cycle`).toBe(false);
            seen.add(key);
          }
        }
      });

      it("never pairs a real team against a ghost", () => {
        for (const week of weeks) {
          for (const [a, b] of [...week.early, ...week.late]) {
            const aGhost = a > teamCount;
            const bGhost = b > teamCount;
            expect(aGhost).toBe(bGhost);
          }
        }
      });

      it("keeps every time-slot group entirely within one draw each week", () => {
        const groups = getTimeSlotGroups(teamCount);
        for (const [weekIndex, week] of weeks.entries()) {
          const drawOf = new Map<number, "early" | "late">();
          for (const [a, b] of week.early) {
            drawOf.set(a, "early");
            drawOf.set(b, "early");
          }
          for (const [a, b] of week.late) {
            drawOf.set(a, "late");
            drawOf.set(b, "late");
          }

          for (const group of groups) {
            const draws = new Set(group.map((teamNumber) => drawOf.get(teamNumber)));
            expect(
              draws.size,
              `week ${weekIndex + 1}: group [${group.join(",")}] is split across draws (${[...draws].join(", ")})`,
            ).toBe(1);
          }
        }
      });
    });
  }
});
