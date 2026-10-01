import { beforeEach, describe, expect, it } from "vitest";
import { inject } from "vitest";
import { requests, resetStubs, stub, stubRaw } from "../support/stub.ts";

const FEED = `<?xml version="1.0"?><rss version="2.0"><channel><title>ByteCode.News</title></channel></rss>`;
const feed = (headers: Record<string, string> = {}) => fetch(`${inject("appUrl")}/feed.xml`, { headers });

beforeEach(() => resetStubs());

describe("the site's feed", () => {
  it("is the API's, as it is, with its type", async () => {
    await stubRaw("/feed.xml", FEED, "application/rss+xml;charset=UTF-8");
    const response = await feed();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/rss+xml;charset=UTF-8");
    expect(await response.text()).toBe(FEED);
  });

  it("tells the API where the reader is, so its links point at this site", async () => {
    await stubRaw("/feed.xml", FEED, "application/rss+xml");
    await feed({ "X-Forwarded-Host": "bytecode.news", "X-Forwarded-Proto": "https" });
    const asked = (await requests()).find((r) => r.path === "/feed.xml")!;

    expect(asked.headers["x-forwarded-host"]).toBe("bytecode.news");
    expect(asked.headers["x-forwarded-proto"]).toBe("https");
  });

  it("is this server's own, when nothing in front of it says otherwise", async () => {
    await stubRaw("/feed.xml", FEED, "application/rss+xml");
    await feed();
    const asked = (await requests()).find((r) => r.path === "/feed.xml")!;

    expect(asked.headers["x-forwarded-host"]).toBe(new URL(inject("appUrl")).host);
    expect(asked.headers["x-forwarded-proto"]).toBe("http");
  });

  it("keeps serving the last good feed while the API is down", async () => {
    await stubRaw("/feed.xml", FEED, "application/rss+xml");
    await feed({ "X-Forwarded-Host": "kept.example" });
    await stub("/feed.xml", { detail: "down" }, { status: 503 });
    const response = await feed({ "X-Forwarded-Host": "kept.example" });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(FEED);
  });

  it("says it's unavailable when the API is down and there's no feed to fall back on", async () => {
    await stub("/feed.xml", { detail: "down" }, { status: 503 });
    const response = await feed({ "X-Forwarded-Host": "never.example" });
    expect(response.status).toBe(503);
  });
});
