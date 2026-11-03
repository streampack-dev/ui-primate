import { beforeEach, describe, expect, it } from "vitest";
import { open, useBrowser } from "../support/browser.ts";
import { list, post, resetStubs, stub, stubSite } from "../support/stub.ts";

useBrowser();

/* Every text style is measured with APCA (0.0.98G-4g), which weighs contrast with size and weight, as
   WCAG 2's ratio, which axe checks, doesn't (#108). The floors are APCA's: Lc 75 for text read at
   ordinary sizes, 60 for large or bold text, 45 for headlines. */
type Style = { text: string; size: number; weight: number; lc: number; floor: number };

async function shortfalls(path: string, theme: "light" | "dark"): Promise<Style[]> {
  const { page } = await open(path, theme);
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
  const styles: Style[] = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const cx = canvas.getContext("2d", { willReadFrequently: true })!;
    const rgba = (colour: string) => {
      cx.clearRect(0, 0, 1, 1);
      cx.fillStyle = colour;
      cx.fillRect(0, 0, 1, 1);
      return [...cx.getImageData(0, 0, 1, 1).data];
    };
    const background = (el: Element) => {
      for (let e: Element | null = el; e; e = e.parentElement) {
        const c = rgba(getComputedStyle(e).backgroundColor);
        if (c[3] > 200) return c;
      }
      return rgba(getComputedStyle(document.documentElement).backgroundColor);
    };
    const luminance = ([r, g, b]: number[]) => {
      const f = (v: number) => Math.pow(v / 255, 2.4);
      const y = 0.2126729 * f(r) + 0.7151522 * f(g) + 0.072175 * f(b);
      return y < 0.022 ? y + Math.pow(0.022 - y, 1.414) : y;
    };
    const apca = (text: number[], bg: number[]) => {
      const t = luminance(text), b = luminance(bg);
      if (Math.abs(b - t) < 0.0005) return 0;
      const s = b > t ? (Math.pow(b, 0.56) - Math.pow(t, 0.57)) * 1.14 : (Math.pow(b, 0.65) - Math.pow(t, 0.62)) * 1.14;
      return Math.abs(s) < 0.1 ? 0 : Math.abs(s) * 100 - 2.7;
    };
    const seen = new Map<string, Style>();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent!.replace(/\s+/g, " ").trim();
      const el = node.parentElement!;
      if (text.length < 2 || !el.getClientRects().length || el.closest("svg, [aria-hidden=true], .sr-only, .hp")) continue;
      const s = getComputedStyle(el);
      if (s.visibility !== "visible") continue;
      const bg = background(el);
      const c = rgba(s.color);
      const alpha = (c[3] / 255) * Number(s.opacity);
      const ink = c.slice(0, 3).map((v, i) => v * alpha + bg[i] * (1 - alpha));
      const size = parseFloat(s.fontSize), weight = Number(s.fontWeight);
      const floor = size >= 36 || (size >= 24 && weight >= 600) ? 45 : size >= 24 || (size >= 18 && weight >= 600) ? 60 : 75;
      const key = [s.fontFamily, size, weight, ink.join(), bg.join()].join("|");
      if (!seen.has(key)) seen.set(key, { text: text.slice(0, 40), size, weight, lc: Math.round(apca(ink, bg)), floor });
    }
    return [...seen.values()];
  });
  await page.context().close();
  return styles.filter((s) => s.lc < s.floor);
}

beforeEach(async () => {
  await resetStubs();
  await stubSite();
});

describe("the type, in a browser", () => {
  it("is readable on the front page, light and dark", async () => {
    const story = { authorDisplayName: "dreamreal", publishedAt: "2026-10-19T15:00:00Z", commentCount: 12, tags: ["jvm"] };
    await stub("/posts", list(Array.from({ length: 9 }, () => post(story))), { query: { page: 0, size: 9 } });
    await stub("/posts/popular", list([post(story), post(story), post(story)]), { query: { page: 0, size: 3 } });
    for (const theme of ["light", "dark"] as const) expect(await shortfalls("/", theme), theme).toEqual([]);
  });

  it("is readable in a post, light and dark", async () => {
    const id = "019f0000-0000-7000-8000-0000000000c1";
    await stub("/posts/2026/09/legible", {
      id, title: "Legible", slug: "2026/09/legible", excerpt: "Type.", authorDisplayName: "dreamreal",
      publishedAt: "2026-09-21T15:00:00Z", tags: ["jvm"], categories: [],
      renderedHtml: `<p>Reads <a href="https://example.com">a link</a>, <strong>bold</strong> and <code>code</code>.</p><h2>A section</h2><p>More.</p><h3>A part</h3><blockquote><p>Quoted.</p></blockquote>`,
    });
    await stub("/posts/2026/09/legible/comments", { totalActiveCount: 1, comments: [{ id: "c1", authorDisplayName: "alice", renderedHtml: "<p>Nice.</p>", createdAt: "2026-09-22T10:00:00Z", deleted: false, children: [] }] });
    await stub(`/posts/${id}/access`, {}, { status: 204 });
    for (const theme of ["light", "dark"] as const) expect(await shortfalls("/posts/2026/09/legible", theme), theme).toEqual([]);
  });
});
