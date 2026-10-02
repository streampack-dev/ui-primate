import { beforeEach, describe, expect, inject, it } from "vitest";
import { requests, resetStubs, stub, stubRaw } from "../support/stub.ts";

const SITEMAP = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://bytecode.news/posts/2026/09/midden</loc></url></urlset>`;
const FEED = `<?xml version="1.0"?><rss version="2.0"><channel><title>ByteCode.News</title></channel></rss>`;
const get = (path: string, headers: Record<string, string> = {}) => fetch(`${inject("appUrl")}${path}`, { headers });

beforeEach(() => resetStubs());

describe("the sitemap", () => {
  it("is the API's, as it is, with its type", async () => {
    await stubRaw("/sitemap.xml", SITEMAP, "application/xml;charset=UTF-8");
    const response = await get("/sitemap.xml");

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
    await get("/sitemap.xml", { "X-Forwarded-Host": "kept-sitemap.example" });
    await stub("/sitemap.xml", { detail: "down" }, { status: 503 });
    const response = await get("/sitemap.xml", { "X-Forwarded-Host": "kept-sitemap.example" });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(SITEMAP);
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
