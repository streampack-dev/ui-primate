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

  it("refreshes the list in place, without a new page", async () => {
    const { page, errors } = await open("/rss");
    const documents: string[] = [];
    page.on("request", (r) => { if (r.resourceType() === "document") documents.push(r.url()); });
    await stub("/rss/items", {
      items: [{ id: "019f0000-0000-7000-8000-0000000f0002", feedTitle: "Inside Java", feedUrl: "https://inside.java/feed.xml", guid: "g2", link: "about:blank",
        title: "JDK 27 early access", summary: "", publishedAt: "2026-10-02T02:00:00Z", receivedAt: "2026-10-02T02:05:00Z" }],
      page: 0, totalPages: 2, totalCount: 22,
    }, { query: { page: 0, size: 20 } });

    await page.click("a.rss-refresh");

    await page.getByText("JDK 27 early access").waitFor();
    expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe("/rss");
    expect(documents).toEqual([]);
    expect(errors).toEqual([]);
  });

  it("swaps the items for the feed list in place, and back (#28)", async () => {
    const { page, errors } = await open("/rss");
    const documents: string[] = [];
    page.on("request", (r) => { if (r.resourceType() === "document") documents.push(r.url()); });

    await page.click("a.rss-feed-list-link");
    await page.getByRole("heading", { name: "Feed List" }).waitFor();
    expect(new URL(page.url()).search).toBe("?view=feeds");
    expect((await page.locator("li.rss-feed-row").allTextContents()).map((t) => t.replace(/\s+/g, " ").trim())).toEqual(["Inside Java - https://inside.java/feed.xml"]);
    expect(await page.locator("article.rss-item").count()).toBe(0);

    await page.click("a.rss-items-link");
    await page.getByText("JDK 26 is here").waitFor();
    expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe("/rss");
    expect(documents).toEqual([]);
    expect(errors).toEqual([]);
  });

  it("doesn't offer the feed list on a phone", async () => {
    const { page } = await open("/rss", "light", new Map(), { viewport: { width: 390, height: 844 } });
    await page.getByText("JDK 26 is here").waitFor();
    expect(await page.locator("a.rss-feed-list-link").isVisible()).toBe(false);
    expect(await page.locator("a.rss-refresh").isVisible()).toBe(true);
  });

  it("is accessible, light and dark", async () => {
    for (const theme of ["light", "dark"] as const) {
      for (const path of ["/rss", "/rss?view=feeds"]) {
        const { page } = await open(path, theme);
        await expectAccessible(page);
      }
    }
  });
});
