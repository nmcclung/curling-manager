import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { build12TeamRoster, cleanupTestData, createTestLeague, createTestPlayer, createTestSeason } from "../helpers.js";

async function seedRoster(seasonId: string, leagueId: string) {
  for (const p of build12TeamRoster()) {
    await createTestPlayer(seasonId, leagueId, p);
  }
}

describe("team generation", () => {
  let seasonId: string;
  let leagueId: string;

  beforeEach(async () => {
    const [season, league] = await Promise.all([createTestSeason(), createTestLeague()]);
    seasonId = season.id;
    leagueId = league.id;
  });

  afterEach(async () => {
    await cleanupTestData(seasonId, leagueId);
  });

  it("generates teamCount teams from a well-formed roster", async () => {
    await seedRoster(seasonId, leagueId);
    const cycleRes = await request(app).post("/api/cycles").send({ seasonId, leagueId, teamCount: 12 });
    expect(cycleRes.status).toBe(201);

    const genRes = await request(app).post(`/api/cycles/${cycleRes.body.id}/teams/generate`).send({});
    expect(genRes.status).toBe(201);
    expect(genRes.body.teams).toHaveLength(12);
    expect(genRes.body.warnings).toEqual([]);
  });

  it("REGRESSION: a cycle only ever draws its own season's roster, never another season's players in the same league", async () => {
    // This is the exact bug fixed when rosters became season-scoped —
    // generation used to query by leagueId alone, silently pulling in
    // every player ever added to the league across every season.
    const otherSeason = await createTestSeason();
    await seedRoster(otherSeason.id, leagueId); // a full, valid 12-team roster — but in the WRONG season
    // seasonId (the cycle's actual season) intentionally has zero players.

    const cycleRes = await request(app).post("/api/cycles").send({ seasonId, leagueId, teamCount: 12 });
    const genRes = await request(app).post(`/api/cycles/${cycleRes.body.id}/teams/generate`).send({});

    expect(genRes.status).toBe(400);
    expect(genRes.body.issues.some((i: string) => i.includes("found 0"))).toBe(true);

    await request(app).delete(`/api/seasons/${otherSeason.id}`);
  });

  it("manual slot override rejects a player from a different season", async () => {
    await seedRoster(seasonId, leagueId);
    const cycleRes = await request(app).post("/api/cycles").send({ seasonId, leagueId, teamCount: 12 });
    await request(app).post(`/api/cycles/${cycleRes.body.id}/teams/generate`).send({});

    const teamsRes = await request(app).get(`/api/cycles/${cycleRes.body.id}/teams`);
    const firstSlot = teamsRes.body[0].slots[0];

    const otherSeason = await createTestSeason();
    const outsider = await createTestPlayer(otherSeason.id, leagueId, { name: "Outsider", canPlaySkip: true });

    const res = await request(app).patch(`/api/team-slots/${firstSlot.id}`).send({ playerId: outsider.id });
    expect(res.status).toBe(400);

    await request(app).delete(`/api/seasons/${otherSeason.id}`);
  });

  it("manual slot override never allows Skip to be cleared to a SPARE", async () => {
    await seedRoster(seasonId, leagueId);
    const cycleRes = await request(app).post("/api/cycles").send({ seasonId, leagueId, teamCount: 12 });
    await request(app).post(`/api/cycles/${cycleRes.body.id}/teams/generate`).send({});

    const teamsRes = await request(app).get(`/api/cycles/${cycleRes.body.id}/teams`);
    const skipSlot = teamsRes.body[0].slots.find((s: { position: string }) => s.position === "SKIP");

    const res = await request(app).patch(`/api/team-slots/${skipSlot.id}`).send({ playerId: null });
    expect(res.status).toBe(400);
  });

  it("a player with a team assignment can be deactivated but not deleted; one with none can be deleted freely", async () => {
    await seedRoster(seasonId, leagueId);
    const cycleRes = await request(app).post("/api/cycles").send({ seasonId, leagueId, teamCount: 12 });
    await request(app).post(`/api/cycles/${cycleRes.body.id}/teams/generate`).send({});

    const teamsRes = await request(app).get(`/api/cycles/${cycleRes.body.id}/teams`);
    const assignedPlayerId = teamsRes.body[0].slots[0].playerId;

    // Added after generation — guaranteed never assigned to any team.
    const freshPlayer = await createTestPlayer(seasonId, leagueId, { name: "Fresh Addition", canPlaySkip: true });

    // GET / reports hasTeamHistory correctly for both.
    const listRes = await request(app).get(`/api/players?seasonId=${seasonId}&leagueId=${leagueId}`);
    const assignedPlayer = listRes.body.find((p: { id: string }) => p.id === assignedPlayerId);
    const unassignedPlayer = listRes.body.find((p: { id: string }) => p.id === freshPlayer.id);
    expect(assignedPlayer.hasTeamHistory).toBe(true);
    expect(unassignedPlayer.hasTeamHistory).toBe(false);

    // Deleting the assigned player is rejected...
    const deleteRes = await request(app).delete(`/api/players/${assignedPlayerId}`);
    expect(deleteRes.status).toBe(400);
    expect(deleteRes.body.error).toContain("deactivate");

    // ...but deactivating them works fine, and preserves the team slot.
    const deactivateRes = await request(app).patch(`/api/players/${assignedPlayerId}`).send({ active: false });
    expect(deactivateRes.status).toBe(200);
    const teamsAfter = await request(app).get(`/api/cycles/${cycleRes.body.id}/teams`);
    const stillAssigned = teamsAfter.body.some((t: { slots: { playerId: string | null }[] }) =>
      t.slots.some((s) => s.playerId === assignedPlayerId),
    );
    expect(stillAssigned).toBe(true);

    // A player never assigned to any team can still be deleted freely.
    const deleteUnassignedRes = await request(app).delete(`/api/players/${freshPlayer.id}`);
    expect(deleteUnassignedRes.status).toBe(204);
  });
});
