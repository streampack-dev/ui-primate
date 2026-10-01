import { beforeEach, describe, expect, it } from "vitest";
import { inject } from "vitest";
import { page, text } from "../support/page.ts";
import { requests, resetStubs, stub, stubSite } from "../support/stub.ts";

beforeEach(async () => {
  await resetStubs();
  await stubSite();
});

/** A post as /posts/{slug} answers. */
function detail(fields: Partial<Record<string, unknown>> = {}) {
  return {
    id: "019f0000-0000-7000-8000-000000000001",
    title: "Midden",
    slug: "2026/09/midden",
    excerpt: "Midden reads heap dumps.",
    renderedHtml: "<p>Midden reads <strong>heap dumps</strong>.</p>",
    authorDisplayName: "dreamreal",
    publishedAt: "2026-10-01T02:30:00Z",
    updatedAt: "2026-10-01T02:30:00Z",
    status: "APPROVED",
    tags: ["jvm", "tools"],
    categories: [],
    ...fields,
  };
}

function comment(fields: Partial<Record<string, unknown>> = {}) {
  return {
    id: `c-${Math.random().toString(36).slice(2)}`,
    authorDisplayName: "alice",
    renderedHtml: "<p>Nice.</p>",
    createdAt: "2026-10-01T12:00:00Z",
    deleted: false,
    children: [],
    ...fields,
  };
}

async function stubPost(post = detail(), comments: unknown = { comments: [], totalActiveCount: 0 }) {
  await stub(`/posts/${post.slug}`, post);
  await stub(`/posts/${post.slug}/comments`, comments);
}

describe("a post", () => {
  it("shows its title, byline, tags and body, the body as the API rendered it", async () => {
    await stubPost();
    const { status, doc } = await page("/posts/2026/09/midden");

    expect(status).toBe(200);
    expect(text(doc.querySelector("article h1"))).toBe("Midden");
    expect(text(doc.querySelector("article .byline"))).toContain("By dreamreal");
    // The site's day: UTC.
    expect(text(doc.querySelector("article .byline time"))).toBe("October 1, 2026");
    expect(doc.querySelectorAll("article .tags a").map((a) => a.getAttribute("href"))).toEqual(["/tags/jvm", "/tags/tools"]);
    expect(doc.querySelector(".post-body strong")?.textContent).toBe("heap dumps");
  });

  it("is titled and described for browsers and link previews", async () => {
    await stubPost();
    const { doc } = await page("/posts/2026/09/midden");

    expect(text(doc.querySelector("title"))).toBe("Midden | ByteCode.News");
    expect(doc.querySelector("meta[name=description]")?.getAttribute("content")).toBe("Midden reads heap dumps.");
    expect(doc.querySelector("meta[property='og:title']")?.getAttribute("content")).toBe("Midden");
    expect(doc.querySelector("meta[property='og:type']")?.getAttribute("content")).toBe("article");
    expect(doc.querySelector("link[rel=canonical]")?.getAttribute("href")).toMatch(/\/posts\/2026\/09\/midden$/);
    expect(doc.querySelector("meta[property='og:image']")?.getAttribute("content")).toMatch(/\/og\/posts\/2026\/09\/midden\.png$/);
  });

  it("keeps a title's percent signs and markup characters as they are", async () => {
    await stubPost(detail({ title: `50% faster, 20% smaller <and> "quoted"` }));
    const { doc } = await page("/posts/2026/09/midden");

    expect(text(doc.querySelector("title"))).toBe(`50% faster, 20% smaller <and> "quoted" | ByteCode.News`);
    expect(text(doc.querySelector("article h1"))).toBe(`50% faster, 20% smaller <and> "quoted"`);
  });

  it("moves a post at an old address to its own, for good", async () => {
    await stub("/posts/2026/09/old-name", detail({ slug: "2026/09/midden" }));
    const response = await fetch(`${inject("appUrl")}/posts/2026/09/old-name`, { redirect: "manual" });

    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe("/posts/2026/09/midden");
  });

  it("isn't found when the API has no such post", async () => {
    const { status, doc } = await page("/posts/2026/09/nothing");
    expect(status).toBe(404);
    expect(text(doc.querySelector("main"))).toContain("Not Found");
  });

  it("says it's unavailable when the API is down", async () => {
    await stub("/posts/2026/09/down", { detail: "down" }, { status: 503 });
    const { status, doc } = await page("/posts/2026/09/down");
    expect(status).toBe(503);
    expect(text(doc.querySelector(".notice"))).toContain("Post Unavailable");
  });

  it("records a read when a reader opens it", async () => {
    await stubPost();
    const { doc } = await page("/posts/2026/09/midden");
    expect(doc.querySelector("[data-read-post]")?.getAttribute("data-read-post")).toBe("019f0000-0000-7000-8000-000000000001");

    await stub("/posts/019f0000-0000-7000-8000-000000000001/access", {}, { status: 204 });
    const response = await fetch(`${inject("appUrl")}/read/019f0000-0000-7000-8000-000000000001`, { method: "POST" });
    expect(response.status).toBe(204);
    expect((await requests()).some((r) => r.method === "POST" && r.path === "/posts/019f0000-0000-7000-8000-000000000001/access")).toBe(true);
  });
});

describe("a post's comments", () => {
  it("are counted and threaded, replies under what they answer", async () => {
    await stubPost(detail(), {
      totalActiveCount: 3,
      comments: [comment({ authorDisplayName: "alice", children: [comment({ authorDisplayName: "bob", renderedHtml: "<p>Agreed.</p>" })] }), comment({ authorDisplayName: "carol" })],
    });
    const { doc } = await page("/posts/2026/09/midden");
    const section = doc.querySelector("section.comments")!;

    expect(text(section.querySelector("h2"))).toBe("Comments (3)");
    const top = section.querySelectorAll(":scope > .comment-list > .comment");
    expect(top.map((c) => text(c.querySelector(".meta")).split(" at ")[0])).toEqual(["alice", "carol"]);
    expect(text(top[0].querySelector(".comment-replies .comment .comment-body"))).toBe("Agreed.");
  });

  it("show a removed comment as removed, keeping its replies", async () => {
    await stubPost(detail(), { totalActiveCount: 1, comments: [comment({ deleted: true, renderedHtml: "", children: [comment({ renderedHtml: "<p>Still here.</p>" })] })] });
    const { doc } = await page("/posts/2026/09/midden");

    expect(text(doc.querySelector(".comment"))).toContain("[deleted]");
    expect(text(doc.querySelector(".comment-replies .comment-body"))).toBe("Still here.");
  });

  it("say there are none yet", async () => {
    await stubPost();
    expect(text((await page("/posts/2026/09/midden")).doc.querySelector("section.comments"))).toContain("No comments yet.");
  });

  it("say they're unavailable without losing the post", async () => {
    // A post the app hasn't seen: for one it has, it would rightly serve the comments it kept.
    await stub("/posts/2026/09/unseen", detail({ slug: "2026/09/unseen" }));
    await stub("/posts/2026/09/unseen/comments", { detail: "down" }, { status: 503 });
    const { status, doc } = await page("/posts/2026/09/unseen");

    expect(status).toBe(200);
    expect(text(doc.querySelector("section.comments"))).toContain("Comments are temporarily unavailable.");
  });
});

describe("a page of the site's own", () => {
  it("is read from /pages, with no comments", async () => {
    await stub("/pages/about", detail({ title: "About", slug: "about", categories: ["_sidebar"] }));
    const { status, doc } = await page("/posts/about");

    expect(status).toBe(200);
    expect(text(doc.querySelector("article h1"))).toBe("About");
    expect(doc.querySelector("section.comments")).toBeNull();
    expect(doc.querySelector("meta[property='og:image']")).toBeNull();
  });
});

describe("the front page's head", () => {
  it("names the site", async () => {
    await stub("/posts", { posts: [], page: 0, totalPages: 0 }, { query: { page: 0, size: 9 } });
    const { doc } = await page("/");
    expect(text(doc.querySelector("title"))).toBe("ByteCode.News");
    expect(doc.querySelector("meta[property='og:type']")?.getAttribute("content")).toBe("website");
  });
});
