import { beforeEach, describe, expect, it } from "vitest";
import { page, text } from "../support/page.ts";
import { signedIn, ADMIN } from "../support/readers.ts";
import { post, requests, resetStubs, stub, stubSite } from "../support/stub.ts";

const ADA = "019c5c8a-609d-7cd4-975b-50bbcc412a33";
const list = (posts: unknown[], pageNo = 0, totalPages = 1, totalCount = posts.length) => ({ posts, page: pageNo, totalPages, totalCount });

beforeEach(async () => {
  await resetStubs();
  await stubSite();
});

describe("an author's page", () => {
  it("lists their published posts, read from the API by their id, headed with their name", async () => {
    await stub("/posts", list([
      post({ title: "Virtual threads", slug: "2026/09/virtual-threads", authorId: ADA, authorDisplayName: "ada", publishedAt: "2026-10-01T02:30:00Z" }),
      post({ title: "Records", authorId: ADA, authorDisplayName: "ada" }),
    ], 0, 1, 2), { query: { author: ADA, page: 0, size: 20 } });
    const { status, doc } = await page(`/authors/${ADA}`);

    expect(status).toBe(200);
    expect(text(doc.querySelector("main h1"))).toBe("ada");
    expect(text(doc.querySelector("main header .section-label"))).toBe("Author");
    expect(text(doc.querySelector(".author-count"))).toBe("2 articles");
    const row = doc.querySelector("article.post-row")!;
    expect(row.querySelector("h2 a")?.getAttribute("href")).toBe("/posts/2026/09/virtual-threads");
    expect(text(row.querySelector("time"))).toBe("October 1, 2026");
  });

  it("pages through the posts", async () => {
    await stub("/posts", list([post({ authorId: ADA, authorDisplayName: "ada" })], 1, 3, 45), { query: { author: ADA, page: 1 } });
    const { doc } = await page(`/authors/${ADA}?page=1`);

    expect(doc.querySelector("a.pagelink[rel=prev]")?.getAttribute("href")).toBe(`/authors/${ADA}`);
    expect(doc.querySelector("a.pagelink[rel=next]")?.getAttribute("href")).toBe(`/authors/${ADA}?page=2`);
    expect(text(doc.querySelector(".list-pages"))).toBe("Page 2 of 3");
  });

  it("is titled for the author, at its own address", async () => {
    await stub("/posts", list([post({ authorId: ADA, authorDisplayName: "ada" })]), { query: { author: ADA } });
    const { doc } = await page(`/authors/${ADA}`);
    expect(text(doc.querySelector("title"))).toBe("ada | ByteCode.News");
    expect(doc.querySelector("meta[name=description]")?.getAttribute("content")).toBe("Articles by ada on bytecode.news");
    expect(doc.querySelector("link[rel=canonical]")?.getAttribute("href")).toMatch(new RegExp(`/authors/${ADA}$`));
  });

  it("says there's nothing to read when the author has no published posts", async () => {
    await stub("/posts", list([]), { query: { author: ADA } });
    const { status, doc } = await page(`/authors/${ADA}`);
    expect(status).toBe(404);
    expect(text(doc.querySelector("main"))).toContain("No published posts");
  });

  it("isn't there for an id that isn't a user id, and asks the API nothing", async () => {
    const { status } = await page("/authors/not-a-uuid");
    expect(status).toBe(404);
    expect((await requests()).some((r) => r.path === "/posts" && r.query.author)).toBe(false);
  });

  it("says it's unavailable when the API is down and nothing was kept", async () => {
    const down = "019c5c8a-609d-7cd4-975b-000000000000";
    await stub("/posts", { detail: "down" }, { query: { author: down }, status: 503 });
    const { status, doc } = await page(`/authors/${down}`);
    expect(status).toBe(503);
    expect(text(doc.querySelector("main"))).toContain("Backend Temporarily Unavailable");
  });
});

describe("bylines", () => {
  it("link the author's name to their page in a list", async () => {
    await stub("/posts", list([post({ authorId: ADA, authorDisplayName: "ada" })]), { query: { category: "Guides" } });
    const { doc } = await page("/category/Guides");
    const by = doc.querySelector("article.post-row .byline a.author-link");
    expect(by?.getAttribute("href")).toBe(`/authors/${ADA}`);
    expect(text(by)).toBe("ada");
  });

  it("link it on the front page, in every card", async () => {
    const posts = Array.from({ length: 9 }, (_, i) => post({ title: `Story ${i}`, authorId: ADA, authorDisplayName: "ada" }));
    await stub("/posts", list(posts), { query: { page: 0, size: 9 } });
    await stub("/posts/popular", list([post({ authorId: ADA, authorDisplayName: "ada" })]), { query: { page: 0, size: 3 } });
    const { doc } = await page("/");
    const links = doc.querySelectorAll("a.author-link");
    expect(links.length).toBe(10);
    expect(links.every((a) => a.getAttribute("href") === `/authors/${ADA}`)).toBe(true);
  });

  it("link it on a post's own page", async () => {
    const detail = { id: "00000000-0000-0000-0000-0000000000d1", title: "Midden", slug: "2026/09/midden", renderedHtml: "<p>Body.</p>",
      authorId: ADA, authorDisplayName: "ada", authorRole: "USER", publishedAt: "2026-09-21T15:00:00Z", updatedAt: "2026-09-21T15:00:00Z", tags: [], categories: [] };
    await stub("/posts/2026/09/midden", detail);
    await stub("/posts/2026/09/midden/comments", { comments: [], totalActiveCount: 0 });
    const { doc } = await page("/posts/2026/09/midden");
    const by = doc.querySelector("article .byline a.author-link");
    expect(by?.getAttribute("href")).toBe(`/authors/${ADA}`);
    expect(text(doc.querySelector("article .byline"))).toContain("By ada");
  });

  it("stay plain text for a post with no author id, as an older API sends", async () => {
    await stub("/posts", list([post({ authorDisplayName: "ada" })]), { query: { category: "Old" } });
    const { doc } = await page("/category/Old");
    expect(doc.querySelector("a.author-link")).toBeNull();
    expect(text(doc.querySelector("article.post-row .byline"))).toContain("By ada");
  });
});

describe("a reader's own posts, on their profile", () => {
  const mine = [
    post({ id: "019f0000-0000-7000-8000-0000000000b1", title: "Out now", slug: "2026/10/out-now", state: "PUBLISHED" }),
    post({ id: "019f0000-0000-7000-8000-0000000000b2", title: "Coming soon", slug: "2026/10/soon", state: "SCHEDULED", publishedAt: "2026-11-01T12:00:00Z" }),
    post({ id: "019f0000-0000-7000-8000-0000000000b3", title: "Half done", slug: "2026/10/half", state: "DRAFT", publishedAt: null }),
  ];

  async function stubFront() {
    await stub("/posts", list([post()]), { query: { page: 0, size: 9 } });
    await stub("/posts/popular", list([]), { query: { page: 0, size: 3 } });
  }

  it("lists each with its state in words, a published one linked to the post", async () => {
    await stubFront();
    await stub("/auth/posts", list(mine), { query: { page: 0, size: 20 } });
    const v = await signedIn();
    const { status, doc } = await v.get("/profile");
    const section = doc.querySelector("section[aria-labelledby=your-posts-heading]")!;

    expect(status).toBe(200);
    expect(text(section.querySelector("h2"))).toBe("Your Posts");
    const rows = section.querySelectorAll("li.own-post");
    expect(rows.map((r) => text(r.querySelector(".own-post-title")))).toEqual(["Out now", "Coming soon", "Half done"]);
    expect(rows.map((r) => text(r.querySelector(".own-post-state")))).toEqual(["Published", "Scheduled", "Draft"]);
    expect(rows[0].querySelector("a")?.getAttribute("href")).toBe("/posts/2026/10/out-now");
    // A reader can't open the editor, so their unpublished posts aren't links.
    expect(rows[1].querySelector("a")).toBeNull();
    expect(rows[2].querySelector("a")).toBeNull();
    const asked = (await requests()).find((r) => r.path === "/auth/posts")!;
    expect(asked.headers.authorization).toBe("Bearer access-1");
  });

  it("links an admin's unpublished posts to the editor", async () => {
    await stubFront();
    await stub("/auth/posts", list(mine), { query: { page: 0, size: 20 } });
    const v = await signedIn(ADMIN);
    const { doc } = await v.get("/profile");
    const rows = doc.querySelectorAll("li.own-post");
    expect(rows[1].querySelector("a")?.getAttribute("href")).toBe("/edit/019f0000-0000-7000-8000-0000000000b2");
    expect(rows[2].querySelector("a")?.getAttribute("href")).toBe("/edit/019f0000-0000-7000-8000-0000000000b3");
  });

  it("says when there are none", async () => {
    await stubFront();
    await stub("/auth/posts", list([]), { query: { page: 0, size: 20 } });
    const v = await signedIn();
    const { doc } = await v.get("/profile");
    expect(text(doc.querySelector("section[aria-labelledby=your-posts-heading]"))).toContain("You haven't written any posts yet.");
  });

  it("still shows the profile when the list can't be had", async () => {
    await stubFront();
    await stub("/auth/posts", { detail: "down" }, { query: { page: 0, size: 20 }, status: 503 });
    const v = await signedIn();
    const { status, doc } = await v.get("/profile");
    expect(status).toBe(200);
    expect(text(doc.querySelector("section[aria-labelledby=your-posts-heading]"))).toContain("Your posts couldn't be listed just now.");
  });

  it("links to the reader's own author page", async () => {
    await stubFront();
    await stub("/auth/posts", list(mine), { query: { page: 0, size: 20 } });
    const v = await signedIn();
    const { doc } = await v.get("/profile");
    expect(doc.querySelector("section[aria-labelledby=your-posts-heading] a.own-author-page")?.getAttribute("href"))
      .toBe("/authors/019f0000-0000-7000-8000-00000000a001");
  });
});
