import { beforeEach, describe, expect, it } from "vitest";
import { expectAccessible, open, useBrowser } from "../support/browser.ts";
import { resetStubs, stub, stubSite } from "../support/stub.ts";

useBrowser();

const PHONE = { width: 390, height: 844 };

beforeEach(async () => {
  await resetStubs();
  await stubSite();
  await stub("/rss/feeds", { feeds: [
    { title: "Inside Java", feedUrl: "https://inside.java/feed.xml", siteUrl: "https://inside.java", itemCount: 12, latestItemTimestamp: "2026-10-01T02:00:00Z" },
    { title: "A feed with a very long address", feedUrl: `https://example.org/${"very-long-path-segment-".repeat(8)}rss.xml`, siteUrl: null, itemCount: 1, latestItemTimestamp: null },
  ] });
  await stub("/rss/items", { items: [], page: 0, totalPages: 0, totalCount: 0 }, { query: { page: 0, size: 20 } });
});

describe("the list of every feed, in a browser (#28)", () => {
  it("is reached from the reader's All Feeds link", async () => {
    const { page, errors } = await open("/rss");
    await page.click("a.rss-all-feeds");
    await page.getByRole("heading", { name: "All Feeds" }).waitFor();

    expect(new URL(page.url()).pathname).toBe("/rss/feeds");
    expect(errors).toEqual([]);
  });

  it("copies a row's IRC command, and says so in words", async () => {
    const { page, errors } = await open("/rss/feeds");
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    const row = page.locator("li.feed-row", { hasText: "Inside Java" });
    const button = row.getByRole("button", { name: "Copy the command for Inside Java" });

    await button.click();

    await expect.poll(() => row.locator(".feed-copied").textContent()).toBe("Copied");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("feed subscribe https://inside.java/feed.xml");
    expect(errors).toEqual([]);
  });

  it("filters with its form, drawn in place", async () => {
    const { page, errors } = await open("/rss/feeds");
    await page.getByLabel("Feed title or address contains").fill("inside");
    await page.getByLabel("Feed title or address contains").press("Enter");

    await expect.poll(() => page.locator("li.feed-row").count()).toBe(1);
    expect(new URL(page.url()).search).toBe("?q=inside");
    expect(await page.locator(".feeds-count").textContent()).toBe("1 of 2 feeds");
    // A page drawn in place still gets its Copy buttons.
    await page.getByRole("button", { name: "Copy the command for Inside Java" }).waitFor();
    expect(errors).toEqual([]);
  });

  it("is accessible, light and dark, wide and on a phone, and fits a phone", async () => {
    for (const viewport of [undefined, PHONE]) {
      for (const theme of ["light", "dark"] as const) {
        const { page } = await open("/rss/feeds", theme, new Map(), { viewport });
        await page.locator("button.feed-copy").first().waitFor();
        await expectAccessible(page);
        if (viewport) {
          const width = await page.evaluate(() => document.documentElement.scrollWidth);
          expect(width, `${theme} page width`).toBeLessThanOrEqual(PHONE.width);
        }
      }
    }
  });
});
