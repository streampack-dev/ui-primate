import { beforeEach, describe, expect, it } from "vitest";
import { page, text } from "../support/page.ts";
import { list, post, requests, resetStubs, stub, stubSite } from "../support/stub.ts";

beforeEach(async () => {
  await resetStubs();
  await stubSite();
});

async function stubFront(posts: unknown[], { totalPages = 1, popular = [] as unknown[] } = {}) {
  await stub("/posts", list(posts, 0, totalPages), { query: { page: 0, size: 9 } });
  await stub("/posts/popular", list(popular), { query: { page: 0, size: 3 } });
}

describe("the front page", () => {
  it("leads with the newest post, two beside it, and the next six below the fold", async () => {
    const posts = Array.from({ length: 9 }, (_, i) => post({ title: `Story ${i}` }));
    await stubFront(posts);
    const { status, doc } = await page("/");

    expect(status).toBe(200);
    expect(text(doc.querySelector(".headline-lead"))).toBe("Story 0");
    expect(doc.querySelectorAll(".headline-secondary").map(text)).toEqual(["Story 1", "Story 2"]);
    expect(doc.querySelectorAll(".headline-brief").map(text)).toEqual(["Story 3", "Story 4", "Story 5", "Story 6", "Story 7", "Story 8"]);
    expect(doc.querySelector(".headline-lead a")!.getAttribute("href")).toBe(`/posts/${(posts[0] as { slug: string }).slug}`);
  });

  it("gives the lead its byline, comments and tags, each tag a link", async () => {
    await stubFront([post({ title: "Lead", commentCount: 2, tags: ["jvm", "c++"] })]);
    const { doc } = await page("/");
    const lead = doc.querySelector("article")!;

    expect(text(lead.querySelector(".byline"))).toContain("By dreamreal");
    expect(text(lead.querySelector(".byline"))).toContain("2 comments");
    expect(lead.querySelectorAll(".tags a").map((a) => a.getAttribute("href"))).toEqual(["/tags/jvm", "/tags/c%2B%2B"]);
  });

  it("dates posts by the site's day (UTC), not the server's", async () => {
    // Half past two in the morning UTC on the 1st: still the 30th in New York, where the app runs.
    await stubFront([post({ publishedAt: "2026-10-01T02:30:00Z" })]);
    const { doc } = await page("/");
    expect(text(doc.querySelector(".headline-lead")?.closest("article")?.querySelector("time"))).toBe("October 1, 2026");
  });

  it("marks the other posts' deks for the masthead's Solari board, never the lead's", async () => {
    await stubFront([post({ excerpt: "lead dek" }), post({ excerpt: "beside" }), post(), post({ excerpt: "below" })]);
    const { doc } = await page("/");

    expect(doc.querySelectorAll("[data-masthead-dek=secondary]").map(text)).toContain("beside");
    expect(doc.querySelectorAll("[data-masthead-dek=more]").map(text)).toEqual(["below"]);
    expect(doc.querySelectorAll("[data-masthead-dek]").map(text)).not.toContain("lead dek");
  });

  it("draws the masthead's art blank, for the animation to fill", async () => {
    await stubFront([post()]);
    const { doc } = await page("/");
    const art = doc.querySelector("svg.masthead-art")!;

    expect(art.getAttribute("viewBox")).toBe("0 0 1200 320");
    expect(art.childNodes.length).toBe(0);
    expect(text(doc.querySelector(".masthead-name"))).toBe("bytecode.news");
  });

  it("shows the popular posts on the first page", async () => {
    await stubFront([post()], { popular: [post({ title: "Popular one" })] });
    const { doc } = await page("/");
    expect(text(doc.querySelector("aside"))).toContain("Popular Reads");
    expect(text(doc.querySelector("aside"))).toContain("Popular one");
  });

  it("pages through older posts, nine at a time, without the masthead", async () => {
    await stubFront([post()], { totalPages: 3 });
    await stub("/posts", list([post({ title: "Older" })], 1, 3), { query: { page: 1, size: 9 } });

    const first = (await page("/")).doc;
    expect(first.querySelector(".pagination a")!.getAttribute("href")).toBe("/?page=1");

    const second = (await page("/?page=1")).doc;
    expect(second.querySelector("svg.masthead-art")).toBeNull();
    expect(second.querySelectorAll(".headline-brief").map(text)).toEqual(["Older"]);
    expect(second.querySelectorAll(".pagination a").map((a) => a.getAttribute("href"))).toEqual(["/?page=0", "/?page=2"]);
  });

  it("says the API is unavailable when it can't list the posts, and keeps the rest of the page", async () => {
    await stub("/posts", { detail: "down" }, { query: { page: 7, size: 9 }, status: 503 });
    const { status, doc } = await page("/?page=7");

    expect(status).toBe(503);
    expect(text(doc.querySelector(".notice"))).toContain("Backend Temporarily Unavailable");
    expect(doc.querySelector("header")).not.toBeNull();
  });

  it("asks the API for nine posts and three popular ones", async () => {
    await stubFront([post()]);
    await page("/");
    const asked = (await requests()).filter((r) => r.path.startsWith("/posts") && r.query.category === undefined);
    expect(asked.map((r) => [r.path, r.query])).toEqual(expect.arrayContaining([
      ["/posts", { page: "0", size: "9" }],
      ["/posts/popular", { page: "0", size: "3" }],
    ]));
  });

  it("ships its scripts fingerprinted", async () => {
    await stubFront([post()]);
    const { doc } = await page("/");
    const scripts = doc.querySelectorAll("script[src]").map((s) => s.getAttribute("src")!);

    expect(scripts.length).toBeGreaterThan(0);
    for (const src of scripts) expect(src).toMatch(/-[A-Z0-9]{8}\.js$/);
    expect(doc.querySelector("link[rel=stylesheet][href^='/css-']")).not.toBeNull();
  });
});
