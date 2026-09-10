import { expect, test, type APIRequestContext } from "@playwright/test";

// Real end-to-end coverage of the v1 core loop: create a season, build its
// roster, generate teams, generate a schedule, view the printable page, and
// toggle dark mode — the exact sequence a real session of this app follows.
// A season is fully self-contained (its own roster, cycles, teams,
// schedules — see CLAUDE.md's roster-scoping invariant), so this test
// creates one, works entirely inside it, and deletes it afterward: safe to
// run repeatedly against the same dev database without touching real data.

const API_BASE = "http://localhost:3001";

type RosterPlayer = {
  name: string;
  canPlaySkip: boolean;
  canPlayVice: boolean;
  canPlaySecond: boolean;
  canPlayLead: boolean;
};

// Same tuned proportions as server/test/rosterFixtures.ts (verified there
// to generate warning-free) — duplicated rather than imported across the
// workspace boundary, since this needs only the plain create-payload shape.
function buildRoster(teamCount: number): RosterPlayer[] {
  const players: RosterPlayer[] = [];
  let n = 0;
  const add = (flags: Partial<Omit<RosterPlayer, "name">>) => {
    n++;
    players.push({
      name: `E2E Player ${n}`,
      canPlaySkip: false,
      canPlayVice: false,
      canPlaySecond: false,
      canPlayLead: false,
      ...flags,
    });
  };
  for (let i = 0; i < teamCount - 2; i++) add({ canPlaySkip: true });
  for (let i = 0; i < 3; i++) add({ canPlaySkip: true, canPlayVice: true });
  for (let i = 0; i < Math.round(teamCount * 0.25); i++) add({ canPlayVice: true });
  for (let i = 0; i < Math.round(teamCount * 0.25); i++) add({ canPlaySecond: true });
  for (let i = 0; i < Math.round(teamCount * 0.25); i++) add({ canPlayLead: true });
  for (let i = 0; i < Math.round(teamCount * 0.55); i++) add({ canPlayVice: true, canPlaySecond: true });
  for (let i = 0; i < Math.round(teamCount * 0.35); i++) add({ canPlayVice: true, canPlayLead: true });
  for (let i = 0; i < Math.round(teamCount * 0.35); i++) add({ canPlaySecond: true, canPlayLead: true });
  for (let i = 0; i < Math.round(teamCount * 0.5); i++) add({ canPlayVice: true, canPlaySecond: true, canPlayLead: true });
  return players;
}

async function selectSeason(page: import("@playwright/test").Page, seasonName: string) {
  await page.getByRole("combobox").first().click();
  await page.getByRole("option", { name: seasonName }).click();
}

async function findSeasonAndLeague(request: APIRequestContext, seasonName: string) {
  const seasons = await (await request.get(`${API_BASE}/api/seasons`)).json();
  const season = seasons.find((s: { name: string }) => s.name === seasonName);
  const leagues = await (await request.get(`${API_BASE}/api/leagues`)).json();
  const monday = leagues.find((l: { name: string }) => l.name === "Monday");
  return { season, monday };
}

test("season → roster → generate teams → generate schedule → print → dark mode", async ({ page, request }) => {
  const seasonName = `E2E Test ${Date.now()}`;

  // --- Create the season through the real UI (Roster page) ---
  await page.goto("/roster");
  await page.getByRole("button", { name: "New Season" }).click();
  await page.getByPlaceholder("e.g. 2026 Fall").fill(seasonName);
  await page.getByRole("dialog").getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  const { season, monday } = await findSeasonAndLeague(request, seasonName);
  expect(season).toBeTruthy();
  expect(monday).toBeTruthy();

  try {
    // --- Seed a generation-ready roster directly via the API — scripting
    // 40+ "Add Player" dialogs through the UI would be impractically slow
    // and brittle; the UI itself is what's under test in the steps below. ---
    const roster = buildRoster(12);
    await Promise.all(
      roster.map((p) =>
        request.post(`${API_BASE}/api/players`, {
          data: { ...p, leagueId: monday.id, seasonId: season.id, active: true },
        }),
      ),
    );

    // --- Roster page reflects the seeded players once the new season is selected ---
    await page.reload();
    await selectSeason(page, seasonName);
    await expect(page.getByText("E2E Player 1", { exact: true })).toBeVisible();
    await expect(page.getByText(`${roster.length} active players`)).toBeVisible();

    // --- Teams page: create a cycle and generate ---
    await page.getByRole("link", { name: "Teams" }).click();
    await selectSeason(page, seasonName);
    await page.getByRole("button", { name: "New Cycle" }).click();
    await page.getByRole("dialog").getByText("12 teams", { exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Create" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();

    await page.getByRole("button", { name: "Generate Teams" }).click();
    await expect(page.getByText("Team 1", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Roster is not ready")).toHaveCount(0);

    const cycles = await (
      await request.get(`${API_BASE}/api/cycles?seasonId=${season.id}&leagueId=${monday.id}`)
    ).json();
    expect(cycles).toHaveLength(1);
    const cycleId = cycles[0].id;

    // --- Schedule page: generate from the just-created teams ---
    await page.getByRole("link", { name: "Schedule" }).click();
    await selectSeason(page, seasonName);
    await page.getByRole("button", { name: `Cycle ${cycles[0].cycleNumber}`, exact: false }).click();
    await page.getByRole("button", { name: "Generate Schedule" }).click();
    await expect(page.getByText("Week 1")).toBeVisible({ timeout: 15_000 });

    // --- Printable page renders both sections ---
    await page.goto(`/print/${cycleId}`);
    await expect(page.getByRole("heading", { name: "Teams" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Schedule" })).toBeVisible();
    await expect(page.getByText("Team 1", { exact: true })).toBeVisible();

    // --- Dark mode toggle affects <html>, and reverts ---
    await page.goto("/roster");
    const html = page.locator("html");
    await expect(html).not.toHaveClass(/dark/);
    await page.getByRole("button", { name: /switch to dark mode/i }).click();
    await expect(html).toHaveClass(/dark/);
    await page.getByRole("button", { name: /switch to light mode/i }).click();
    await expect(html).not.toHaveClass(/dark/);
  } finally {
    // --- Cleanup: delete the season through the UI, exercising that flow
    // too, and confirming (via the API, not the closed dropdown's DOM,
    // which wouldn't actually prove anything either way) that it's gone. ---
    await page.goto("/roster");
    await selectSeason(page, seasonName);
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Delete Season" }).click();
    await expect(async () => {
      const { season: stillThere } = await findSeasonAndLeague(request, seasonName);
      expect(stillThere).toBeFalsy();
    }).toPass({ timeout: 10_000 });
  }
});
