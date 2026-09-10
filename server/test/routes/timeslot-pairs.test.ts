import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { cleanupTestData, createTestLeague, createTestPlayer, createTestSeason } from "../helpers.js";

describe("timeslot-pairs routes", () => {
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

  it("creates a pair between two active players", async () => {
    const a = await createTestPlayer(seasonId, leagueId, { name: "A", canPlaySkip: true });
    const b = await createTestPlayer(seasonId, leagueId, { name: "B", canPlayLead: true });

    const res = await request(app)
      .post("/api/timeslot-pairs")
      .send({ leagueId, seasonId, playerAId: a.id, playerBId: b.id, priority: 2 });

    expect(res.status).toBe(201);
  });

  it("rejects a pair where either player is inactive", async () => {
    const a = await createTestPlayer(seasonId, leagueId, { name: "A", canPlaySkip: true, active: true });
    const b = await createTestPlayer(seasonId, leagueId, { name: "B", canPlayLead: true, active: false });

    const res = await request(app)
      .post("/api/timeslot-pairs")
      .send({ leagueId, seasonId, playerAId: a.id, playerBId: b.id, priority: 0 });

    expect(res.status).toBe(400);
  });

  it("rejects a self-pair", async () => {
    const a = await createTestPlayer(seasonId, leagueId, { name: "A", canPlaySkip: true });
    const res = await request(app)
      .post("/api/timeslot-pairs")
      .send({ leagueId, seasonId, playerAId: a.id, playerBId: a.id, priority: 0 });
    expect(res.status).toBe(400);
  });

  it("rejects a pair spanning two different seasons, even within the same league", async () => {
    const otherSeason = await createTestSeason();
    const a = await createTestPlayer(seasonId, leagueId, { name: "A", canPlaySkip: true });
    const b = await createTestPlayer(otherSeason.id, leagueId, { name: "B", canPlayLead: true });

    const res = await request(app)
      .post("/api/timeslot-pairs")
      .send({ leagueId, seasonId, playerAId: a.id, playerBId: b.id, priority: 0 });

    expect(res.status).toBe(400);
    await request(app).delete(`/api/seasons/${otherSeason.id}`);
  });

  it("GET / is scoped to the given season+league", async () => {
    const otherSeason = await createTestSeason();
    const a = await createTestPlayer(seasonId, leagueId, { name: "A", canPlaySkip: true });
    const b = await createTestPlayer(seasonId, leagueId, { name: "B", canPlayLead: true });
    const c = await createTestPlayer(otherSeason.id, leagueId, { name: "C", canPlaySkip: true });
    const d = await createTestPlayer(otherSeason.id, leagueId, { name: "D", canPlayLead: true });

    await request(app)
      .post("/api/timeslot-pairs")
      .send({ leagueId, seasonId, playerAId: a.id, playerBId: b.id, priority: 0 });
    await request(app)
      .post("/api/timeslot-pairs")
      .send({ leagueId, seasonId: otherSeason.id, playerAId: c.id, playerBId: d.id, priority: 0 });

    const res = await request(app).get(`/api/timeslot-pairs?seasonId=${seasonId}&leagueId=${leagueId}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].playerA.name).toBe("A");

    await request(app).delete(`/api/seasons/${otherSeason.id}`);
  });
});
