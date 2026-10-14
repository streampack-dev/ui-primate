import { beforeEach, describe, expect, it } from "vitest";
import type { Page } from "playwright";
import { open, useBrowser } from "../support/browser.ts";
import { list, post, resetStubs, stub, stubSite } from "../support/stub.ts";

useBrowser();

/* The head says what the page is (#50, @primate/marko's <Head>): on a page loaded whole, once the
   browser has taken it over, and after each link followed in place. Each tag is there once: the
   browser's copy replaces the server's, it isn't added to it. */
const ID = "019f0000-0000-7000-8000-0000000000d1";
const TITLE = `50% faster, 20% smaller <and> "quoted"`;

beforeEach(async () => {
  await resetStubs();
  await stubSite();
  await stub("/posts", list([post({ id: ID, title: TITLE, slug: "2026/10/faster" }), post(), post(), post()]), { query: { page: 0, size: 9 } });
  await stub("/posts/popular", list([]), { query: { page: 0, size: 3 } });
  await stub("/posts/2026/10/faster", {
    id: ID, title: TITLE, slug: "2026/10/faster", excerpt: "Faster.", renderedHtml: "<p>Faster.</p>",
    authorDisplayName: "dreamreal", publishedAt: "2026-10-01T15:00:00Z", tags: ["jvm"], categories: [],
  });
  await stub("/posts/2026/10/faster/comments", { totalActiveCount: 0, comments: [] });
  await stub(`/posts/${ID}/access`, {}, { status: 204 });
  await stub("/posts", list([post({ tags: ["jvm"] })]), { query: { tag: "jvm" } });
});

/** The head's title and page-specific tags: each one's values, so a doubled tag shows. */
function headOf(page: Page) {
  return page.evaluate(() => {
    const all = (selector: string, attribute: string) =>
      [...document.head.querySelectorAll(selector)].map((tag) => tag.getAttribute(attribute));
    return {
      title: document.title,
      titles: document.head.querySelectorAll("title").length,
      description: all('meta[name="description"]', "content"),
      ogTitle: all('meta[property="og:title"]', "content"),
      ogType: all('meta[property="og:type"]', "content"),
      canonical: all('link[rel="canonical"]', "href").map((href) => new URL(href!).pathname),
      ogUrl: all('meta[property="og:url"]', "content").map((href) => new URL(href!).pathname),
      ogImage: all('meta[property="og:image"]', "content").length,
      feeds: all('link[rel="alternate"]', "href"),
    };
  });
}

/** Waits until the browser has the page: Primate's client has started and taken the head over. */
async function hydrated(page: Page) {
  await page.waitForFunction(() => document.head.querySelector('[data-primate-marko-head]:not([data-primate-marko-head="ssr"])'));
}

describe("the page's head, in a browser", () => {
  it("is the post's on a post loaded whole, each tag once", async () => {
    const { page, errors } = await open("/posts/2026/10/faster");
    await hydrated(page);
    expect(await headOf(page)).toEqual({
      title: `${TITLE} | ByteCode.News`,
      titles: 1,
      description: ["Faster."],
      ogTitle: [TITLE],
      ogType: ["article"],
      canonical: ["/posts/2026/10/faster"],
      ogUrl: ["/posts/2026/10/faster"],
      ogImage: 1,
      feeds: ["/feed.xml", "/podcast.xml"],
    });
    expect(errors).toEqual([]);
  });

  it("is the tag page's, the front page's and the post's again, after links followed in place", async () => {
    const { page, errors } = await open("/posts/2026/10/faster");
    await hydrated(page);
    const documents: string[] = [];
    page.on("request", (r) => { if (r.resourceType() === "document") documents.push(r.url()); });

    await page.click('article a.tag[href="/tags/jvm"]');
    await expect.poll(() => page.title()).toBe("jvm | ByteCode.News");
    expect(await headOf(page)).toMatchObject({
      titles: 1,
      description: [`Articles tagged "jvm" on bytecode.news`],
      ogTitle: ["jvm"],
      ogType: ["website"],
      canonical: ["/tags/jvm"],
      ogUrl: ["/tags/jvm"],
      ogImage: 1,
      feeds: ["/feed.xml", "/podcast.xml"],
    });

    await page.click('header a[href="/"]');
    await expect.poll(() => page.title()).toBe("ByteCode.News");
    expect(await headOf(page)).toMatchObject({
      titles: 1,
      ogTitle: ["ByteCode.News"],
      ogType: ["website"],
      canonical: ["/"],
      ogImage: 1,
    });

    await page.click('a[href="/posts/2026/10/faster"]');
    await expect.poll(() => page.title()).toBe(`${TITLE} | ByteCode.News`);
    expect(await headOf(page)).toMatchObject({ titles: 1, ogTitle: [TITLE], canonical: ["/posts/2026/10/faster"] });
    expect(documents).toEqual([]);
    expect(errors).toEqual([]);
  });
});
