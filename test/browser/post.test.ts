import { beforeEach, describe, expect, it } from "vitest";
import { expectAccessible, open, useBrowser } from "../support/browser.ts";
import { list, post, requests, resetStubs, stub, stubSite } from "../support/stub.ts";

useBrowser();

const ID = "019f0000-0000-7000-8000-0000000000b1";
async function stubPost(html: string) {
  await stub("/posts/2026/09/coded", {
    id: ID, title: "Coded", slug: "2026/09/coded", excerpt: "Code.", renderedHtml: html,
    authorDisplayName: "dreamreal", publishedAt: "2026-09-21T15:00:00Z", tags: ["jvm"], categories: [],
  });
  await stub("/posts/2026/09/coded/comments", { totalActiveCount: 1, comments: [{ id: "c1", authorDisplayName: "alice", renderedHtml: "<p>Nice.</p>", createdAt: "2026-09-22T10:00:00Z", deleted: false, children: [] }] });
  await stub(`/posts/${ID}/access`, {}, { status: 204 });
}

beforeEach(async () => {
  await resetStubs();
  await stubSite();
});

describe("a post, in a browser", () => {
  it("highlights its code, loading highlight.js only because it has some", async () => {
    await stubPost(`<p>See:</p><pre><code class="language-java">public class A { int x = 1; }</code></pre>`);
    const { page, errors } = await open("/posts/2026/09/coded");
    await page.waitForSelector(".post-body pre code.hljs .hljs-keyword");
    expect(errors).toEqual([]);
  });

  it("doesn't load highlight.js without code", async () => {
    await stubPost("<p>No code here.</p>");
    const scripts: string[] = [];
    const { page } = await open("/posts/2026/09/coded");
    page.on("request", (r) => scripts.push(r.url()));
    await page.reload();
    await page.waitForLoadState("networkidle");
    // Only highlight.js itself has highlightAuto; a page without code never asks for it.
    const bodies = await Promise.all(scripts.filter((u) => u.endsWith(".js")).map(async (u) => (await fetch(u)).text()));
    expect(bodies.length).toBeGreaterThan(0);
    expect(bodies.some((b) => b.includes("highlightAuto"))).toBe(false);
  });

  it("records a read when it's opened", async () => {
    await stubPost("<p>Read me.</p>");
    const { page } = await open("/posts/2026/09/coded");
    await page.waitForLoadState("networkidle");
    await expect.poll(async () => (await requests()).some((r) => r.method === "POST" && r.path === `/posts/${ID}/access`)).toBe(true);
  });

  for (const theme of ["light", "dark"] as const) {
    it(`passes axe in the ${theme} theme`, async () => {
      await stubPost(`<p>Body with <a href="/x">a link</a>.</p><pre><code>x = 1</code></pre>`);
      const { page } = await open("/posts/2026/09/coded", theme);
      await expectAccessible(page);
    });
  }
});

describe("the front page, in a browser", () => {
  beforeEach(async () => {
    await stub("/posts", list([post({ title: "Lead", tags: ["jvm"] }), post({ title: "Beside" }), post(), post({ title: "Below" })]), { query: { page: 0, size: 9 } });
    await stub("/posts/popular", list([post({ title: "Popular" })]), { query: { page: 0, size: 3 } });
  });

  it("runs the masthead's animation, the one asked for", async () => {
    const { page, errors } = await open("/?ambient=boids&ambientSeed=3");
    await page.waitForSelector("svg.masthead-art .masthead-boids");
    expect(await page.getAttribute("svg.masthead-art", "data-masthead")).toBe("boids");
    expect(errors).toEqual([]);
  });

  it("hands clicks anywhere on the masthead to the animation, not just the bare art", async () => {
    const { page } = await open("/?ambient=boids&ambientSeed=3");
    await page.waitForSelector(".masthead-frame[data-masthead-poke]");
    // The tagline sits over the art: a click there still reaches it.
    const tagline = page.locator(".masthead-frame .section-label").first();
    expect(await tagline.evaluate((el) => !!el.closest("[data-masthead-poke]"))).toBe(true);
  });

  it("switches theme with its button, and remembers", async () => {
    const { page } = await open("/");
    const dark = () => page.evaluate(() => document.documentElement.classList.contains("dark"));
    expect(await dark()).toBe(false);
    await page.click("[data-theme-toggle]");
    expect(await dark()).toBe(true);
    await page.reload();
    expect(await dark()).toBe(true);
  });

  it("shows the moon in the light and the sun in the dark", async () => {
    const { page } = await open("/");
    // The header's own, shown on a wide screen; a phone's is in its menu (#95).
    const toggle = page.locator("[data-theme-toggle]:visible");
    await expect.poll(() => toggle.locator(".icon-moon").isVisible()).toBe(true);
    expect(await toggle.locator(".icon-sun").isVisible()).toBe(false);
    await toggle.click();
    await expect.poll(() => toggle.locator(".icon-sun").isVisible()).toBe(true);
    expect(await toggle.locator(".icon-moon").isVisible()).toBe(false);
  });

  for (const theme of ["light", "dark"] as const) {
    it(`passes axe in the ${theme} theme`, async () => {
      const { page } = await open("/?ambient=circuit", theme);
      await expectAccessible(page);
    });
  }
});
