import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { expectAccessible, open, useBrowser } from "../support/browser.ts";
import { resetStubs, stub, stubSite } from "../support/stub.ts";

/* Mermaid diagrams in a post (#61): drawn by the API (streampack#252), coloured here by the
   site's tokens and set in the fonts the API measured them in. The fixture is the API's own
   rendering of a drawn diagram and a refused one. */
useBrowser();

const ID = "019f0000-0000-7000-8000-0000000000d1";
const published = readFileSync("test/fixtures/mermaid/published.html", "utf8").trim();

beforeEach(async () => {
  await resetStubs();
  await stubSite();
  await stub("/posts/2026/10/diagrams", {
    id: ID, title: "Diagrams", slug: "2026/10/diagrams", excerpt: "Diagrams.", renderedHtml: published,
    authorDisplayName: "dreamreal", publishedAt: "2026-10-18T12:00:00Z", tags: [], categories: [],
  });
  await stub("/posts/2026/10/diagrams/comments", { totalActiveCount: 0, comments: [] });
  await stub(`/posts/${ID}/access`, {}, { status: 204 });
});

describe("a post's diagrams, in a browser", () => {
  for (const theme of ["light", "dark"] as const) {
    it(`take the site's colours and the fonts they were measured in, in the ${theme} theme`, async () => {
      const { page, errors } = await open("/posts/2026/10/diagrams", theme);
      await page.waitForSelector(".post-body figure.mermaid > svg");
      await page.evaluate(() => document.fonts.ready);

      const seen = await page.evaluate(() => {
        const svg = document.querySelector(".post-body figure.mermaid > svg")!;
        const probe = document.createElement("span");
        probe.style.color = "var(--foreground)";
        probe.style.backgroundColor = "var(--background)";
        svg.closest("figure")!.appendChild(probe);
        const site = getComputedStyle(probe);
        const result = {
          text: getComputedStyle(svg).color, siteText: site.color,
          font: getComputedStyle(svg).fontFamily,
          plex: document.fonts.check('16px "IBM Plex Sans"'),
          summary: document.querySelector(".post-body figure.mermaid > details > summary")!.textContent,
          refused: document.querySelector(".post-body figure.mermaid-refused figcaption")!.textContent,
        };
        probe.remove();
        return result;
      });
      expect(seen.text).toBe(seen.siteText);
      expect(seen.font.startsWith('"IBM Plex Sans"')).toBe(true);
      expect(seen.plex).toBe(true);
      expect(seen.summary).toBe("Diagram source");
      expect(seen.refused).toMatch(/^This diagram wasn't drawn: Parse error on line 3/);
      await expectAccessible(page);
      expect(errors).toEqual([]);
    });
  }

  it("fetches IBM's Plex Sans for them, from the site", async () => {
    const { page } = await open("/posts/2026/10/diagrams");
    await page.waitForSelector(".post-body figure.mermaid > svg");
    await page.evaluate(() => document.fonts.ready);
    const fetched = await page.evaluate(() => performance.getEntriesByType("resource").map((e) => e.name).filter((n) => n.includes("/diagram-fonts/")));
    expect(fetched.some((url) => url.endsWith("/diagram-fonts/IBMPlexSans-Regular.woff2"))).toBe(true);
  });
});
