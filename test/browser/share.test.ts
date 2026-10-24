import type { BrowserContext, Page } from "playwright";
import { beforeEach, describe, expect, it } from "vitest";
import { expectAccessible, open, useBrowser } from "../support/browser.ts";
import { list, post, resetStubs, stub, stubSite } from "../support/stub.ts";

/* A post's Share to menu (#98): BCN's text, and a button per network that copies it and opens the
   network's own share page. The text and the pages are clientjs's share module; this checks the
   site's use of it. The networks' pages are answered here, so nothing leaves the machine. */
useBrowser();

const ID = "019f0000-0000-7000-8000-0000000000e1";
const SLUG = "2026/10/debounce-apis";
const PAGE = `/posts/${SLUG}`;
const DEK = "Angular gets debounce APIs. When to use them, and when not to.";

beforeEach(async () => {
  await resetStubs();
  await stubSite();
  await stub("/posts", list([post({ id: ID, title: "Debounce", slug: SLUG }), post(), post()]), { query: { page: 0, size: 9 } });
  await stub("/posts/popular", list([post({ title: "Popular" })]), { query: { page: 0, size: 3 } });
  await stub(`/posts/${SLUG}`, {
    id: ID, title: "Debounce", slug: SLUG, excerpt: DEK, renderedHtml: "<p>Body.</p>",
    authorDisplayName: "dreamreal", publishedAt: "2026-10-01T02:30:00Z", tags: [], categories: [],
  });
  await stub(`/posts/${SLUG}/comments`, { totalActiveCount: 0, comments: [] });
  await stub(`/posts/${ID}/access`, {}, { status: 204 });
});

async function offline(context: BrowserContext) {
  await context.route(/^https:\/\/(x\.com|www\.linkedin\.com|www\.facebook\.com)\//, (route) => route.fulfill({ body: "a network" }));
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
}

const canonical = (page: Page) => page.locator("link[rel=canonical]").getAttribute("href");

describe("a post's Share to, in a browser", () => {
  it("shows BCN's text, and a button copies it and opens the network's page", async () => {
    const { page, errors } = await open(PAGE);
    await offline(page.context());
    const url = (await canonical(page))!;
    const text = `From BCN:\n\n${DEK}\n\n${url}`;

    await page.locator(".share-menu > summary").click();
    const panel = page.locator(".share-menu[open] [data-share]");
    await expect.poll(() => panel.locator("textarea").inputValue()).toBe(text);
    await expectAccessible(page);

    const [tab] = await Promise.all([page.context().waitForEvent("page"), panel.locator("a[data-share-to=linkedin]").click()]);
    expect(tab.url()).toBe(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`);
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(text);
    await expect.poll(() => panel.locator("[data-share-status]").textContent()).toBe("Copied. Paste it into LinkedIn.");
    // The menu stays open, saying so, for the reader's return; the page stays where it was.
    expect(await page.locator(".share-menu").getAttribute("open")).not.toBeNull();
    expect(new URL(page.url()).pathname).toBe(PAGE);
    expect(errors).toEqual([]);
    await page.context().close();
  });

  it("copies the box as the reader edited it, and X gets the text on its page", async () => {
    const { page } = await open(PAGE);
    await offline(page.context());
    await page.locator(".share-menu > summary").click();
    await page.locator(".share-menu textarea").fill("Shorter, for X.");

    const [tab] = await Promise.all([page.context().waitForEvent("page"), page.locator(".share-menu a[data-share-to=x]").click()]);

    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("Shorter, for X.");
    expect(tab.url()).toMatch(/^https:\/\/x\.com\/intent\/post\?text=From%20BCN%3A/);
    await page.context().close();
  });

  it("isn't on the site's own pages", async () => {
    await stub("/pages/about", { id: "019f0000-0000-7000-8000-0000000000e2", title: "About", slug: "about", excerpt: "About.", renderedHtml: "<p>About.</p>", authorDisplayName: "staff", publishedAt: "2026-10-01T02:30:00Z", tags: [], categories: ["_sidebar"] });
    const { page } = await open("/posts/about");
    expect(await page.locator(".share-menu").count()).toBe(0);
    await page.context().close();
  });
});
