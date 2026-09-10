import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/prisma.js";
import { createTestLeague, createTestPlayer, createTestSeason } from "../helpers.js";

describe("season delete cascade", () => {
  it("deleting a season removes its players, pairs, and cycles (and their teams)", async () => {
    const season = await createTestSeason();
    const league = await createTestLeague();

    const a = await createTestPlayer(season.id, league.id, { name: "A", canPlaySkip: true });
    const b = await createTestPlayer(season.id, league.id, { name: "B", canPlayLead: true });
    const pairRes = await request(app)
      .post("/api/timeslot-pairs")
      .send({ leagueId: league.id, seasonId: season.id, playerAId: a.id, playerBId: b.id, priority: 0 });
    const cycleRes = await request(app)
      .post("/api/cycles")
      .send({ seasonId: season.id, leagueId: league.id, teamCount: 12 });

    expect(pairRes.status).toBe(201);
    expect(cycleRes.status).toBe(201);

    const del = await request(app).delete(`/api/seasons/${season.id}`);
    expect(del.status).toBe(204);

    const playersAfter = await request(app).get(`/api/players?seasonId=${season.id}&leagueId=${league.id}`);
    expect(playersAfter.body).toEqual([]);

    const cycleAfter = await request(app).get(`/api/cycles/${cycleRes.body.id}`);
    expect(cycleAfter.status).toBe(404);

    // League itself isn't touched by a season delete — it's a top-level
    // entity shared across every season, only Player/Cycle/TimeSlotPair
    // reference into a specific one.
    const leagueAfter = await request(app).get("/api/leagues");
    expect(leagueAfter.body.some((l: { id: string }) => l.id === league.id)).toBe(true);

    // Season's already gone (and took its players with it), so the league
    // is unreferenced and safe to remove directly.
    await prisma.league.delete({ where: { id: league.id } });
  });

  it("404s deleting a season that doesn't exist", async () => {
    const res = await request(app).delete("/api/seasons/does-not-exist");
    expect(res.status).toBe(404);
  });
});
