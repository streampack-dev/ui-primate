import { beforeEach, describe, expect, it } from "vitest";
import { page, text } from "../support/page.ts";
import { requests, resetStubs, stub, stubSite } from "../support/stub.ts";

function summary(fields: Record<string, unknown> = {}) {
  return { selector: "spring", locked: false, updatedBy: "ada", updatedAt: "2026-10-01T02:30:00Z", lastAccessedAt: null, accessCount: 12, text: "a framework for the JVM", tags: ["jvm"], ...fields };
}

function detail(attributes: unknown[], fields: Record<string, unknown> = {}) {
  return { selector: "spring", locked: false, updatedBy: "ada", updatedAt: "2026-10-01T02:30:00Z", lastAccessedAt: null, accessCount: 42, attributes, ...fields };
}

const list = (factoids: unknown[], pageNo = 0, totalPages = 1, totalCount = factoids.length) => ({ factoids, page: pageNo, totalPages, totalCount });
const asked = async () => (await requests()).filter((r) => r.path === "/factoids").at(-1)!;

beforeEach(async () => {
  await resetStubs();
  await stubSite();
});

describe("the knowledge base", () => {
  it("lists the factoids, each a way to its page, with its hits, text, tags, who changed it and when", async () => {
    await stub("/factoids", list([summary(), summary({ selector: "kotlin", locked: true, updatedBy: null, tags: [] })]), { query: { page: 0, size: 20 } });
    const { status, doc } = await page("/factoids");
    const [spring, kotlin] = doc.querySelectorAll("article.factoid");

    expect(status).toBe(200);
    expect(text(doc.querySelector("main h1"))).toBe("Knowledge Base");
    expect(text(doc.querySelector(".factoid-count"))).toBe("2 entries");
    expect(spring.querySelector("h2 a")?.getAttribute("href")).toBe("/factoids/spring");
    expect(text(spring)).toContain("12 hits");
    expect(text(spring)).toContain("a framework for the JVM");
    expect(spring.querySelector(".tags a")?.getAttribute("href")).toBe("/tags/jvm");
    expect(text(spring)).toContain("ada");
    expect(text(spring.querySelector("time"))).toBe("October 1, 2026");
    expect(text(kotlin)).toContain("Locked");
  });

  it("searches with a form that works without script, keeping the words and the page on the way back", async () => {
    await stub("/factoids", list([summary()], 1, 3, 41), { query: { q: "spr", page: 1 } });
    const { doc } = await page("/factoids?q=+spr+&page=1");

    expect(await asked().then((r) => r.query)).toEqual({ q: "spr", page: "1", size: "20" });
    expect(doc.querySelector("main form[action='/factoids'] input[name=q]")?.getAttribute("value")).toBe("spr");
    expect(text(doc.querySelector(".factoid-count"))).toBe("41 entries matching “spr”");
    expect(doc.querySelector("article.factoid h2 a")?.getAttribute("href")).toBe("/factoids/spring?q=spr&page=1");
    expect(doc.querySelector("a.pagelink[rel=prev]")?.getAttribute("href")).toBe("/factoids?q=spr");
    expect(doc.querySelector("a.pagelink[rel=next]")?.getAttribute("href")).toBe("/factoids?q=spr&page=2");
  });

  it("says when nothing's found, and why", async () => {
    await stub("/factoids", list([]), { query: { q: "nothing" } });
    expect(text((await page("/factoids?q=nothing")).doc.querySelector("main"))).toContain("Try a different search term.");
    await stub("/factoids", list([]), { query: { page: 0, size: 20 } });
    expect(text((await page("/factoids")).doc.querySelector("main"))).toContain("The knowledge base is empty.");
  });

  it("says it's unavailable when the API is down and nothing was kept", async () => {
    await stub("/factoids", { detail: "down" }, { query: { q: "never-asked" }, status: 503 });
    const { status, doc } = await page("/factoids?q=never-asked");
    expect(status).toBe(503);
    expect(text(doc.querySelector("main"))).toContain("Knowledge Base Unavailable");
  });

  it("is titled for browsers and link previews", async () => {
    await stub("/factoids", list([]), { query: { page: 0, size: 20 } });
    expect(text((await page("/factoids")).doc.querySelector("title"))).toBe("Knowledge Base | ByteCode.News");
  });
});

describe("a factoid", () => {
  it("shows who changed it, when, how often it's been looked up, and that it's locked", async () => {
    await stub("/factoids/spring", detail([], { locked: true }));
    const { status, doc } = await page("/factoids/spring");
    const byline = text(doc.querySelector("article .byline"));

    expect(status).toBe(200);
    expect(text(doc.querySelector("main h1"))).toBe("spring");
    expect(byline).toContain("By ada");
    expect(byline).toContain("October 1, 2026");
    expect(byline).toContain("42 lookups");
    expect(byline).toContain("Locked");
  });

  it("shows its attributes as the bot says them: text as 'x is y', a reply as itself, each kind once", async () => {
    await stub("/factoids/spring", detail([
      { type: "text", value: "a framework for the JVM", rendered: "a framework for the JVM" },
      { type: "TEXT", value: "a duplicate, not shown", rendered: "" },
      { type: "tags", value: "jvm, java", rendered: "" },
    ]));
    await stub("/factoids/hello", detail([{ type: "text", value: "<reply> Hi there!", rendered: "" }], { selector: "hello" }));
    const spring = (await page("/factoids/spring")).doc;
    const entries = Object.fromEntries(spring.querySelectorAll("dl.factoid-attributes > div").map((d) => [text(d.querySelector("dt")), text(d.querySelector("dd"))]));

    expect(entries).toEqual({ Text: "spring is a framework for the JVM", Tags: "jvm, java" });
    expect(text((await page("/factoids/hello")).doc.querySelector("dd"))).toBe("Hi there!");
  });

  it("links its see-also to other factoids, and its addresses out, but only http and https ones", async () => {
    await stub("/factoids/spring", detail([
      { type: "seealso", value: "boot, spring framework", rendered: "" },
      { type: "urls", value: "https://spring.io, javascript:alert(1), not a url", rendered: "" },
    ]));
    const { doc } = await page("/factoids/spring");
    const seeAlso = doc.querySelectorAll("dd.factoid-seealso a");
    const urls = doc.querySelector("dd.factoid-urls")!;

    expect(seeAlso.map((a) => a.getAttribute("href"))).toEqual(["/factoids/boot", "/factoids/spring%20framework"]);
    expect(urls.querySelectorAll("a").map((a) => a.getAttribute("href"))).toEqual(["https://spring.io/"]);
    expect(urls.querySelector("a")?.getAttribute("rel")).toContain("noopener");
    expect(text(urls)).toBe("https://spring.io, javascript:alert(1), not a url");
  });

  it("shows its text as text, never markup", async () => {
    await stub("/factoids/spring", detail([{ type: "text", value: "<b>bold</b> claim", rendered: "<b>bold</b> claim" }]));
    const { doc } = await page("/factoids/spring");
    expect(doc.querySelector("dl b")).toBeNull();
    expect(text(doc.querySelector("dd"))).toBe("spring is <b>bold</b> claim");
  });

  it("isn't found, saying how to make it, when the API hasn't got it", async () => {
    const { status, doc } = await page("/factoids/no%20such%20thing");
    expect(status).toBe(404);
    expect(text(doc.querySelector("main h1"))).toBe("Factoid not found");
    expect(text(doc.querySelector("main"))).toContain("!no such thing is <value>");
  });

  it("says it's unavailable when the API is down", async () => {
    await stub("/factoids/down", { detail: "down" }, { status: 503 });
    const { status, doc } = await page("/factoids/down");
    expect(status).toBe(503);
    expect(text(doc.querySelector("main"))).toContain("Factoid Unavailable");
  });

  it("goes back to the knowledge base where it was left, and is titled for the factoid", async () => {
    await stub("/factoids/spring", detail([]));
    const { doc } = await page("/factoids/spring?q=spr&page=2");
    expect(doc.querySelector("main a.factoid-back")?.getAttribute("href")).toBe("/factoids?q=spr&page=2");
    expect(text(doc.querySelector("title"))).toBe("spring | ByteCode.News");
  });

  it("is reached from a [[factoid]] link in a post, as the API renders it", async () => {
    await stub("/factoids/spring%20boot", detail([], { selector: "spring boot" }));
    await stub("/factoids/spring boot", detail([], { selector: "spring boot" }));
    const { status, doc } = await page("/factoids/spring%20boot");
    expect(status).toBe(200);
    expect(text(doc.querySelector("main h1"))).toBe("spring boot");
  });
});
