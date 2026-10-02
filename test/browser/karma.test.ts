import { beforeEach, describe, it } from "vitest";
import { expectAccessible, open, useBrowser } from "../support/browser.ts";
import { resetStubs, stub, stubSite } from "../support/stub.ts";

useBrowser();

beforeEach(async () => {
  await resetStubs();
  await stubSite();
  await stub("/karma/leaderboard", {
    top: [{ subject: "java", score: 40, lastUpdated: "2026-10-01" }, { subject: "kotlin", score: 10, lastUpdated: "2026-09-30" }],
    bottom: [{ subject: "cobol", score: -8, lastUpdated: "2026-10-01" }],
  }, { query: { limit: 25 } });
});

describe("karma, in a browser", () => {
  it("is accessible, light and dark, both boards", async () => {
    for (const theme of ["light", "dark"] as const) {
      for (const path of ["/karma", "/karma?view=bottom"]) {
        const { page } = await open(path, theme);
        await expectAccessible(page);
      }
    }
  });
});
