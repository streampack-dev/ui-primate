import { beforeEach, describe, expect, it } from "vitest";
import { expectAccessible, open, useBrowser } from "../support/browser.ts";
import { requests, resetStubs, stub, stubSite } from "../support/stub.ts";

useBrowser();

const ITEM = "019f0000-0000-7000-8000-0000000f0001";

beforeEach(async () => {
  await resetStubs();
  await stubSite();
  await stub("/rss/feeds", { feeds: [{ title: "Inside Java", feedUrl: "https://inside.java/feed.xml", itemCount: 12 }] });
  await stub("/rss/items", {
    items: [{ id: ITEM, feedTitle: "Inside Java", feedUrl: "https://inside.java/feed.xml", guid: "g1", link: "about:blank", title: "JDK 26 is here",
      summary: "What's new in JDK 26.", publishedAt: "2026-10-01T02:00:00Z", receivedAt: "2026-10-01T02:05:00Z" }],
    page: 0, totalPages: 2, totalCount: 21,
  }, { query: { page: 0, size: 20 } });
  await stub(`/rss/items/${ITEM}/access`, {}, { method: "POST", status: 202 });
});

describe("the RSS reader, in a browser", () => {
  it("records an item followed out", async () => {
    const { page, errors } = await open("/rss");
    await page.click("a.rss-item-title");
    await expect.poll(async () => (await requests()).some((r) => r.method === "POST" && r.path === `/rss/items/${ITEM}/access`)).toBe(true);
    expect(errors).toEqual([]);
  });

  it("is accessible, light and dark", async () => {
    for (const theme of ["light", "dark"] as const) {
      const { page } = await open("/rss", theme);
      await expectAccessible(page);
    }
  });
});
