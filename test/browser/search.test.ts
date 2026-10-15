import { beforeEach, describe, expect, it } from "vitest";
import { expectAccessible, open, useBrowser } from "../support/browser.ts";
import { post, resetStubs, stub, stubSite } from "../support/stub.ts";

useBrowser();

beforeEach(async () => {
  await resetStubs();
  await stubSite();
  await stub("/posts/search", { posts: [post({ title: "Virtual threads", excerpt: "Loom, at last.", commentCount: 2, tags: ["jvm"], match: { source: "body", text: "Project Loom brings green threads to the JVM", marks: [{ start: 8, end: 12 }] } })], page: 0, totalPages: 3, totalCount: 45 }, { query: { q: "loom" } });
  await stub("/posts/search", { title: "Bad Request", status: 400, detail: "Search query has too many quoted words or phrases: at most 10" }, { query: { q: "toomany" }, status: 400 });
});

describe("search, in a browser", () => {
  it("searches from its form", async () => {
    const { page, errors } = await open("/search");
    await page.fill(".search-form input[name=q]", "loom");
    await page.press(".search-form input[name=q]", "Enter");
    await page.waitForURL(/\/search\?q=loom$/);
    await page.getByText("Virtual threads").waitFor();
    expect(errors).toEqual([]);
  });

  it("is accessible, light and dark, empty and with results", async () => {
    for (const theme of ["light", "dark"] as const) {
      for (const path of ["/search", "/search?q=loom", "/search?q=toomany"]) {
        const { page } = await open(path, theme);
        await expectAccessible(page);
      }
    }
  });
});
