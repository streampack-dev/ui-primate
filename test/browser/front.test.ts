import { beforeEach, describe, expect, it } from "vitest";
import { open, useBrowser } from "../support/browser.ts";
import { list, post, resetStubs, stub, stubSite } from "../support/stub.ts";

useBrowser();

/* The front page in a browser (#96): the cards' details and the masthead's words, as drawn. */
beforeEach(async () => {
  await resetStubs();
  await stubSite();
  const busy = { authorDisplayName: "dreamreal", publishedAt: "2026-10-19T15:00:00Z", commentCount: 12, versionKinds: ["audio"] };
  await stub("/posts", list(Array.from({ length: 9 }, () => post(busy))), { query: { page: 0, size: 9 } });
  await stub("/posts/popular", list([post(busy), post(busy), post(busy)]), { query: { page: 0, size: 3 } });
});

describe("the front page, in a browser", () => {
  it("never breaks a card's author, date, comments or audio over two lines", async () => {
    for (const width of [390, 768, 1024, 1440]) {
      const { page } = await open("/", "light", new Map(), { viewport: { width, height: 900 } });
      const broken = await page.evaluate(() => [...document.querySelectorAll("main article .byline > *")]
        .filter((part) => part.getClientRects().length > 1 || part.getBoundingClientRect().height > 24)
        .map((part) => part.textContent!.trim()));
      expect(broken, `${width}px`).toEqual([]);
      await page.context().close();
    }
  });

  it("draws the masthead's date and tagline at full strength, haloed against the art", async () => {
    for (const theme of ["light", "dark"] as const) {
      const { page } = await open("/", theme);
      await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
      const words = await page.evaluate(() => [...document.querySelectorAll(".masthead-frame p")].map((p) => {
        const s = getComputedStyle(p);
        return { text: p.textContent!.trim(), colour: s.color, opacity: s.opacity, halo: s.textShadow };
      }));
      expect(words.map((w) => w.text)).toEqual([expect.any(String), "Programming News & Technical Writing"]);
      for (const w of words) {
        expect(w.colour, `${theme}: ${w.text}`).not.toMatch(/\/ 0\.\d+\)|, 0\.\d+\)$/);
        expect(w.opacity).toBe("1");
        expect(w.halo, `${theme}: ${w.text}`).not.toBe("none");
      }
      await page.context().close();
    }
  });
});
