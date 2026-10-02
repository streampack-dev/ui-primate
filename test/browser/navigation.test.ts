import { beforeEach, describe, expect, it } from "vitest";
import { open, useBrowser } from "../support/browser.ts";
import { list, post, requests, resetStubs, stub, stubSite } from "../support/stub.ts";

useBrowser();

/* Following a link draws the next page in place (Marko's CSR), with no new document: the page's
   scripts set it up all the same, as they do a page loaded whole. */
const ID = "019f0000-0000-7000-8000-0000000000c1";

beforeEach(async () => {
  await resetStubs();
  await stubSite();
  await stub("/posts", list([post({ id: ID, title: "Coded", slug: "2026/09/coded" }), post(), post(), post()]), { query: { page: 0, size: 9 } });
  await stub("/posts/popular", list([post({ title: "Popular" })]), { query: { page: 0, size: 3 } });
  await stub("/posts/2026/09/coded", {
    id: ID, title: "Coded", slug: "2026/09/coded", excerpt: "Code.",
    renderedHtml: `<pre><code class="language-java">public class A { int x = 1; }</code></pre>`,
    authorDisplayName: "dreamreal", publishedAt: "2026-09-21T15:00:00Z", tags: [], categories: [],
  });
  await stub("/posts/2026/09/coded/comments", { totalActiveCount: 0, comments: [] });
  await stub(`/posts/${ID}/access`, {}, { status: 204 });
});

async function fromFrontToPost() {
  const opened = await open("/?ambient=boids&ambientSeed=3");
  const { page } = opened;
  await page.waitForSelector("svg.masthead-art .masthead-boids");
  const documents: string[] = [];
  page.on("request", (r) => { if (r.resourceType() === "document") documents.push(r.url()); });
  await page.click('a[href="/posts/2026/09/coded"]');
  await page.waitForSelector("[data-read-post]");
  expect(documents).toEqual([]);
  return { ...opened, documents };
}

describe("a page reached by a link, in a browser", () => {
  it("records the read", async () => {
    await fromFrontToPost();
    await expect.poll(async () => (await requests()).filter((r) => r.method === "POST" && r.path === `/posts/${ID}/access`).length).toBe(1);
  });

  it("highlights its code", async () => {
    const { page, errors } = await fromFrontToPost();
    await page.waitForSelector(".post-body pre code.hljs .hljs-keyword");
    expect(errors).toEqual([]);
  });

  it("keeps the theme button working", async () => {
    const { page } = await fromFrontToPost();
    await page.click("[data-theme-toggle]");
    expect(await page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(true);
  });

  it("updates the head to the page's", async () => {
    const { page } = await fromFrontToPost();
    await expect.poll(() => page.title()).toBe("Coded | ByteCode.News");
    const canonical = () => page.getAttribute('link[rel="canonical"]', "href");
    expect(await canonical()).toMatch(/\/posts\/2026\/09\/coded$/);
    expect(await page.getAttribute('meta[property="og:title"]', "content")).toBe("Coded");
    expect(await page.getAttribute('meta[property="og:type"]', "content")).toBe("article");

    await page.goBack();
    await expect.poll(() => page.title()).toBe("ByteCode.News");
    expect(await canonical()).toMatch(/\/$/);
  });

  it("starts the masthead again on the way back to the front page", async () => {
    const { page, errors, documents } = await fromFrontToPost();
    await page.goBack();
    await page.waitForSelector("svg.masthead-art .masthead-boids");
    await expect.poll(() => page.getAttribute("svg.masthead-art", "data-masthead")).toBeTruthy();
    expect(documents).toEqual([]);
    expect(errors).toEqual([]);
  });
});
