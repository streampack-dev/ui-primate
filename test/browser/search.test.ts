import { beforeEach, describe, it } from "vitest";
import { expectAccessible, open, useBrowser } from "../support/browser.ts";
import { post, resetStubs, stub, stubSite } from "../support/stub.ts";

useBrowser();

beforeEach(async () => {
  await resetStubs();
  await stubSite();
  await stub("/posts/search", { posts: [post({ title: "Virtual threads", excerpt: "Loom, at last.", commentCount: 2, tags: ["jvm"] })], page: 0, totalPages: 3, totalCount: 45 }, { query: { q: "loom" } });
});

describe("search, in a browser", () => {
  it("is accessible, light and dark, empty and with results", async () => {
    for (const theme of ["light", "dark"] as const) {
      for (const path of ["/search", "/search?q=loom"]) {
        const { page } = await open(path, theme);
        await expectAccessible(page);
      }
    }
  });
});
