import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      // The app's own code, alone: fast, no server.
      { test: { name: "unit", include: ["test/unit/**/*.test.ts"] } },
      // The app as it ships, against the stub API: its pages, and in a browser. The stub is shared,
      // so these files run one at a time.
      {
        test: {
          name: "app",
          include: ["test/pages/**/*.test.ts", "test/browser/**/*.test.ts"],
          globalSetup: ["test/support/app.ts"],
          fileParallelism: false,
          testTimeout: 20_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
