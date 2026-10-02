import { beforeEach, describe, it } from "vitest";
import { expectAccessible, open, useBrowser } from "../support/browser.ts";
import { post, resetStubs, stub, stubSite } from "../support/stub.ts";

useBrowser();

beforeEach(async () => {
  await resetStubs();
  await stubSite();
  await stub("/taxonomy", { tags: { kotlin: 30, jvm: 12 }, categories: {} });
  await stub("/posts", { posts: [post({ tags: ["jvm"], commentCount: 2 })], page: 0, totalPages: 2, totalCount: 21 }, { query: { tag: "jvm" } });
});

describe("the tags, in a browser", () => {
  it("are accessible, light and dark, the index and a tag's page", async () => {
    for (const theme of ["light", "dark"] as const) {
      for (const path of ["/tags", "/tags/jvm"]) {
        const { page } = await open(path, theme);
        await expectAccessible(page);
      }
    }
  });
});
