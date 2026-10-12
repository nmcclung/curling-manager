import { describe, expect, it } from "vitest";
import { getTimeSlotGroups } from "../../src/teamGeneration/groups.js";
import { FIXED_SCHEDULES, type TeamCount } from "../../src/scheduleGeneration/fixedSchedules.js";

// Guards the HARD constraints documented in CLAUDE.md for this generated
// (not hand-written) data file: no repeat opponents within a cycle, every
// team-generation time-slot group stays entirely within one draw each
// week, and every team plays exactly 2 early / 2 late across the cycle.
// If someone hand-edits fixedSchedules.ts or re-runs
// generate-fixed-schedules.ts with a bug, this is what would catch it —
// the first two properties are what makes TimeSlotPair placement during
// team generation mean anything real (see groups.ts's comment); the third
// is what an earlier version of this data file got wrong (a per-week
// 50/50 coin flip with no memory of prior weeks produced teams stuck at 4
// early / 0 late for a whole cycle — a real fairness complaint, not a
// cosmetic one).
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

      it("gives every real team exactly 2 early and 2 late draws across the cycle", () => {
        const counts = new Map<number, { early: number; late: number }>();
        for (let t = 1; t <= teamCount; t++) counts.set(t, { early: 0, late: 0 });
        for (const week of weeks) {
          for (const [a, b] of week.early) {
            for (const t of [a, b]) if (t <= teamCount) counts.get(t)!.early++;
          }
          for (const [a, b] of week.late) {
            for (const t of [a, b]) if (t <= teamCount) counts.get(t)!.late++;
          }
        }
        for (let t = 1; t <= teamCount; t++) {
          const c = counts.get(t)!;
          expect(c, `team ${t} is not evenly split early/late`).toEqual({ early: 2, late: 2 });
        }
      });
    });
  }
});
