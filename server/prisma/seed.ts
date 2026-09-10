import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SEED_DATA_DIR = path.join(import.meta.dirname, "seed-data");

// Minimal RFC4180-ish CSV parser — good enough for our own generated files
// (quoted fields, "" as an escaped quote, no multi-line fields).
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function readCsv(fileName: string): Record<string, string>[] {
  const text = readFileSync(path.join(SEED_DATA_DIR, fileName), "utf8");
  const [header, ...body] = parseCsv(text);
  return body.map((row) => Object.fromEntries(header.map((key, i) => [key, row[i] ?? ""])));
}

const toBool = (v: string) => v === "TRUE";

async function main() {
  const leagueNames = ["Monday", "Tuesday"] as const;
  const leagues = new Map<string, string>();
  for (const name of leagueNames) {
    const league = await prisma.league.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    leagues.set(name, league.id);
  }

  // Reseed players/pairs fresh each run (TeamSlot rows cascade-detach via
  // the optional playerId FK, so this is safe even with existing teams).
  await prisma.timeSlotPair.deleteMany({});
  await prisma.player.deleteMany({});

  const rosterRows = readCsv("roster.csv");
  const playerIds = new Map<string, string>(); // "League|Name" -> id

  for (const row of rosterRows) {
    const leagueId = leagues.get(row.league);
    if (!leagueId) throw new Error(`Unknown league "${row.league}" for player "${row.name}"`);

    const player = await prisma.player.create({
      data: {
        name: row.name,
        leagueId,
        canPlaySkip: toBool(row.canPlaySkip),
        canPlayVice: toBool(row.canPlayVice),
        canPlaySecond: toBool(row.canPlaySecond),
        canPlayLead: toBool(row.canPlayLead),
        isNewCurler: toBool(row.isNewCurler),
        active: toBool(row.active),
        notes: row.notes || null,
      },
    });
    playerIds.set(`${row.league}|${row.name}`, player.id);
  }

  const priorityMap: Record<string, number> = { High: 2, Medium: 1, Low: 0 };
  const pairRows = readCsv("timeslot-pairs.csv");
  for (const row of pairRows) {
    const leagueId = leagues.get(row.league);
    const playerAId = playerIds.get(`${row.league}|${row.playerA}`);
    const playerBId = playerIds.get(`${row.league}|${row.playerB}`);
    if (!leagueId || !playerAId || !playerBId) {
      throw new Error(`Could not resolve pair "${row.playerA}" / "${row.playerB}" (${row.league})`);
    }

    await prisma.timeSlotPair.create({
      data: {
        leagueId,
        playerAId,
        playerBId,
        priority: priorityMap[row.priority] ?? 0,
        notes: row.notes || null,
      },
    });
  }

  console.log(`Seeded ${leagues.size} leagues, ${rosterRows.length} players, ${pairRows.length} pairs.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
