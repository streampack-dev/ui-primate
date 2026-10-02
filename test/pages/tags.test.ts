import { beforeEach, describe, expect, it } from "vitest";
import { page, text } from "../support/page.ts";
import { post, requests, resetStubs, stub, stubSite } from "../support/stub.ts";

const list = (posts: unknown[], pageNo = 0, totalPages = 1, totalCount = posts.length) => ({ posts, page: pageNo, totalPages, totalCount });

beforeEach(async () => {
  await resetStubs();
  await stubSite();
  await stub("/taxonomy", { tags: { kotlin: 30, jvm: 12, "spring boot": 2 }, categories: {}, aggregate: {}, factoidTags: {} });
});

describe("the tags", () => {
  it("are listed alphabetically, each a way to its posts, with how many there are", async () => {
    const { status, doc } = await page("/tags");
    const tags = doc.querySelectorAll("a.tag-chip");

    expect(status).toBe(200);
    expect(text(doc.querySelector("main h1"))).toBe("Tags");
    expect(text(doc.querySelector(".tags-count"))).toBe("3 tags across all articles");
    expect(tags.map((a) => [text(a.querySelector(".tag-chip-name")), text(a.querySelector(".tag-chip-count"))])).toEqual([
      ["jvm", "12"], ["kotlin", "30"], ["spring boot", "2"],
    ]);
    expect(tags.map((a) => a.getAttribute("href"))).toEqual(["/tags/jvm", "/tags/kotlin", "/tags/spring%20boot"]);
  });

  it("say so when there are none", async () => {
    await stub("/taxonomy", { tags: {}, categories: {} });
    expect(text((await page("/tags")).doc.querySelector("main"))).toContain("No tags yet");
  });

  it("are titled for browsers and link previews", async () => {
    const { doc } = await page("/tags");
    expect(text(doc.querySelector("title"))).toBe("Tags | ByteCode.News");
    expect(doc.querySelector("link[rel=canonical]")?.getAttribute("href")).toMatch(/\/tags$/);
  });
});

describe("a tag's page", () => {
  it("lists the posts with the tag, each as search lists them, read from the API by tag", async () => {
    await stub("/posts", list([
      post({ title: "Virtual threads", slug: "2026/09/virtual-threads", excerpt: "Loom, at last.", authorDisplayName: "ada", publishedAt: "2026-10-01T02:30:00Z", commentCount: 1, tags: ["jvm", "loom"] }),
    ], 0, 1, 1), { query: { tag: "jvm", page: 0, size: 20 } });
    const { status, doc } = await page("/tags/jvm");
    const row = doc.querySelector("article.post-row")!;

    expect(status).toBe(200);
    expect(text(doc.querySelector("main h1"))).toBe("#jvm");
    expect(doc.querySelector("main header a[href='/tags']")).not.toBeNull();
    expect(text(doc.querySelector(".tag-count"))).toBe("1 article");
    expect(row.querySelector("h2 a")?.getAttribute("href")).toBe("/posts/2026/09/virtual-threads");
    expect(text(row)).toContain("By ada");
    expect(text(row.querySelector("time"))).toBe("October 1, 2026");
    expect(text(row)).toContain("1 comment");
    expect(row.querySelectorAll(".tags a").map((a) => a.getAttribute("href"))).toEqual(["/tags/jvm", "/tags/loom"]);
  });

  it("takes a tag with spaces and such, as it was written", async () => {
    await stub("/posts", list([post({ title: "Boot" })]), { query: { tag: "spring boot" } });
    const { doc } = await page("/tags/spring%20boot");

    expect(text(doc.querySelector("main h1"))).toBe("#spring boot");
    expect((await requests()).find((r) => r.path === "/posts" && r.query.tag)!.query.tag).toBe("spring boot");
  });

  it("pages through the posts", async () => {
    await stub("/posts", list([post()], 1, 3, 45), { query: { tag: "kotlin", page: 1 } });
    const { doc } = await page("/tags/kotlin?page=1");

    expect(doc.querySelector("a.pagelink[rel=prev]")?.getAttribute("href")).toBe("/tags/kotlin");
    expect(doc.querySelector("a.pagelink[rel=next]")?.getAttribute("href")).toBe("/tags/kotlin?page=2");
    expect(text(doc.querySelector(".list-pages"))).toBe("Page 2 of 3");
  });

  it("says when there are no posts with it yet", async () => {
    await stub("/posts", list([]), { query: { tag: "cobol" } });
    expect(text((await page("/tags/cobol")).doc.querySelector("main"))).toContain("No articles yet");
  });

  it("says it's unavailable when the API is down and nothing was kept", async () => {
    await stub("/posts", { detail: "down" }, { query: { tag: "never-asked" }, status: 503 });
    const { status, doc } = await page("/tags/never-asked");
    expect(status).toBe(503);
    expect(text(doc.querySelector("main"))).toContain("Backend Temporarily Unavailable");
  });

  it("is titled for the tag", async () => {
    await stub("/posts", list([]), { query: { tag: "jvm" } });
    const { doc } = await page("/tags/jvm");
    expect(text(doc.querySelector("title"))).toBe("jvm | ByteCode.News");
    expect(doc.querySelector("meta[name=description]")?.getAttribute("content")).toBe('Articles tagged "jvm" on bytecode.news');
    expect(doc.querySelector("link[rel=canonical]")?.getAttribute("href")).toMatch(/\/tags\/jvm$/);
  });
});
