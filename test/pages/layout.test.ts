import { beforeEach, describe, expect, it } from "vitest";
import { inject } from "vitest";
import { page, text } from "../support/page.ts";
import { list, post, requests, resetStubs, stub, stubSite } from "../support/stub.ts";

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

  it("names the site's icons, for tabs, home screens and installs", async () => {
    await stubSite();
    const head = (await page("/")).doc.querySelector("head")!;
    const icon = (selector: string) => head.querySelector(selector)?.getAttribute("href");

    expect(icon("link[rel=icon][sizes=any]")).toBe("/favicon.ico");
    expect(icon("link[rel=icon][sizes='32x32']")).toBe("/icon-32.png");
    expect(icon("link[rel=icon][sizes='16x16']")).toBe("/icon-16.png");
    expect(icon("link[rel=apple-touch-icon]")).toBe("/apple-touch-icon.png");
    expect(icon("link[rel=manifest]")).toBe("/site.webmanifest");
  });

  it("serves the icons it names, and the manifest's", async () => {
    for (const path of ["/favicon.ico", "/icon-32.png", "/icon-16.png", "/apple-touch-icon.png", "/android-chrome-192x192.png", "/android-chrome-512x512.png"]) {
      const response = await fetch(`${inject("appUrl")}${path}`);
      expect(response.status, path).toBe(200);
      expect(response.headers.get("content-type"), path).toMatch(/^image\//);
    }
    const manifest = await (await fetch(`${inject("appUrl")}/site.webmanifest`)).json();
    expect(manifest.icons.map((i: { src: string }) => i.src)).toEqual(["/android-chrome-192x192.png", "/android-chrome-512x512.png"]);
  });

  it("draws the theme toggle as a sun and a moon, for the stylesheet to choose between", async () => {
    await stubSite();
    const toggle = (await page("/")).doc.querySelector("header button[data-theme-toggle]")!;

    expect(toggle.getAttribute("aria-label")).toBe("Toggle theme");
    expect(toggle.querySelector("svg.icon-sun[aria-hidden=true]")).not.toBeNull();
    expect(toggle.querySelector("svg.icon-moon[aria-hidden=true]")).not.toBeNull();
  });

  it("asks the API nothing for a response it doesn't frame", async () => {
    await stubSite();
    await stub("/posts/019f0000-0000-7000-8000-000000000001/access", {}, { method: "POST", status: 204 });
    await fetch(`${inject("appUrl")}/read/019f0000-0000-7000-8000-000000000001`, { method: "POST" });
    await fetch(`${inject("appUrl")}/og/site.png`);

    expect((await requests()).map((r) => `${r.method} ${r.path}`)).toEqual(["POST /posts/019f0000-0000-7000-8000-000000000001/access"]);
  });
});
