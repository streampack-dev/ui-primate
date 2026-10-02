import { beforeEach, describe, expect, it } from "vitest";
import { page, text } from "../support/page.ts";
import { post, requests, resetStubs, stub, stubSite } from "../support/stub.ts";

const list = (posts: unknown[], pageNo = 0, totalPages = 1, totalCount = posts.length) => ({ posts, page: pageNo, totalPages, totalCount });

beforeEach(async () => {
  await resetStubs();
  await stubSite();
});

describe("a category's page", () => {
  it("lists the posts in it, as search and tags list them, read from the API by category", async () => {
    await stub("/posts", list([
      post({ title: "Virtual threads", slug: "2026/09/virtual-threads", authorDisplayName: "ada", publishedAt: "2026-10-01T02:30:00Z", tags: ["jvm"] }),
      post({ title: "Records" }),
    ], 0, 1, 2), { query: { category: "Guides", page: 0, size: 20 } });
    const { status, doc } = await page("/category/Guides");

    expect(status).toBe(200);
    expect(text(doc.querySelector("main h1"))).toBe("Guides");
    expect(text(doc.querySelector("main header .section-label"))).toBe("Section");
    expect(text(doc.querySelector(".category-count"))).toBe("2 articles");
    const row = doc.querySelector("article.post-row")!;
    expect(row.querySelector("h2 a")?.getAttribute("href")).toBe("/posts/2026/09/virtual-threads");
    expect(text(row.querySelector("time"))).toBe("October 1, 2026");
  });

  it("takes a name with spaces and such, as it was written", async () => {
    await stub("/posts", list([post()]), { query: { category: "Java News" } });
    const { doc } = await page("/category/Java%20News");
    expect(text(doc.querySelector("main h1"))).toBe("Java News");
    expect((await requests()).find((r) => r.path === "/posts" && r.query.category === "Java News")).toBeTruthy();
  });

  it("pages through the posts", async () => {
    await stub("/posts", list([post()], 1, 3, 45), { query: { category: "Guides", page: 1 } });
    const { doc } = await page("/category/Guides?page=1");

    expect(doc.querySelector("a.pagelink[rel=prev]")?.getAttribute("href")).toBe("/category/Guides");
    expect(doc.querySelector("a.pagelink[rel=next]")?.getAttribute("href")).toBe("/category/Guides?page=2");
    expect(text(doc.querySelector(".list-pages"))).toBe("Page 2 of 3");
  });

  it("says when there are no posts in it yet", async () => {
    await stub("/posts", list([]), { query: { category: "Empty" } });
    expect(text((await page("/category/Empty")).doc.querySelector("main"))).toContain("No articles yet");
  });

  it("isn't there for the site's own categories, which aren't sections", async () => {
    await stub("/posts", list([post({ title: "About", slug: "about" })]), { query: { category: "_sidebar" } });
    const { status } = await page("/category/_sidebar");
    expect(status).toBe(404);
  });

  it("says it's unavailable when the API is down and nothing was kept", async () => {
    await stub("/posts", { detail: "down" }, { query: { category: "never-asked" }, status: 503 });
    const { status, doc } = await page("/category/never-asked");
    expect(status).toBe(503);
    expect(text(doc.querySelector("main"))).toContain("Backend Temporarily Unavailable");
  });

  it("is titled for the category", async () => {
    await stub("/posts", list([]), { query: { category: "Guides" } });
    const { doc } = await page("/category/Guides");
    expect(text(doc.querySelector("title"))).toBe("Guides | ByteCode.News");
    expect(doc.querySelector("meta[name=description]")?.getAttribute("content")).toBe("Articles in Guides on bytecode.news");
    expect(doc.querySelector("link[rel=canonical]")?.getAttribute("href")).toMatch(/\/category\/Guides$/);
  });
});
