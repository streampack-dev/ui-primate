import { beforeEach, describe, expect, inject, it } from "vitest";
import { page, text } from "../support/page.ts";
import { requests, resetStubs, stub, stubSite } from "../support/stub.ts";

const ITEM = "019f0000-0000-7000-8000-0000000f0001";

function item(fields: Record<string, unknown> = {}) {
  return {
    id: ITEM, feedTitle: "Inside Java", feedUrl: "https://inside.java/feed.xml", siteUrl: "https://inside.java", guid: "g1",
    link: "https://inside.java/2026/09/30/jdk-26/", title: "JDK 26 is here", summary: "What's new.",
    publishedAt: "2026-10-01T02:00:00Z", receivedAt: "2026-10-01T02:05:00Z", ...fields,
  };
}

const items = (list: unknown[], pageNo = 0, totalPages = 1, totalCount = list.length) => ({ items: list, page: pageNo, totalPages, totalCount });

beforeEach(async () => {
  await resetStubs();
  await stubSite();
  await stub("/rss/feeds", { feeds: [
    { title: "Inside Java", feedUrl: "https://inside.java/feed.xml", siteUrl: "https://inside.java", itemCount: 12, latestItemTimestamp: null },
    { title: "", feedUrl: "https://example.org/rss", siteUrl: null, itemCount: 1, latestItemTimestamp: null },
  ] });
  await stub("/rss/items", items([item()]), { query: { page: 0, size: 20 } });
});

describe("the RSS reader", () => {
  it("lists the stored items: each a link out, with where it goes, when, and its summary", async () => {
    const { status, doc } = await page("/rss");
    const entry = doc.querySelector("article.rss-item")!;
    const link = entry.querySelector("a.rss-item-title")!;

    expect(status).toBe(200);
    expect(text(link)).toBe("JDK 26 is here");
    expect(link.getAttribute("href")).toBe("https://inside.java/2026/09/30/jdk-26/");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(link.getAttribute("data-rss-access")).toBe(ITEM);
    expect(text(entry)).toContain("https://inside.java/2026/09/30/jdk-26/");
    // The site's day: UTC.
    expect(text(entry.querySelector("time"))).toBe("Oct 1, 2026");
    expect(text(entry.querySelector(".rss-summary"))).toBe("What's new.");
  });

  it("shows a summary's markup as text, and an undated item as undated", async () => {
    await stub("/rss/items", items([item({ summary: "<script>alert(1)</script> & more", publishedAt: null })]), { query: { page: 0, size: 20 } });
    const { doc, html } = await page("/rss");

    expect(text(doc.querySelector(".rss-summary"))).toBe("<script>alert(1)</script> & more");
    expect(html).not.toContain("<script>alert(1)");
    expect(text(doc.querySelector("article.rss-item"))).toContain("undated");
  });

  it("counts what it found", async () => {
    await stub("/rss/items", items([item(), item({ id: "019f0000-0000-7000-8000-0000000f0002" })], 0, 3, 41), { query: { page: 0, size: 20 } });
    expect(text((await page("/rss")).doc.querySelector(".rss-count"))).toBe("41 items");
  });

  it("filters by feed and by title, with a form that works without script", async () => {
    await stub("/rss/items", items([item()]), { query: { page: 0, size: 20, feed: "https://inside.java/feed.xml", title: "jdk" } });
    const { doc } = await page("/rss?feed=https%3A%2F%2Finside.java%2Ffeed.xml&title=jdk");
    const form = doc.querySelector("form.rss-filter")!;

    expect(form.getAttribute("action")).toBe("/rss");
    expect(form.getAttribute("method")).toBe("get");
    expect(form.querySelectorAll("select[name=feed] option").map((o) => text(o))).toEqual(["All feeds", "Inside Java (12 items)", "https://example.org/rss (1 item)"]);
    expect(form.querySelector("option[selected]")?.getAttribute("value")).toBe("https://inside.java/feed.xml");
    expect(form.querySelector("input[name=title]")?.getAttribute("value")).toBe("jdk");
    expect(doc.querySelector("a.rss-clear")?.getAttribute("href")).toBe("/rss");
    const asked = (await requests()).filter((r) => r.path === "/rss/items").at(-1)!;
    expect(asked.query).toEqual({ page: "0", size: "20", feed: "https://inside.java/feed.xml", title: "jdk" });
  });

  it("keeps a feed asked for that isn't listed, as ui-nextjs does", async () => {
    await stub("/rss/items", items([]), { query: { page: 0, size: 20, feed: "Somewhere" } });
    const { doc } = await page("/rss?feed=Somewhere");
    expect(doc.querySelector("option[selected]")?.getAttribute("value")).toBe("Somewhere");
  });

  it("pages through the items, keeping the filters", async () => {
    await stub("/rss/items", items([item()], 1, 3), { query: { page: 1, size: 20, title: "jdk" } });
    const { doc } = await page("/rss?page=1&title=jdk");

    expect(doc.querySelector("a.pagelink[rel=prev]")?.getAttribute("href")).toBe("/rss?title=jdk");
    expect(doc.querySelector("a.pagelink[rel=next]")?.getAttribute("href")).toBe("/rss?page=2&title=jdk");
  });

  it("starts at the first page for a page that isn't one", async () => {
    const { doc } = await page("/rss?page=-4");
    expect(doc.querySelector("a.pagelink[rel=prev]")).toBeNull();
    expect((await requests()).filter((r) => r.path === "/rss/items").at(-1)!.query.page).toBe("0");
  });

  it("says when nothing matched", async () => {
    await stub("/rss/items", items([]), { query: { page: 0, size: 20, title: "cobol" } });
    expect(text((await page("/rss?title=cobol")).doc.querySelector("main"))).toContain("No RSS items matched these filters.");
  });

  it("still works when the feeds can't be listed", async () => {
    await stub("/rss/feeds", { detail: "down" }, { status: 503 });
    await stub("/rss/items", items([item()]), { query: { page: 0, size: 20, title: "feeds-down" } });
    const { status, doc } = await page("/rss?title=feeds-down");

    expect(status).toBe(200);
    expect(doc.querySelectorAll("article.rss-item").length).toBe(1);
  });

  it("says it's unavailable when the items can't be had and none were kept", async () => {
    await stub("/rss/items", { detail: "down" }, { query: { page: 0, size: 20, title: "never-seen" }, status: 503 });
    const { status, doc } = await page("/rss?title=never-seen");

    expect(status).toBe(503);
    expect(text(doc.querySelector("main"))).toContain("RSS Reader Unavailable");
  });

  it("is titled for browsers and link previews", async () => {
    const { doc } = await page("/rss");
    expect(text(doc.querySelector("title"))).toBe("RSS Reader | ByteCode.News");
  });
});

describe("opening an RSS item", () => {
  it("is recorded with the API", async () => {
    await stub(`/rss/items/${ITEM}/access`, {}, { method: "POST", status: 202 });
    const response = await fetch(`${inject("appUrl")}/rss/items/${ITEM}/access`, { method: "POST" });

    expect(response.status).toBe(204);
    expect((await requests()).some((r) => r.method === "POST" && r.path === `/rss/items/${ITEM}/access`)).toBe(true);
  });

  it("isn't, for an id that isn't one", async () => {
    const response = await fetch(`${inject("appUrl")}/rss/items/not-an-id/access`, { method: "POST" });

    expect(response.status).toBe(400);
    expect((await requests()).some((r) => r.method === "POST")).toBe(false);
  });
});
