import { beforeEach, describe, expect, inject, it } from "vitest";
import { requests, resetStubs, stub, stubRaw } from "../support/stub.ts";

const SITEMAP = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://bytecode.news/posts/2026/09/midden</loc></url></urlset>`;
const FEED = `<?xml version="1.0"?><rss version="2.0"><channel><title>ByteCode.News</title></channel></rss>`;
const get = (path: string, headers: Record<string, string> = {}) => fetch(`${inject("appUrl")}${path}`, { headers });

beforeEach(() => resetStubs());

describe("the sitemap", () => {
  it("is the API's, as it is, with its type, on the canonical host", async () => {
    await stubRaw("/sitemap.xml", SITEMAP, "application/xml;charset=UTF-8");
    const response = await get("/sitemap.xml", { "X-Forwarded-Host": "bytecode.news", "X-Forwarded-Proto": "https" });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/xml;charset=UTF-8");
    expect(await response.text()).toBe(SITEMAP);
  });

  it("tells the API where the reader is, so its addresses are this site's", async () => {
    await stubRaw("/sitemap.xml", SITEMAP, "application/xml");
    await get("/sitemap.xml", { "X-Forwarded-Host": "bytecode.news", "X-Forwarded-Proto": "https", "X-Forwarded-Port": "443" });
    const asked = (await requests()).find((r) => r.path === "/sitemap.xml")!;

    expect(asked.headers["x-forwarded-host"]).toBe("bytecode.news");
    expect(asked.headers["x-forwarded-proto"]).toBe("https");
    expect(asked.headers["x-forwarded-port"]).toBe("443");
  });

  it("is this server's own, when nothing in front of it says otherwise", async () => {
    await stubRaw("/sitemap.xml", SITEMAP, "application/xml");
    await get("/sitemap.xml");
    const asked = (await requests()).find((r) => r.path === "/sitemap.xml")!;

    expect(asked.headers["x-forwarded-host"]).toBe(new URL(inject("appUrl")).host);
    expect(asked.headers["x-forwarded-proto"]).toBe("http");
  });

  it("keeps serving the last good sitemap while the API is down", async () => {
    await stubRaw("/sitemap.xml", SITEMAP, "application/xml");
    await get("/sitemap.xml", { "X-Forwarded-Host": "kept-sitemap.example", "X-Forwarded-Proto": "https" });
    await stub("/sitemap.xml", { detail: "down" }, { status: 503 });
    const response = await get("/sitemap.xml", { "X-Forwarded-Host": "kept-sitemap.example", "X-Forwarded-Proto": "https" });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(SITEMAP.replace("https://bytecode.news", "https://kept-sitemap.example"));
  });

  it("says it's unavailable when the API is down and there's none to fall back on", async () => {
    await stub("/sitemap.xml", { detail: "down" }, { status: 503 });
    expect((await get("/sitemap.xml", { "X-Forwarded-Host": "never-sitemap.example" })).status).toBe(503);
  });

  it("never falls back on the feed kept for the same site", async () => {
    await stubRaw("/feed.xml", FEED, "application/rss+xml");
    await get("/feed.xml", { "X-Forwarded-Host": "both.example" });
    await stub("/sitemap.xml", { detail: "down" }, { status: 503 });
    const response = await get("/sitemap.xml", { "X-Forwarded-Host": "both.example" });

    expect(response.status).toBe(503);
  });
});

describe("the feed and the sitemap, on a host of their own", () => {
  // As the API builds them: every link on the canonical host (SITE_URL, https://bytecode.news here).
  const CANONICAL_SITEMAP = `<urlset><url><loc>https://bytecode.news</loc></url><url><loc>https://bytecode.news/posts/2026/09/midden</loc></url><url><loc>https://bytecode.newsletter.example/x</loc></url></urlset>`;
  const CANONICAL_FEED = `<rss><channel><link>https://bytecode.news</link><item><link>https://bytecode.news/posts/2026/09/midden</link><description>&lt;a href="https://bytecode.news/tags/jvm"&gt;jvm&lt;/a&gt;</description></item></channel></rss>`;

  it("link to the host the reader asked, not the canonical one, as ui-pudl's do", async () => {
    await stubRaw("/sitemap.xml", CANONICAL_SITEMAP, "application/xml");
    await stubRaw("/feed.xml", CANONICAL_FEED, "application/rss+xml");
    const headers = { "X-Forwarded-Host": "primate.example", "X-Forwarded-Proto": "https" };
    const sitemap = await (await get("/sitemap.xml", headers)).text();
    const feed = await (await get("/feed.xml", headers)).text();

    expect(sitemap).toContain("<loc>https://primate.example</loc>");
    expect(sitemap).toContain("<loc>https://primate.example/posts/2026/09/midden</loc>");
    expect(feed).toContain("<link>https://primate.example</link>");
    expect(feed).toContain("https://primate.example/tags/jvm");
    expect(feed).not.toContain("https://bytecode.news");
  });

  it("leave a host that only starts like the canonical one alone", async () => {
    await stubRaw("/sitemap.xml", CANONICAL_SITEMAP, "application/xml");
    const sitemap = await (await get("/sitemap.xml", { "X-Forwarded-Host": "lookalike.example", "X-Forwarded-Proto": "https" })).text();
    expect(sitemap).toContain("https://bytecode.newsletter.example/x");
  });

  it("keep a port that isn't the scheme's own", async () => {
    await stubRaw("/sitemap.xml", CANONICAL_SITEMAP, "application/xml");
    const sitemap = await (await get("/sitemap.xml", { "X-Forwarded-Host": "localhost", "X-Forwarded-Proto": "http", "X-Forwarded-Port": "3000" })).text();
    expect(sitemap).toContain("<loc>http://localhost:3000/posts/2026/09/midden</loc>");
  });

  it("are left as they are on the canonical host itself", async () => {
    await stubRaw("/sitemap.xml", CANONICAL_SITEMAP, "application/xml");
    const sitemap = await (await get("/sitemap.xml", { "X-Forwarded-Host": "bytecode.news", "X-Forwarded-Proto": "https" })).text();
    expect(sitemap).toBe(CANONICAL_SITEMAP);
  });

  it("include the Atom feed, as ui-pudl serves it", async () => {
    await stubRaw("/feed.atom", `<feed xmlns="http://www.w3.org/2005/Atom"><link href="https://bytecode.news/"/></feed>`, "application/atom+xml");
    const response = await get("/feed.atom", { "X-Forwarded-Host": "primate.example", "X-Forwarded-Proto": "https" });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/atom+xml");
    expect(await response.text()).toContain('href="https://primate.example/"');
  });
});
