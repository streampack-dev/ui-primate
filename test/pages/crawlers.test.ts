import { beforeEach, describe, expect, inject, it } from "vitest";
import { list, post, resetStubs, stub, stubSite } from "../support/stub.ts";

/* What the site tells crawlers: robots.txt (#72), and llms.txt for language models (#73). */
const get = (path: string) => fetch(`${inject("appUrl")}${path}`);

beforeEach(async () => {
  await resetStubs();
  await stubSite();
});

describe("robots.txt", () => {
  it("names the sitemap and keeps crawlers out of pages with nothing to index", async () => {
    const response = await get("/robots.txt");
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^text\/plain/);
    expect(text).toMatch(/^User-agent: \*$/m);
    expect(text).toContain("Sitemap: https://bytecode.news/sitemap.xml");
    for (const path of ["/login", "/logout", "/edit/", "/admin", "/profile", "/search", "/logs/search", "/logs/*/search", "/og-preview", "/submit", "/comments/"]) {
      expect(text).toMatch(new RegExp(`^Disallow: ${path.replace(/[/*]/g, "\\$&")}$`, "m"));
    }
  });

  it("leaves the posts, the logs and their filters open, and names no crawler to turn away", async () => {
    const text = await (await get("/robots.txt")).text();
    const disallowed = [...text.matchAll(/^Disallow: (.*)$/gm)].map((m) => m[1]);

    for (const open of ["/posts/2026/10/a-post", "/logs/irc/libera/java/2026-10-19?conversation=1", "/tags/java", "/factoids", "/atlas", "/llms.txt"]) {
      expect(disallowed.filter((d) => d && open.startsWith(d))).toEqual([]);
    }
    expect([...text.matchAll(/^User-agent: (.*)$/gm)].map((m) => m[1])).toEqual(["*"]);
  });
});

describe("llms.txt", () => {
  const posts = (n: number) => Array.from({ length: n }, (_, i) =>
    post({ title: `Post ${i + 1}`, slug: `2026/10/post-${i + 1}`, excerpt: `What post ${i + 1} says.`, publishedAt: "2026-10-19T11:00:00Z" }));

  // First, before any test has had the posts kept (the app keeps the API's answers, as it does the
  // sitemap's, and serves the last good one while the API is down).
  it("is unavailable while the API is down, when nothing was kept", async () => {
    await stub("/posts", { detail: "down" }, { query: { page: 0, size: 30 }, status: 503 });
    expect((await get("/llms.txt")).status).toBe(503);
  });

  it("is a short Markdown guide: the site, its latest posts, and where the rest are", async () => {
    await stub("/posts", list(posts(3)), { query: { page: 0, size: 30 } });
    const response = await get("/llms.txt");
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^text\/markdown/);
    expect(text).toMatch(/^# ByteCode\.News\n\n> .+/);
    expect(text).toContain("## Latest posts");
    expect(text).toContain("- [Post 1](https://bytecode.news/posts/2026/10/post-1): What post 1 says.");
    expect(text).toContain("https://bytecode.news/sitemap.xml");
    expect(text).toContain("https://bytecode.news/feed.xml");
    expect(text).toContain("https://bytecode.news/feed.atom");
    expect(text).toContain("https://bytecode.news/podcast.xml");
    expect(text).toContain("https://bytecode.news/tags");
    for (const section of ["/logs", "/atlas", "/factoids"]) expect(text).toContain(`https://bytecode.news${section}`);
  });

  it("stays at 30 posts however many there are, and asks the API for no more", async () => {
    await stub("/posts", { ...list(posts(30)), totalPages: 5, totalCount: 150 }, { query: { page: 0, size: 30 } });
    const text = await (await get("/llms.txt")).text();

    expect(text.match(/^- \[Post \d+\]/gm)).toHaveLength(30);
    expect(text).toContain("150 posts");
  });

  it("leaves out factoids where the site has none", async () => {
    await stubSite({ operationGroups: ["blog", "rss"] });
    await stub("/posts", list(posts(1)), { query: { page: 0, size: 30 } });
    const text = await (await get("/llms.txt")).text();

    expect(text).not.toContain("/factoids");
    expect(text).toContain("/logs");
  });

  it("writes a post's title and summary on one line, whatever they hold", async () => {
    await stub("/posts", list([post({ title: "List<String> [and] more", slug: "2026/10/generics", excerpt: "Line one.\n\nLine two." })]), { query: { page: 0, size: 30 } });
    const text = await (await get("/llms.txt")).text();

    expect(text).toContain("- [List<String> \\[and\\] more](https://bytecode.news/posts/2026/10/generics): Line one. Line two.");
  });
  it("keeps the last good one while the API is down", async () => {
    await stub("/posts", list(posts(2)), { query: { page: 0, size: 30 } });
    await get("/llms.txt");
    await stub("/posts", { detail: "down" }, { query: { page: 0, size: 30 }, status: 503 });
    const response = await get("/llms.txt");

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("- [Post 2]");
  });
});
