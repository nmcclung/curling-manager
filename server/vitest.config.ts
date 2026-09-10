import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./test/setup-env.ts"],
    globalSetup: ["./test/global-setup.ts"],
    // Integration tests share one SQLite file (test/test.db) — run them
    // serially so parallel test files can't race on the same data.
    fileParallelism: false,
  },
});
