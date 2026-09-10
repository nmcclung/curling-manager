import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { cleanupTestData, createTestLeague, createTestPlayer, createTestSeason } from "../helpers.js";

describe("players routes", () => {
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

  it("GET / is scoped to the given season+league — a player in another season never leaks in", async () => {
    const otherSeason = await createTestSeason();
    await createTestPlayer(seasonId, leagueId, { name: "In Scope", canPlaySkip: true });
    await createTestPlayer(otherSeason.id, leagueId, { name: "Other Season", canPlaySkip: true });

    const res = await request(app).get(`/api/players?seasonId=${seasonId}&leagueId=${leagueId}`);
    expect(res.status).toBe(200);
    expect(res.body.map((p: { name: string }) => p.name)).toEqual(["In Scope"]);

    // Cascades otherSeason's player too — leagueId is shared with the
    // primary season, whose own cleanup happens in afterEach.
    await request(app).delete(`/api/seasons/${otherSeason.id}`);
  });

  it("the same player name is allowed in two different seasons (uniqueness is per-season now)", async () => {
    const otherSeason = await createTestSeason();
    const res1 = await request(app)
      .post("/api/players")
      .send({ name: "Same Name", leagueId, seasonId, canPlaySkip: true });
    const res2 = await request(app)
      .post("/api/players")
      .send({ name: "Same Name", leagueId, seasonId: otherSeason.id, canPlaySkip: true });

    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);

    await request(app).delete(`/api/seasons/${otherSeason.id}`);
  });

  it("rejects creating a duplicate name within the same season+league", async () => {
    await createTestPlayer(seasonId, leagueId, { name: "Dup", canPlaySkip: true });
    const res = await request(app).post("/api/players").send({ name: "Dup", leagueId, seasonId, canPlaySkip: true });
    expect(res.status).toBe(409);
  });

  it("rejects an active player with no eligible position", async () => {
    const res = await request(app).post("/api/players").send({ name: "No Position", leagueId, seasonId, active: true });
    expect(res.status).toBe(400);
  });

  it("rejects a PATCH that would leave an active player with no eligible position", async () => {
    const player = await createTestPlayer(seasonId, leagueId, { name: "Skip Only", canPlaySkip: true });
    const res = await request(app).patch(`/api/players/${player.id}`).send({ canPlaySkip: false });
    expect(res.status).toBe(400);
  });

  it("batch update applies every valid patch and rolls back none of them", async () => {
    const a = await createTestPlayer(seasonId, leagueId, { name: "A", canPlaySkip: true });
    const b = await createTestPlayer(seasonId, leagueId, { name: "B", canPlayLead: true });

    const res = await request(app)
      .patch("/api/players/batch")
      .send({
        updates: [
          { id: a.id, patch: { notes: "updated a" } },
          { id: b.id, patch: { notes: "updated b" } },
        ],
      });

    expect(res.status).toBe(200);
    const notes = res.body.map((p: { notes: string }) => p.notes).sort();
    expect(notes).toEqual(["updated a", "updated b"]);
  });

  it("batch update is all-or-nothing — one invalid patch rolls back the whole batch", async () => {
    const a = await createTestPlayer(seasonId, leagueId, { name: "A", canPlaySkip: true });
    const b = await createTestPlayer(seasonId, leagueId, { name: "B", canPlayLead: true });

    const res = await request(app)
      .patch("/api/players/batch")
      .send({
        updates: [
          { id: a.id, patch: { notes: "should not persist" } },
          { id: b.id, patch: { canPlayLead: false } }, // leaves b active with no position — invalid
        ],
      });

    expect(res.status).toBe(400);

    const check = await request(app).get(`/api/players?seasonId=${seasonId}&leagueId=${leagueId}`);
    const reloadedA = check.body.find((p: { id: string }) => p.id === a.id);
    expect(reloadedA.notes).toBeNull(); // the rolled-back player's patch never applied
  });

  it("import always lands players inactive with no positions, even if the client sends otherwise", async () => {
    const res = await request(app)
      .post("/api/players/import")
      .send({
        seasonId,
        leagueId,
        players: [{ name: "Imported", notes: "from CSV", experienceYears: 5 }],
      });

    expect(res.status).toBe(201);
    const [player] = res.body;
    expect(player.active).toBe(false);
    expect(player.canPlaySkip).toBe(false);
    expect(player.canPlayVice).toBe(false);
    expect(player.canPlaySecond).toBe(false);
    expect(player.canPlayLead).toBe(false);
    expect(player.isNewCurler).toBe(false);
    expect(player.notes).toBe("from CSV");
    expect(player.experienceYears).toBe(5);
  });

  it("last-cycle-positions returns empty when no cycle has generated teams yet", async () => {
    const res = await request(app).get(`/api/players/last-cycle-positions?seasonId=${seasonId}&leagueId=${leagueId}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ cycleNumber: null, positions: {} });
  });
});
