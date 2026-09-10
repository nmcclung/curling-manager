import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { TEST_DATABASE_URL, TEST_DB_PATH } from "./db-path.js";

const SERVER_ROOT = path.join(import.meta.dirname, "..");

// Runs once before the whole test run (not per file) — builds a fresh
// SQLite file from the real migration history, so integration tests exert
// the same schema/constraints as the real app rather than a hand-maintained
// copy that could drift out of sync.
export default function globalSetup() {
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const f = TEST_DB_PATH + suffix;
    if (existsSync(f)) rmSync(f);
  }

  execSync("npx prisma migrate deploy", {
    cwd: SERVER_ROOT,
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: "inherit",
  });

  return () => {
    for (const suffix of ["", "-journal", "-wal", "-shm"]) {
      const f = TEST_DB_PATH + suffix;
      if (existsSync(f)) rmSync(f);
    }
  };
}
