import { TEST_DATABASE_URL } from "./db-path.js";

// Must run (and take effect) before src/prisma.ts's PrismaClient is
// constructed in any test file — Vitest runs setupFiles before a test
// file's own imports are evaluated, so this is safe as a side effect here.
process.env.DATABASE_URL = TEST_DATABASE_URL;
