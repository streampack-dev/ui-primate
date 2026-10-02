import { beforeEach, describe, it } from "vitest";
import { expectAccessible, open, useBrowser } from "../support/browser.ts";
import { post, resetStubs, stub, stubSite } from "../support/stub.ts";

useBrowser();

beforeEach(async () => {
  await resetStubs();
  await stubSite();
  await stub("/posts", { posts: [post({ tags: ["jvm"], commentCount: 2 })], page: 0, totalPages: 2, totalCount: 21 }, { query: { category: "Guides" } });
});

describe("a category, in a browser", () => {
  it("is accessible, light and dark", async () => {
    for (const theme of ["light", "dark"] as const) {
      const { page } = await open("/category/Guides", theme);
      await expectAccessible(page);
    }
  });
});
