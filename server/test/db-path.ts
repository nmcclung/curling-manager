import path from "node:path";

// Absolute path (not the "file:./relative" convention used in .env) so the
// test DB lives under test/ regardless of Prisma's usual "relative to
// schema.prisma" resolution — keeps it out of prisma/ alongside real
// migrations/seed data/dev.db.
export const TEST_DB_PATH = path.join(import.meta.dirname, "test.db");
export const TEST_DATABASE_URL = `file:${TEST_DB_PATH}`;
