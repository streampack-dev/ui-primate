import { beforeEach, describe, expect, it } from "vitest";
import { open, useBrowser } from "../support/browser.ts";
import { resetStubs, stub, stubSite } from "../support/stub.ts";

useBrowser();

beforeEach(async () => {
  await resetStubs();
  await stubSite();
  await stub("/posts", { posts: [], page: 0, totalPages: 0, totalCount: 0 });
});

describe("the fonts, in a browser", () => {
  it("draw the page in the site's faces, from the site, each fetched once", async () => {
    const { page } = await open("/");
    await page.evaluate(() => document.fonts.ready);
    const loaded = await page.evaluate(() => [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family.replace(/"/g, "")));
    const fetched = await page.evaluate(() => performance.getEntriesByType("resource").map((e) => e.name).filter((n) => /woff2|fonts\.g/.test(n)));

    expect(new Set(loaded)).toEqual(new Set(["IBM Plex Mono", "Instrument Serif", "Source Serif 4"]));
    expect(fetched.every((url) => new URL(url).origin === new URL(page.url()).origin)).toBe(true);
    // The preload is the fetch the page uses, not a second one.
    expect(fetched.length).toBe(new Set(fetched).size);
  });
});
