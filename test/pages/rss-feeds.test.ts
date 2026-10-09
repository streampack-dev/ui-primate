import { beforeEach, describe, expect, it } from "vitest";
import { page, text } from "../support/page.ts";
import { resetStubs, stub, stubSite } from "../support/stub.ts";

// Out of order, one untitled, one without a site, one never fetched an item.
const FEEDS = [
  { title: "Spring Blog", feedUrl: "https://spring.io/blog.atom", siteUrl: "https://spring.io/blog", itemCount: 40, latestItemTimestamp: "2026-10-08T23:30:00Z" },
  { title: "", feedUrl: "https://example.org/rss", siteUrl: null, itemCount: 1, latestItemTimestamp: "2026-09-01T00:00:00Z" },
  { title: "inside java", feedUrl: "https://inside.java/feed.xml", siteUrl: "https://inside.java", itemCount: 12, latestItemTimestamp: "2026-10-01T02:00:00Z" },
  { title: "Baeldung", feedUrl: "https://feeds.feedblitz.com/baeldung", siteUrl: null, itemCount: 0, latestItemTimestamp: null },
];

beforeEach(async () => {
  await resetStubs();
  await stubSite();
  await stub("/rss/feeds", { feeds: FEEDS });
  await stub("/rss/items", { items: [], page: 0, totalPages: 0, totalCount: 0 }, { query: { page: 0, size: 20 } });
});

const rows = (doc: Awaited<ReturnType<typeof page>>["doc"]) => doc.querySelectorAll("li.feed-row");

describe("the list of every feed (#28)", () => {
  it("is linked, modestly, from the RSS reader's landing page", async () => {
    const { doc } = await page("/rss");
    const link = doc.querySelector("a.rss-all-feeds")!;

    expect(text(link)).toBe("All Feeds");
    expect(link.getAttribute("href")).toBe("/rss/feeds");
    // Only a link: the reader shows no feed list of its own.
    expect(doc.querySelector("li.feed-row")).toBeNull();
  });

  it("lists every feed by title, whatever its case, an untitled one by its address", async () => {
    const { status, doc } = await page("/rss/feeds");

    expect(status).toBe(200);
    expect(rows(doc).map((r) => text(r.querySelector(".feed-title")))).toEqual(["Baeldung", "https://example.org/rss", "inside java", "Spring Blog"]);
    expect(text(doc.querySelector(".feeds-count"))).toBe("4 feeds");
  });

  it("links a title to its site when there is one, and doesn't when there isn't", async () => {
    const { doc } = await page("/rss/feeds");
    const [baeldung, untitled, inside, spring] = rows(doc);

    expect(inside.querySelector(".feed-title a")?.getAttribute("href")).toBe("https://inside.java");
    expect(spring.querySelector(".feed-title a")?.getAttribute("href")).toBe("https://spring.io/blog");
    expect(baeldung.querySelector(".feed-title a")).toBeNull();
    expect(untitled.querySelector(".feed-title a")).toBeNull();
  });

  it("gives each feed's address, its item count, its latest item's day, and the IRC command, as text", async () => {
    const { doc } = await page("/rss/feeds");
    const [baeldung, untitled, inside] = rows(doc);

    expect(text(inside.querySelector(".feed-url"))).toBe("https://inside.java/feed.xml");
    expect(text(inside.querySelector(".feed-items"))).toBe("12 items");
    expect(text(inside.querySelector("time.feed-latest"))).toBe("Oct 1, 2026");
    expect(inside.querySelector("time.feed-latest")?.getAttribute("datetime")).toBe("2026-10-01T02:00:00Z");
    expect(text(inside.querySelector(".feed-command"))).toBe("feed subscribe https://inside.java/feed.xml");
    expect(text(untitled.querySelector(".feed-items"))).toBe("1 item");
    expect(text(baeldung.querySelector(".feed-items"))).toBe("0 items");
    expect(baeldung.querySelector("time.feed-latest")).toBeNull();
  });

  it("offers Copy only to script, which shows it: without it the command is plain text", async () => {
    const { doc } = await page("/rss/feeds");
    const button = rows(doc)[2].querySelector("button.feed-copy")!;

    expect(button.hasAttribute("hidden")).toBe(true);
    expect(button.getAttribute("type")).toBe("button");
    expect(button.getAttribute("data-copy")).toBe("feed subscribe https://inside.java/feed.xml");
    expect(text(button)).toBe("Copy the command for inside java");
    expect(rows(doc)[2].querySelector(".feed-copied")?.getAttribute("role")).toBe("status");
  });

  it("filters over title and address with a labelled GET form that works without script", async () => {
    const { doc } = await page("/rss/feeds?q=JAVA");
    const form = doc.querySelector("form.feeds-filter")!;

    expect(form.getAttribute("action")).toBe("/rss/feeds");
    expect(form.getAttribute("method")).toBe("get");
    expect(text(form.querySelector("label"))).toContain("Feed title or address contains");
    expect(form.querySelector("label input[name=q]")?.getAttribute("value")).toBe("JAVA");
    expect(rows(doc).map((r) => text(r.querySelector(".feed-title")))).toEqual(["inside java"]);
    expect(text(doc.querySelector(".feeds-count"))).toBe("1 of 4 feeds");
    expect(doc.querySelector("a.feeds-clear")?.getAttribute("href")).toBe("/rss/feeds");

    // By address too.
    const byAddress = (await page("/rss/feeds?q=feedblitz")).doc;
    expect(rows(byAddress).map((r) => text(r.querySelector(".feed-title")))).toEqual(["Baeldung"]);
  });

  it("says when nothing matched", async () => {
    const { doc } = await page("/rss/feeds?q=cobol");

    expect(rows(doc).length).toBe(0);
    expect(text(doc.querySelector("main"))).toContain("No feeds matched this filter.");
    expect(text(doc.querySelector(".feeds-count"))).toBe("0 of 4 feeds");
  });

  it("is titled for browsers and link previews", async () => {
    const { doc } = await page("/rss/feeds");
    expect(text(doc.querySelector("title"))).toBe("All RSS Feeds | ByteCode.News");
  });
});
