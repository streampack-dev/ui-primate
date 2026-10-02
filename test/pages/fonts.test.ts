import { beforeEach, describe, expect, inject, it } from "vitest";
import { page } from "../support/page.ts";
import { resetStubs, stub, stubSite } from "../support/stub.ts";

const get = (path: string) => fetch(`${inject("appUrl")}${path}`);

beforeEach(async () => {
  await resetStubs();
  await stubSite();
  await stub("/posts", { posts: [], page: 0, totalPages: 0, totalCount: 0 });
});

/* The fonts are the site's own (tools/fonts.mjs): nothing on a page waits on another server, and
   the faces every page uses are preloaded. */
describe("the fonts", () => {
  it("come from the site itself, never from Google", async () => {
    const { html } = await page("/");
    expect(html).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
  });

  it("preload the four faces every page uses, each kept for good under its fingerprint", async () => {
    const { doc } = await page("/");
    const preloads = doc.querySelectorAll("link[rel=preload][as=font]");
    const names = preloads.map((l) => l.getAttribute("href")!.replace(/-[A-Z0-9]{8}\.woff2$/, ""));

    expect(names.sort()).toEqual(["/ibm-plex-mono-400-latin", "/ibm-plex-mono-500-latin", "/instrument-serif-400-latin", "/source-serif-4-latin"]);
    for (const link of preloads) {
      // Without crossorigin, a preloaded font is fetched twice.
      expect(link.hasAttribute("crossorigin")).toBe(true);
      expect(link.getAttribute("type")).toBe("font/woff2");
      const response = await get(link.getAttribute("href")!);
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    }
  });

  it("have the rest of their scripts and weights on hand, unpreloaded, for a page that needs them", async () => {
    const { html, doc } = await page("/");
    const preloaded = new Set(doc.querySelectorAll("link[rel=preload][as=font]").map((l) => l.getAttribute("href")));
    const onDemand = [...html.matchAll(/url\("(\/fonts\/[^"]+\.woff2)"\)/g)].map((m) => m[1]);

    expect(onDemand.length).toBeGreaterThan(10);
    for (const url of onDemand) {
      expect(preloaded.has(url)).toBe(false);
      const response = await get(url);
      expect(response.status, url).toBe(200);
      expect(response.headers.get("cache-control"), url).toBe("public, max-age=31536000, immutable");
    }
  });

  it("carry their licences", async () => {
    for (const family of ["ibm-plex-mono", "instrument-serif", "source-serif-4"]) {
      const response = await get(`/fonts/${family}-OFL.txt`);
      expect(response.status).toBe(200);
      expect(await response.text()).toContain("SIL OPEN FONT LICENSE");
    }
  });
});
