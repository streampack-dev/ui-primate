import { beforeEach, describe, expect, it } from "vitest";
import { page, text } from "../support/page.ts";
import { list, post, resetStubs, stub, stubSite } from "../support/stub.ts";

beforeEach(async () => {
  await resetStubs();
  await stub("/posts", list([post()]), { query: { page: 0, size: 9 } });
  await stub("/posts/popular", list([]), { query: { page: 0, size: 3 } });
});

describe("every page's frame", () => {
  it("names the site as the API does, and links home, tags and search", async () => {
    await stubSite({ siteName: "Example.Org" });
    const { doc } = await page("/");
    const header = doc.querySelector("header")!;

    expect(text(header.querySelector("a[href='/'] .font-display"))).toBe("Example.Org");
    expect(header.querySelector("a[href='/tags']")).not.toBeNull();
    expect(header.querySelector("form[action='/search'] input[name=q]")).not.toBeNull();
  });

  it("lists the site's own pages, and the sections the API offers", async () => {
    await stubSite();
    const footer = (await page("/")).doc.querySelector("footer")!;
    const links = footer.querySelectorAll("nav a").map((a) => a.getAttribute("href"));

    expect(links).toEqual(expect.arrayContaining(["/factoids", "/rss", "/karma", "/logs", "/posts/about"]));
  });

  it("leaves out the sections the API doesn't offer", async () => {
    await stubSite({ operationGroups: ["blog"], adapters: [] });
    const links = (await page("/")).doc.querySelectorAll("footer nav a").map((a) => a.getAttribute("href"));

    expect(links).not.toContain("/factoids");
    expect(links).not.toContain("/rss");
  });

  it("gives the backend's version and its own", async () => {
    await stubSite();
    const footer = text((await page("/")).doc.querySelector("footer"));

    expect(footer).toContain("Backend v1.5.0");
    expect(footer).toMatch(/Frontend v\d+\.\d+\.\d+/);
  });

  it("still frames the page when the API can't say what the site offers", async () => {
    await stub("/posts", list([]), { query: { category: "_sidebar" } });
    // No /features stub: the API answers 404 for it.
    const { status, doc } = await page("/");

    expect(status).toBe(200);
    expect(text(doc.querySelector("footer"))).toContain("Backend unknown");
  });
});
