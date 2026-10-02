import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { startStubApi } from "../support/stub-api.ts";

let stubApi: { url: string; close: () => Promise<void> };
let client: typeof import("../../src/api/client.ts");

async function stub(path: string, body: unknown, status = 200, headers: Record<string, string> = {}) {
  await fetch(`${stubApi.url}/__stub`, { method: "POST", body: JSON.stringify({ path, query: {}, answer: { body, status, headers } }) });
}
async function seen() {
  return (await fetch(`${stubApi.url}/__requests`)).json();
}

beforeAll(async () => {
  stubApi = await startStubApi();
  process.env.BCN_API_BASE = stubApi.url;
  delete process.env.BCN_ACCEPT_VERSION;
  client = await import("../../src/api/client.ts");
});
afterAll(() => stubApi.close());
beforeEach(async () => {
  vi.useRealTimers();
  await fetch(`${stubApi.url}/__reset`, { method: "POST" });
});

/** Moves the clock on [seconds], as far as the client's freshness is concerned. */
function later(seconds: number) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.now() + seconds * 1000);
}

describe("the API client", () => {
  it("asks for the API version it was built against", async () => {
    await stub("/features", { siteName: "x" });
    await client.cachedGet("/features");
    expect((await seen())[0].headers["accept-version"]).toBe("2026-03-10");
  });

  it("asks again with the answer's ETag, and keeps what it had when nothing changed", async () => {
    await stub("/posts/a", { title: "kept" });
    expect(await client.cachedGet("/posts/a")).toEqual({ title: "kept" });
    later(31);
    expect(await client.cachedGet("/posts/a")).toEqual({ title: "kept" });
    const [first, second] = await seen();
    expect(first.headers["if-none-match"]).toBeUndefined();
    expect(second.headers["if-none-match"]).toMatch(/^".+"$/);
  });

  it("takes a changed answer", async () => {
    await stub("/posts/b", { title: "old" });
    await client.cachedGet("/posts/b");
    await stub("/posts/b", { title: "new" });
    later(31);
    expect(await client.cachedGet("/posts/b")).toEqual({ title: "new" });
  });

  it("serves the last good answer while the API is down", async () => {
    await stub("/posts/c", { title: "good" });
    await client.cachedGet("/posts/c");
    await stub("/posts/c", { detail: "down" }, 503);
    later(31);
    expect(await client.cachedGet("/posts/c")).toEqual({ title: "good" });
  });

  it("says the API is unavailable when it's down and nothing was kept", async () => {
    await stub("/posts/d", { detail: "down" }, 503);
    await expect(client.cachedGet("/posts/d")).rejects.toBeInstanceOf(client.ApiUnavailable);
  });

  it("answers a 404 with nothing", async () => {
    expect(await client.cachedGet("/posts/missing")).toBeNull();
  });

  it("sends the query it's given, leaving out what's undefined", async () => {
    await stub("/posts", { posts: [] });
    await client.cachedGet("/posts", { page: 2, size: 9, tag: undefined });
    expect((await seen())[0].query).toEqual({ page: "2", size: "9" });
  });

  it("says so when the API answers in a version other than the one it expects", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await stub("/features", { siteName: "x" }, 200, { "Content-Version": "2027-01-01" });
    later(601);
    await client.cachedGet("/features");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("2027-01-01"));
    warn.mockRestore();
  });

  it("uses an answer as it is for a while, by what it is, before asking again", async () => {
    await stub("/posts", { posts: ["first"] });
    await client.cachedGet("/posts");
    await stub("/posts", { posts: ["second"] });
    later(10);
    expect(await client.cachedGet("/posts")).toEqual({ posts: ["first"] });
    later(6);
    expect(await client.cachedGet("/posts")).toEqual({ posts: ["second"] });
    expect((await seen()).length).toBe(2);
  });

  it("keeps what changes least the longest, as ui-pudl does", () => {
    expect(client.freshFor("/posts")).toBe(15_000);
    expect(client.freshFor("/posts/2026/10/a-post/comments")).toBe(15_000);
    expect(client.freshFor("/posts/2026/10/a-post")).toBe(30_000);
    expect(client.freshFor("/posts/search")).toBe(30_000);
    expect(client.freshFor("/logs/provenances")).toBe(30_000);
    expect(client.freshFor("/posts/popular")).toBe(60_000);
    expect(client.freshFor("/taxonomy")).toBe(60_000);
    expect(client.freshFor("/factoids/spring")).toBe(300_000);
    expect(client.freshFor("/karma/leaderboard")).toBe(300_000);
    expect(client.freshFor("/features")).toBe(600_000);
  });

  it("asks the API once for an answer wanted by several pages at the same time", async () => {
    await stub("/posts/e", { title: "shared" });
    const answers = await Promise.all([client.cachedGet("/posts/e"), client.cachedGet("/posts/e"), client.cachedGet("/posts/e")]);
    expect(answers).toEqual([{ title: "shared" }, { title: "shared" }, { title: "shared" }]);
    expect((await seen()).length).toBe(1);
  });

  it("asks again, straight away, after this app has changed something through the API", async () => {
    await stub("/posts/f/comments", { comments: [] });
    await client.cachedGet("/posts/f/comments");
    await stub("/posts/f/comments", { comments: ["mine"] });
    await client.send("POST", "/posts/f/comments", { body: "mine" });
    expect(await client.cachedGet("/posts/f/comments")).toEqual({ comments: ["mine"] });
  });

  it("keeps using what it had when the API says nothing changed, for another interval", async () => {
    await stub("/posts/g", { title: "same" });
    await client.cachedGet("/posts/g");
    later(31);
    await client.cachedGet("/posts/g");
    later(10);
    await client.cachedGet("/posts/g");
    expect((await seen()).length).toBe(2);
  });
});
