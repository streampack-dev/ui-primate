import { beforeEach, describe, expect, it } from "vitest";
import { open, useBrowser } from "../support/browser.ts";
import { post, resetStubs, stub, stubSite } from "../support/stub.ts";

useBrowser();

const PASSAGE = "the idea is that streampack becomes an emergent ontology, and it's pretty close to that. I hope the site is useful to readers";

beforeEach(async () => {
  await resetStubs();
  await stubSite();
  await stub("/posts/search", {
    posts: ["2026/10/updates", "2026/09/heroics"].map((slug) => post({
      slug, title: "Updates to the site, and where it goes from here", publishedAt: "2026-10-05T00:00:00Z",
      match: { source: "body", text: PASSAGE, marks: [{ start: 39, end: 47 }] },
    })),
    page: 0, totalPages: 1, totalCount: 2,
  }, { query: { q: "emergent" } });
});

describe("search results, in a browser", () => {
  // ui-pudl#241: there, a passage beside its title squeezed the title to a letter a line.
  for (const [size, viewport] of [["on a phone", { width: 390, height: 844 }], ["wide", { width: 1400, height: 900 }]] as const) {
    it(`keeps each title on its line, its passage under it, ${size}`, async () => {
      const { page, errors } = await open("/search?q=emergent", "light", new Map(), { viewport });
      const hits = page.locator("article.search-result");
      await hits.first().waitFor();
      expect(await hits.count()).toBe(2);
      for (let i = 0; i < 2; i++) {
        const hit = hits.nth(i);
        const box = (await hit.boundingBox())!;
        const title = (await hit.locator("h2").boundingBox())!;
        const passage = (await hit.locator(".search-passage").boundingBox())!;
        expect(passage.y).toBeGreaterThanOrEqual(title.y + title.height);
        expect(passage.width).toBeGreaterThan(box.width * 0.8);
        const line = await hit.locator("h2").evaluate((h) => parseFloat(getComputedStyle(h).lineHeight));
        expect(title.height).toBeLessThan(line * 4);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      expect(errors).toEqual([]);
    });
  }
});
