import { beforeEach, describe, expect, inject, it } from "vitest";
import { page, text } from "../support/page.ts";
import { list, post, resetStubs, stub, stubSite } from "../support/stub.ts";

const app = (path: string) => fetch(`${inject("appUrl")}${path}`);

function detail(fields: Record<string, unknown> = {}) {
  return { id: "019f0000-0000-7000-8000-000000000001", title: "Midden", slug: "2026/09/midden", excerpt: "Reads heap dumps.",
    renderedHtml: "<p>x</p>", authorDisplayName: "dreamreal", publishedAt: "2026-09-21T15:00:00Z", tags: [], categories: [], ...fields };
}

async function png(response: Response) {
  const bytes = new Uint8Array(await response.arrayBuffer());
  const view = new DataView(bytes.buffer);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

beforeEach(async () => {
  await resetStubs();
  await stubSite();
  await stub("/posts", list([post()]), { query: { page: 0, size: 9 } });
  await stub("/posts/popular", list([]), { query: { page: 0, size: 3 } });
});

describe("a post's link-preview card", () => {
  it("is a 1200 by 630 PNG at /og/posts/{year}/{month}/{slug}.png, kept by caches for an hour", async () => {
    await stub("/posts/2026/09/midden", detail());
    const response = await app("/og/posts/2026/09/midden.png");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toContain("max-age=3600");
    expect(await png(response)).toEqual({ width: 1200, height: 630 });
  });

  it("isn't found for a post the API hasn't got, or an address that isn't a card's", async () => {
    expect((await app("/og/posts/2026/09/nothing.png")).status).toBe(404);
    expect((await app("/og/posts/2026/09/midden.jpg")).status).toBe(404);
    expect((await app("/og/posts/about.png")).status).toBe(404);
  });

  it("is unavailable while the API is down, when nothing was kept", async () => {
    await stub("/posts/2026/09/down", { detail: "down" }, { status: 503 });
    expect((await app("/og/posts/2026/09/down.png")).status).toBe(503);
  });
});

describe("the site's link-preview card", () => {
  it("is a 1200 by 630 PNG at /og/site.png", async () => {
    const response = await app("/og/site.png");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(await png(response)).toEqual({ width: 1200, height: 630 });
  });
});

describe("a page's link preview", () => {
  it("is the site's card, for a page without its own", async () => {
    const { doc } = await page("/");
    expect(doc.querySelector("meta[property='og:image']")?.getAttribute("content")).toMatch(/\/og\/site\.png$/);
    expect(doc.querySelector("meta[property='og:image:width']")?.getAttribute("content")).toBe("1200");
    expect(doc.querySelector("meta[property='og:image:height']")?.getAttribute("content")).toBe("630");
    expect(doc.querySelector("meta[name='twitter:image']")?.getAttribute("content")).toMatch(/\/og\/site\.png$/);
  });

  it("is the post's own card, for a post", async () => {
    await stub("/posts/2026/09/midden", detail());
    await stub("/posts/2026/09/midden/comments", { comments: [], totalActiveCount: 0 });
    const { doc } = await page("/posts/2026/09/midden");
    expect(doc.querySelector("meta[name='twitter:image']")?.getAttribute("content")).toMatch(/\/og\/posts\/2026\/09\/midden\.png$/);
    expect(doc.querySelector("meta[property='og:image:alt']")?.getAttribute("content")).toBe("Midden");
  });
});

describe("the link-preview gallery", () => {
  it("shows the site's card and the latest posts' as they'd be shared", async () => {
    await stub("/posts", list([post({ title: "Midden", slug: "2026/09/midden", excerpt: "Reads heap dumps." })]), { query: { page: 0, size: 5 } });
    const { status, doc } = await page("/og-preview");
    const cards = doc.querySelectorAll(".og-card");

    expect(status).toBe(200);
    expect(cards.map((c) => c.querySelector("img")?.getAttribute("src"))).toEqual(["/og/site.png", "/og/posts/2026/09/midden.png"]);
    expect(text(cards[1].querySelector(".og-card-title"))).toBe("Midden");
    expect(text(cards[1].querySelector(".og-card-url"))).toContain("/posts/2026/09/midden");
    // It's for the site's own people, not for search engines.
    expect(doc.querySelector("meta[name=robots]")?.getAttribute("content")).toContain("noindex");
  });
});
