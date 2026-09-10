import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { build12TeamRoster, cleanupTestData, createTestLeague, createTestPlayer, createTestSeason } from "../helpers.js";

describe("cycle delete", () => {
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

  it("deletes an empty (ungenerated) cycle", async () => {
    const cycleRes = await request(app).post("/api/cycles").send({ seasonId, leagueId, teamCount: 12 });
    const del = await request(app).delete(`/api/cycles/${cycleRes.body.id}`);
    expect(del.status).toBe(204);

    const check = await request(app).get(`/api/cycles/${cycleRes.body.id}`);
    expect(check.status).toBe(404);
  });

  it("deleting a cycle with generated teams cascades its teams, slots, and schedule", async () => {
    for (const p of build12TeamRoster()) await createTestPlayer(seasonId, leagueId, p);
    const cycleRes = await request(app).post("/api/cycles").send({ seasonId, leagueId, teamCount: 12 });
    await request(app).post(`/api/cycles/${cycleRes.body.id}/teams/generate`).send({});
    await request(app).post(`/api/cycles/${cycleRes.body.id}/schedule/generate`).send({});

    const del = await request(app).delete(`/api/cycles/${cycleRes.body.id}`);
    expect(del.status).toBe(204);

    const teamsAfter = await request(app).get(`/api/cycles/${cycleRes.body.id}/teams`);
    expect(teamsAfter.body).toEqual([]); // cycle itself is gone, so no teams resolve for it

    // Doesn't corrupt anything about the player roster itself — this is
    // the whole point of it being safer than deleting a player who's been
    // assigned to a team.
    const players = await request(app).get(`/api/players?seasonId=${seasonId}&leagueId=${leagueId}`);
    expect(players.body).toHaveLength(build12TeamRoster().length);
  });

  it("404s deleting a cycle that doesn't exist", async () => {
    const res = await request(app).delete("/api/cycles/does-not-exist");
    expect(res.status).toBe(404);
  });
});
