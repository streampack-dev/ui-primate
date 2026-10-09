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

describe("refreshing the RSS reader (#5)", () => {
  it("offers a Refresh that keeps the filters and page, and says how new the newest item is", async () => {
    await stub("/rss/items", items([item({ receivedAt: new Date(Date.now() - 12 * 60_000).toISOString() })], 1, 3, 41), { query: { page: 1, size: 20, feed: "https://inside.java/feed.xml" } });
    const { doc } = await page(`/rss?page=1&feed=${encodeURIComponent("https://inside.java/feed.xml")}`);

    expect(doc.querySelector("a.rss-refresh")!.getAttribute("href"))
      .toBe(`/rss?page=1&feed=${encodeURIComponent("https://inside.java/feed.xml")}&refresh`);
    expect(text(doc.querySelector(".rss-newest"))).toBe("newest item 12 minutes ago");
  });

  it("asks the API again and goes back to the list as it was asked for", async () => {
    const response = await fetch(`${inject("appUrl")}/rss?title=jdk&refresh`, { redirect: "manual" });

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/rss?title=jdk");
  });

  it("says nothing of the newest item when nothing is listed", async () => {
    await stub("/rss/items", items([]), { query: { page: 0, size: 20 } });
    const { doc } = await page("/rss");

    expect(doc.querySelector(".rss-newest")).toBeNull();
    expect(doc.querySelector("a.rss-refresh")!.getAttribute("href")).toBe("/rss?refresh");
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

describe("the feed list, in the reader (#28)", () => {
  // 25 feeds, out of order and in mixed case; one untitled, one without a site.
  const many = () => [
    { title: "zeta weekly", feedUrl: "https://zeta.example/rss", siteUrl: "https://zeta.example", itemCount: 3, latestItemTimestamp: null },
    { title: "", feedUrl: "https://example.org/rss", siteUrl: null, itemCount: 1, latestItemTimestamp: null },
    { title: "Baeldung", feedUrl: "https://feeds.feedblitz.com/baeldung", siteUrl: null, itemCount: 0, latestItemTimestamp: null },
    { title: "inside java", feedUrl: "https://inside.java/feed.xml", siteUrl: "https://inside.java", itemCount: 12, latestItemTimestamp: null },
    ...Array.from({ length: 21 }, (_, n) => ({ title: `Feed ${String(n).padStart(2, "0")}`, feedUrl: `https://f${n}.example/rss`, siteUrl: null, itemCount: 1, latestItemTimestamp: null })),
  ];
  const rows = (doc: Awaited<ReturnType<typeof page>>["doc"]) => doc.querySelectorAll("li.rss-feed-row").map((r) => text(r));

  it("is offered by a Feed List link on the reader, hidden on a phone", async () => {
    const { doc } = await page("/rss");
    const link = doc.querySelector("a.rss-feed-list-link")!;

    expect(text(link)).toBe("Feed List");
    expect(link.getAttribute("href")).toBe("/rss?view=feeds");
    expect(link.classList.contains("hidden")).toBe(true);
    expect(link.classList.contains("md:inline")).toBe(true);
    expect(doc.querySelector("ul.rss-feed-list")).toBeNull();
  });

  it("takes the items' place, as IRC's feed list gives it: title - address, by title", async () => {
    await stub("/rss/feeds", { feeds: many().slice(0, 4) });
    const { status, doc } = await page("/rss?view=feeds");

    expect(status).toBe(200);
    expect(doc.querySelectorAll("article.rss-item").length).toBe(0);
    expect(text(doc.querySelector("#rss-feeds-heading"))).toBe("Feed List");
    expect(doc.querySelector("section.rss-feeds")?.getAttribute("aria-labelledby")).toBe("rss-feeds-heading");
    expect(rows(doc)).toEqual([
      "Baeldung - https://feeds.feedblitz.com/baeldung",
      "https://example.org/rss",
      "inside java - https://inside.java/feed.xml",
      "zeta weekly - https://zeta.example/rss",
    ]);
    expect(text(doc.querySelector(".rss-count"))).toBe("4 feeds");
    // Nothing asked of the items.
    expect((await requests()).some((r) => r.path === "/rss/items")).toBe(false);
  });

  it("links a title to its site when there is one; the address is plain text", async () => {
    await stub("/rss/feeds", { feeds: many().slice(0, 4) });
    const list = (await page("/rss?view=feeds")).doc.querySelectorAll("li.rss-feed-row");

    expect(list[0].querySelector("a")).toBeNull();
    expect(list[2].querySelector("a.rss-feed-title")?.getAttribute("href")).toBe("https://inside.java");
    expect(list[2].querySelector(".rss-feed-url")?.tagName).toBe("SPAN");
    expect(list[3].querySelector("a.rss-feed-title")?.getAttribute("href")).toBe("https://zeta.example");
  });

  it("pages as the items do, twenty to a page", async () => {
    await stub("/rss/feeds", { feeds: many() });
    const first = (await page("/rss?view=feeds")).doc;

    expect(rows(first).length).toBe(20);
    expect(rows(first)[0]).toBe("Baeldung - https://feeds.feedblitz.com/baeldung");
    expect(first.querySelector("a.pagelink[rel=prev]")).toBeNull();
    expect(first.querySelector("a.pagelink[rel=next]")?.getAttribute("href")).toBe("/rss?view=feeds&page=1");
    expect(text(first.querySelector(".rss-count"))).toBe("25 feeds");

    const second = (await page("/rss?view=feeds&page=1")).doc;
    expect(rows(second)).toEqual([
      "Feed 19 - https://f19.example/rss",
      "Feed 20 - https://f20.example/rss",
      "https://example.org/rss",
      "inside java - https://inside.java/feed.xml",
      "zeta weekly - https://zeta.example/rss",
    ]);
    expect(second.querySelector("a.pagelink[rel=prev]")?.getAttribute("href")).toBe("/rss?view=feeds");
    expect(second.querySelector("a.pagelink[rel=next]")).toBeNull();
  });

  it("leads back to the items, by a link and by the filter form", async () => {
    const { doc } = await page("/rss?view=feeds");

    expect(text(doc.querySelector("a.rss-items-link"))).toBe("Back to Items");
    expect(doc.querySelector("a.rss-items-link")?.getAttribute("href")).toBe("/rss");
    expect(doc.querySelector("a.rss-feed-list-link")).toBeNull();
    const form = doc.querySelector("form.rss-filter")!;
    expect(form.getAttribute("action")).toBe("/rss");
    expect(form.querySelector("input[name=view]")).toBeNull();
  });

  it("refreshes as the items do, back to the same page of the list", async () => {
    const { doc } = await page("/rss?view=feeds&page=1");
    expect(doc.querySelector("a.rss-refresh")?.getAttribute("href")).toBe("/rss?view=feeds&page=1&refresh");

    const response = await fetch(`${inject("appUrl")}/rss?view=feeds&page=1&refresh`, { redirect: "manual" });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/rss?view=feeds&page=1");
  });

  it("is titled for browsers and link previews", async () => {
    expect(text((await page("/rss?view=feeds")).doc.querySelector("title"))).toBe("RSS Feed List | ByteCode.News");
  });
});
