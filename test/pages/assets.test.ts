import { beforeEach, describe, expect, inject, it } from "vitest";
import { page } from "../support/page.ts";
import { resetStubs, stub, stubSite } from "../support/stub.ts";

const cacheControl = async (path: string) => (await fetch(`${inject("appUrl")}${path}`)).headers.get("cache-control");

beforeEach(async () => {
  await resetStubs();
  await stubSite();
  await stub("/posts", { posts: [], page: 0, totalPages: 0, totalCount: 0 });
});

describe("the files a page loads", () => {
  it("are kept for good when their names carry what's in them, as every bundle's does", async () => {
    const { doc } = await page("/");
    const bundles = [
      ...doc.querySelectorAll("script[src]").map((s) => s.getAttribute("src")!),
      ...doc.querySelectorAll("link[rel=stylesheet]").map((l) => l.getAttribute("href")!),
    ].filter((src) => src.startsWith("/"));

    expect(bundles.length).toBeGreaterThan(0);
    for (const bundle of bundles) expect(await cacheControl(bundle), bundle).toBe("public, max-age=31536000, immutable");
  });

  it("are kept a day when their names don't change, as the icons' don't", async () => {
    expect(await cacheControl("/favicon.ico")).toBe("public, max-age=86400");
    expect(await cacheControl("/site.webmanifest")).toBe("public, max-age=86400");
  });

  it("leave the page itself as it was, and never keep one that isn't there", async () => {
    expect(await cacheControl("/")).toBeNull();
    expect((await cacheControl("/no-such-bundle-ABCDEFGH.js")) ?? "").not.toContain("immutable");
  });
});
