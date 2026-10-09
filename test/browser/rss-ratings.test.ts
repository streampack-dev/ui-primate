import { beforeEach, describe, expect, it } from "vitest";
import { expectAccessible, open, useBrowser } from "../support/browser.ts";
import { ADMIN, signedIn } from "../support/readers.ts";
import { requests, resetStubs, stub, stubSite } from "../support/stub.ts";

useBrowser();

/* An admin rating RSS items in a browser (#27): in place, without a new page. */
const ITEM = "019f0000-0000-7000-8000-0000000f0001";
const ITEM2 = "019f0000-0000-7000-8000-0000000f0002";
const RATE = `/admin/rss/items/${ITEM}/rating`;
const PHONE = { width: 390, height: 844 };

const item = (fields: Record<string, unknown> = {}) => ({
  id: ITEM, feedTitle: "Inside Java", feedUrl: "https://inside.java/feed.xml", guid: "g1", link: "about:blank", title: "JDK 26 is here",
  summary: "What's new in JDK 26.", publishedAt: "2026-10-01T02:00:00Z", receivedAt: "2026-10-01T02:05:00Z", categories: [], tags: [],
  rating: null, ratedBy: null, ratedAt: null, ...fields,
});

beforeEach(async () => {
  await resetStubs();
  await stubSite();
  await stub("/rss/feeds", { feeds: [{ title: "Inside Java", feedUrl: "https://inside.java/feed.xml", itemCount: 12 }] });
  await stub("/rss/items", { items: [item()], page: 0, totalPages: 1, totalCount: 1 }, { query: { page: 0, size: 20 } });
  await stub("/admin/rss/items", {
    items: [item(), item({ id: ITEM2, guid: "g2", title: "Loom, again", rating: "DULL", ratedBy: "ed", ratedAt: "2026-10-09T10:00:00Z" })],
    page: 0, totalPages: 1, totalCount: 2,
  }, { query: { rating: "all", page: 0, size: 20 } });
  await stub("/admin/rss/items", { items: [item()], page: 0, totalPages: 1, totalCount: 1 }, { query: { rating: "unrated", page: 0, size: 20 } });
  await stub(RATE, { itemId: ITEM, rating: "RATES", ratedBy: "ed", ratedAt: "2026-10-09T11:00:00Z" }, { method: "PUT" });
  await stub(RATE, undefined, { method: "DELETE", status: 204 });
});

describe("rating RSS items, in a browser", () => {
  it("rates in place, and clears by pressing the current one, without a new page", async () => {
    const v = await signedIn(ADMIN);
    const { page, errors } = await open("/rss", "light", v.cookies);
    const documents: string[] = [];
    page.on("request", (r) => { if (r.resourceType() === "document") documents.push(r.url()); });
    const group = page.getByRole("group", { name: "Rate “JDK 26 is here”" });
    const rates = group.getByRole("button", { name: "Rates" });

    expect(await rates.getAttribute("aria-pressed")).toBe("false");
    await rates.click();
    await expect.poll(() => rates.getAttribute("aria-pressed")).toBe("true");
    expect(await group.locator(".rss-rating-now").textContent()).toBe("Rated Rates by ed");
    expect(await group.locator("button[data-rating=RATES] .rss-rate-glyph").textContent()).toBe("✓");
    expect(await group.getByRole("button", { name: "Might" }).getAttribute("aria-pressed")).toBe("false");

    await rates.click();
    await expect.poll(() => rates.getAttribute("aria-pressed")).toBe("false");
    expect(await group.locator(".rss-rating-now").textContent()).toBe("Unrated");
    expect(await group.locator("button[data-rating=RATES] .rss-rate-glyph").textContent()).toBe("○");

    const sent = (await requests()).filter((r) => r.path === RATE).map((r) => [r.method, r.body]);
    expect(sent).toEqual([["PUT", { rating: "RATES" }], ["DELETE", undefined]]);
    // The other item is untouched, and the page wasn't left.
    expect(await page.getByRole("group", { name: "Rate “Loom, again”" }).getByRole("button", { name: "Dull" }).getAttribute("aria-pressed")).toBe("true");
    expect(documents).toEqual([]);
    expect(new URL(page.url()).pathname).toBe("/rss");
    expect(errors).toEqual([]);
  });

  it("says so in place when the rating isn't saved, keeping it as it was", async () => {
    await stub(RATE, { detail: "Unknown item" }, { method: "PUT", status: 404 });
    const v = await signedIn(ADMIN);
    const { page, errors } = await open("/rss", "light", v.cookies);
    const group = page.getByRole("group", { name: "Rate “JDK 26 is here”" });

    await group.getByRole("button", { name: "Might" }).click();
    await expect.poll(() => group.locator(".rss-rating-now").textContent()).toBe("That item isn't stored any more. Unrated");
    expect(await group.getByRole("button", { name: "Might" }).getAttribute("aria-pressed")).toBe("false");
    expect(errors).toEqual([]);
  });

  it("filters by rating, by the reader's form", async () => {
    const v = await signedIn(ADMIN);
    const { page, errors } = await open("/rss", "light", v.cookies);
    await page.getByLabel("Rating").selectOption("unrated");
    await page.getByRole("button", { name: "Filter" }).click();
    await expect.poll(() => new URL(page.url()).search).toBe("?feed=&title=&rating=unrated");
    await expect.poll(() => page.locator("article.rss-item").count()).toBe(1);
    expect(errors).toEqual([]);
  });

  it("shows readers no buttons", async () => {
    const { page } = await open("/rss");
    await page.getByText("JDK 26 is here").waitFor();
    expect(await page.locator(".rss-rating, select[name=rating]").count()).toBe(0);
  });

  for (const theme of ["light", "dark"] as const) {
    for (const [size, viewport] of [["wide", undefined], ["on a phone", PHONE]] as const) {
      it(`is accessible to an admin, ${theme}, ${size}`, async () => {
        const v = await signedIn(ADMIN);
        for (const path of ["/rss", "/rss?rating=unrated", "/rss?view=feeds"]) {
          const { page, errors } = await open(path, theme, v.cookies, { viewport });
          await expectAccessible(page);
          expect(errors, path).toEqual([]);
          if (viewport) {
            const wide = await page.evaluate(() => [...document.querySelectorAll("main *")].filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1).map((el) => el.outerHTML.slice(0, 80)));
            expect(wide, `${path} fits a phone`).toEqual([]);
          }
          await page.context().close();
        }
      });
    }
  }
});
