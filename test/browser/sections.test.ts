import type { Page } from "playwright";
import { beforeEach, describe, expect, it } from "vitest";
import { expectAccessible, open, useBrowser } from "../support/browser.ts";
import { list, post, resetStubs, stub, stubSite } from "../support/stub.ts";

/* Links to a post's sections (#89, streampack#274): the API gives each heading an id that starts
   with section-, and a reader who writes the bare name lands on the heading all the same. Each
   heading has a # link to its own address. The finding and the links are clientjs's sections
   module; this checks the site's use of it. */
useBrowser();

const ID = "019f0000-0000-7000-8000-0000000000d1";
const SLUG = "2026/10/nowhere";
const PAGE = `/posts/${SLUG}`;
const filler = "<p>Filler paragraph that only takes up room, line after line after line.</p>".repeat(20);
const body =
  `<p>Intro.</p><h2 id="section-why-it-matters">Why it matters</h2>${filler}` +
  `<h2 id="section-going-nowhere">Going nowhere</h2><p>The end.</p>${filler}` +
  `<h3 id="section-comments">Comments</h3><p>A heading named like the page's comments.</p>`;

beforeEach(async () => {
  await resetStubs();
  await stubSite();
  await stub("/posts", list([post({ id: ID, title: "Nowhere", slug: SLUG }), post(), post(), post()]), { query: { page: 0, size: 9 } });
  await stub("/posts/popular", list([post({ title: "Popular" })]), { query: { page: 0, size: 3 } });
  await stub(`/posts/${SLUG}`, {
    id: ID, title: "Nowhere", slug: SLUG, excerpt: "Nowhere.", renderedHtml: body,
    authorDisplayName: "dreamreal", publishedAt: "2026-10-01T02:30:00Z", tags: [], categories: [],
  });
  await stub(`/posts/${SLUG}/comments`, { totalActiveCount: 0, comments: [] });
  await stub(`/posts/${ID}/access`, {}, { status: 204 });
});

/* Primate 0.11.4 throws in its popstate handler on any change of the hash in a page whose session
   has no Primate history yet (storage.peek on an empty store: "reading 'at'"), with or without this
   page's scripts. It's Primate's, and harmless here: the browser has gone to the section already. */
const PRIMATE_POPSTATE = "TypeError: Cannot read properties of undefined (reading 'at')";
const ours = (errors: string[]) => errors.filter((e) => e !== PRIMATE_POPSTATE);

const hash = (page: Page) => page.evaluate(() => location.hash);
const inView = (page: Page, id: string) =>
  page.evaluate((id) => {
    const at = document.getElementById(id)!.getBoundingClientRect();
    return at.top >= 0 && at.top < innerHeight;
  }, id);

describe("a post's sections, in a browser", () => {
  it("are reached by their bare names, and the address becomes the section's own", async () => {
    const { page, errors } = await open(`${PAGE}#going-nowhere`);
    await expect.poll(() => hash(page)).toBe("#section-going-nowhere");
    await expect.poll(() => inView(page, "section-going-nowhere")).toBe(true);
    expect(await page.evaluate(() => document.querySelector(":target")?.id)).toBe("section-going-nowhere");
    expect(ours(errors)).toEqual([]);
  });

  it("are reached when the hash changes on the page", async () => {
    const { page } = await open(PAGE);
    await page.waitForSelector(".post-body a.section-link");
    await page.evaluate(() => { location.hash = "why-it-matters"; });
    await expect.poll(() => hash(page)).toBe("#section-why-it-matters");
  });

  it("leave alone a name the page has itself", async () => {
    const { page } = await open(`${PAGE}#comments`);
    await page.waitForSelector(".post-body a.section-link");
    expect(await hash(page)).toBe("#comments");
  });

  it("each have a # link to their own address, named for screen readers", async () => {
    const { page } = await open(PAGE);
    await page.waitForSelector(".post-body a.section-link");
    const links = await page.$$eval(".post-body :is(h2, h3) > a.section-link", (as) =>
      as.map((a) => [a.getAttribute("href"), a.textContent, a.getAttribute("aria-label")]));
    expect(links).toEqual([
      ["#section-why-it-matters", "#", "Link to the section: Why it matters"],
      ["#section-going-nowhere", "#", "Link to the section: Going nowhere"],
      ["#section-comments", "#", "Link to the section: Comments"],
    ]);
  });

  it("show their link when the heading is hovered or the link has focus, and not otherwise", async () => {
    const { page } = await open(PAGE);
    const link = page.locator('a.section-link[href="#section-going-nowhere"]');
    await link.waitFor({ state: "attached" });
    const opacity = () => link.evaluate((a) => getComputedStyle(a).opacity);
    // Where the heading is on the page, not in the window, which a hover may scroll.
    const box = () => page.locator("#section-going-nowhere").evaluate((h) => {
      const at = h.getBoundingClientRect();
      return [at.left, at.top + scrollY, at.width, at.height];
    });
    await page.mouse.move(0, 0);
    await expect.poll(opacity).toBe("0");
    const before = await box();
    await page.locator("#section-going-nowhere").hover();
    await expect.poll(opacity).toBe("1");
    expect(await box()).toEqual(before);
    await page.mouse.move(0, 0);
    await expect.poll(opacity).toBe("0");
    await link.focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await expect.poll(opacity).toBe("1");
  });

  it("are linked on a post reached by a link, with no new document", async () => {
    const { page } = await open("/?ambient=boids&ambientSeed=3");
    await page.click(`a[href="${PAGE}"]`);
    await page.waitForSelector(".post-body a.section-link");
    expect(await page.locator(".post-body a.section-link").count()).toBe(3);
  });

  for (const theme of ["light", "dark"] as const) {
    it(`is accessible with its links, in the ${theme} theme`, async () => {
      const { page } = await open(PAGE, theme);
      await page.waitForSelector(".post-body a.section-link");
      await expectAccessible(page);
    });
  }
});
