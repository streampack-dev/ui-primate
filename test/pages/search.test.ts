import { beforeEach, describe, expect, it } from "vitest";
import { page, text } from "../support/page.ts";
import { post, requests, resetStubs, stub, stubSite } from "../support/stub.ts";

const results = (posts: unknown[], pageNo = 0, totalPages = 1, totalCount = posts.length) => ({ posts, page: pageNo, totalPages, totalCount });

beforeEach(async () => {
  await resetStubs();
  await stubSite();
});

const searches = async () => (await requests()).filter((r) => r.path === "/posts/search");

describe("search", () => {
  it("asks for something to search for, with a form that works without script, asking the API nothing", async () => {
    const { status, doc } = await page("/search");
    const form = doc.querySelector("main form[action='/search']")!;

    expect(status).toBe(200);
    expect(text(doc.querySelector("main h1"))).toBe("Search Posts");
    expect(form.getAttribute("method")).toBe("get");
    expect(form.querySelector("input[name=q][type=search]")).not.toBeNull();
    expect(await searches()).toEqual([]);
  });

  it("lists what the API finds, each post linked, with its excerpt, byline, date, comments and tags", async () => {
    await stub("/posts/search", results([
      post({ title: "Virtual threads", slug: "2026/09/virtual-threads", excerpt: "Loom, at last.", authorDisplayName: "ada", publishedAt: "2026-10-01T02:30:00Z", commentCount: 2, tags: ["jvm", "loom"] }),
    ], 0, 1, 1), { query: { q: "loom", page: 0, size: 20 } });
    const { doc } = await page("/search?q=%20loom%20");
    const hit = doc.querySelector("article.search-result")!;

    expect(text(doc.querySelector("main h1"))).toBe('Results for "loom"');
    expect(text(doc.querySelector(".search-count"))).toBe("1 match");
    expect(hit.querySelector("h2 a")?.getAttribute("href")).toBe("/posts/2026/09/virtual-threads");
    expect(text(hit.querySelector("h2"))).toBe("Virtual threads");
    expect(text(hit)).toContain("Loom, at last.");
    expect(text(hit)).toContain("By ada");
    // The site's day: UTC.
    expect(text(hit.querySelector("time"))).toBe("October 1, 2026");
    expect(text(hit)).toContain("2 comments");
    expect(hit.querySelectorAll(".tags a").map((a) => a.getAttribute("href"))).toEqual(["/tags/jvm", "/tags/loom"]);
    // The search, ready to change.
    expect(doc.querySelector("main input[name=q]")?.getAttribute("value")).toBe("loom");
  });

  it("asks the API for the trimmed words, twenty to a page", async () => {
    await stub("/posts/search", results([]), { query: { q: "virtual threads" } });
    await page("/search?q=+virtual+threads+&page=x");
    expect((await searches()).at(-1)!.query).toEqual({ q: "virtual threads", page: "0", size: "20" });
  });

  it("pages through the results, keeping the words", async () => {
    await stub("/posts/search", results([post()], 1, 3, 45), { query: { q: "jvm", page: 1 } });
    const { doc } = await page("/search?q=jvm&page=1");

    expect(text(doc.querySelector(".search-count"))).toBe("45 matches");
    expect(doc.querySelector("a.pagelink[rel=prev]")?.getAttribute("href")).toBe("/search?q=jvm");
    expect(doc.querySelector("a.pagelink[rel=next]")?.getAttribute("href")).toBe("/search?q=jvm&page=2");
    expect(text(doc.querySelector(".search-pages"))).toBe("Page 2 of 3");
  });

  it("says when nothing matched, the words shown as typed", async () => {
    await stub("/posts/search", results([]), { query: { q: "<b>cobol</b>" } });
    const { doc } = await page("/search?q=%3Cb%3Ecobol%3C%2Fb%3E");

    expect(text(doc.querySelector("main"))).toContain('No posts matched "<b>cobol</b>".');
    // As text, and as the search box's value: never an element.
    expect(doc.querySelector("main b")).toBeNull();
    expect(doc.querySelector("main input[name=q]")?.getAttribute("value")).toBe("<b>cobol</b>");
  });

  it("says it's unavailable when the API is down and nothing was kept", async () => {
    await stub("/posts/search", { detail: "down" }, { query: { q: "never-asked" }, status: 503 });
    const { status, doc } = await page("/search?q=never-asked");

    expect(status).toBe(503);
    expect(text(doc.querySelector("main"))).toContain("Search Temporarily Unavailable");
  });

  it("shows each result's passage, with the words that matched marked, in place of the excerpt", async () => {
    await stub("/posts/search", results([
      post({ title: "Runtimes", slug: "2026/09/runtimes", excerpt: "An excerpt not shown.", match: { source: "body", text: "An emerging runtime, call it oden", marks: [{ start: 3, end: 11 }] } }),
    ]), { query: { q: "emergent" } });
    const { doc } = await page("/search?q=emergent");
    const hit = doc.querySelector("article.search-result")!;

    expect(text(hit.querySelector(".search-passage"))).toBe("An emerging runtime, call it oden");
    expect(hit.querySelectorAll(".search-passage mark").map((m) => text(m))).toEqual(["emerging"]);
    expect(text(hit)).not.toContain("An excerpt not shown.");
    // The address is as before.
    expect(hit.querySelector("h2 a")?.getAttribute("href")).toBe("/posts/2026/09/runtimes");
  });

  it("shows a passage's text as text, never as markup", async () => {
    await stub("/posts/search", results([
      post({ match: { source: "body", text: "<script>alert(1)</script> <b>bold</b>", marks: [{ start: 26, end: 37 }] } }),
    ]), { query: { q: "bold" } });
    const { doc } = await page("/search?q=bold");
    const passage = doc.querySelector(".search-passage")!;

    expect(passage.querySelector("script")).toBeNull();
    expect(passage.querySelector("b")).toBeNull();
    expect(text(passage.querySelector("mark"))).toBe("<b>bold</b>");
  });

  it("shows the excerpt when a result has no passage", async () => {
    await stub("/posts/search", results([post({ excerpt: "Loom, at last.", match: null })]), { query: { q: "loom" } });
    const { doc } = await page("/search?q=loom");

    expect(doc.querySelector(".search-passage")).toBeNull();
    expect(text(doc.querySelector("article.search-result"))).toContain("Loom, at last.");
  });

  it("says why the API refused a query, such as one too long, keeping the words in the box", async () => {
    const long = "a".repeat(201);
    await stub("/posts/search", { title: "Bad Request", status: 400, detail: "Search query is too long: at most 200 characters" }, { query: { q: long }, status: 400 });
    const { status, doc } = await page(`/search?q=${long}`);

    expect(status).toBe(400);
    expect(text(doc.querySelector(".search-error"))).toBe("Search query is too long: at most 200 characters");
    expect(doc.querySelector(".search-error")?.getAttribute("role")).toBe("alert");
    expect(doc.querySelector("article.search-result")).toBeNull();
    expect(doc.querySelector("main input[name=q]")?.getAttribute("value")).toBe(long);
  });

  it("tells readers that quotes match a word exactly, on the page and in both header boxes", async () => {
    const { doc } = await page("/search");

    expect(text(doc.querySelector("main .search-hint"))).toContain("Use quotes for an exact word");
    for (const id of ["header-search", "mobile-header-search", "search-q"]) {
      const box = doc.querySelector(`#${id}`)!;
      const hint = doc.querySelector(`#${box.getAttribute("aria-describedby")}`);
      expect(text(hint), id).toContain("Use quotes for an exact word");
    }
    expect(doc.querySelector("#header-search")?.getAttribute("title")).toContain("Use quotes for an exact word");
  });

  it("is titled for the words, and kept out of search engines", async () => {
    await stub("/posts/search", results([]), { query: { q: "jvm" } });
    const { doc } = await page("/search?q=jvm");

    expect(text(doc.querySelector("title"))).toBe("Search: jvm | ByteCode.News");
    expect(doc.querySelector("meta[name=robots]")?.getAttribute("content")).toContain("noindex");
  });
});
