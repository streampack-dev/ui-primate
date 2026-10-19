import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { expectAccessible, open, useBrowser } from "../support/browser.ts";
import { ADMIN, signedIn } from "../support/readers.ts";
import { resetStubs, stub, stubSite } from "../support/stub.ts";

/* Mermaid diagrams in a post (#61): drawn by the API (streampack#252), coloured here by the
   site's tokens and set in the fonts the API measured them in. The fixture is the API's own
   rendering of a drawn diagram and a refused one. */
useBrowser();

const ID = "019f0000-0000-7000-8000-0000000000d1";
const published = readFileSync("test/fixtures/mermaid/published.html", "utf8").trim();
// The drawn diagram's source, as the fixture was rendered from
const diagram = "flowchart LR\n  accTitle: How a post ships\n  A[Write] --> B{Reviewed?}\n  B -->|yes| C[Publish]\n  B -->|no| A";
const DRAFT = "019f0000-0000-7000-8000-0000000d0002";

beforeEach(async () => {
  await resetStubs();
  await stubSite();
  await stub("/posts/2026/10/diagrams", {
    id: ID, title: "Diagrams", slug: "2026/10/diagrams", excerpt: "Diagrams.", renderedHtml: published,
    authorDisplayName: "dreamreal", publishedAt: "2026-10-18T12:00:00Z", tags: [], categories: [],
  });
  await stub("/posts/2026/10/diagrams/comments", { totalActiveCount: 0, comments: [] });
  await stub(`/posts/${ID}/access`, {}, { status: 204 });
  await stub(`/posts/${DRAFT}`, {
    id: DRAFT, title: "Draft", slug: "2026/10/draft", markdownSource: "Draft.", excerpt: "Draft.",
    status: "DRAFT", publishedAt: null, sortOrder: 0, tags: [], categories: [],
  });
  await stub("/categories", []);
});

/* Pele's own words, in its bundle and nowhere else */
const PELE = "unsupported-diagram";
async function scriptsLoaded(page: import("playwright").Page) {
  const urls = await page.evaluate(() => performance.getEntriesByType("resource").map((e) => e.name).filter((n) => n.endsWith(".js")));
  return Promise.all(urls.map(async (u) => (await fetch(u)).text()));
}

async function preview(markdown: string) {
  const v = await signedIn(ADMIN);
  const opened = await open(`/edit/${DRAFT}`, "light", v.cookies);
  await opened.page.fill("#edit-body", markdown);
  return opened;
}

describe("the fixture", () => {
  // It's the API's rendered HTML and nothing else: once it began with the server's log lines,
  // captured with it, and the stubbed post showed them as text.
  it("is the API's HTML, without anything captured around it", () => {
    expect(published.startsWith("<p>A diagram:</p>")).toBe(true);
    expect(published).not.toMatch(/^\d\d:\d\d:\d\d/m);
  });
});

describe("a post's diagrams, in a browser", () => {
  for (const theme of ["light", "dark"] as const) {
    it(`take the site's colours and the fonts they were measured in, in the ${theme} theme`, async () => {
      const { page, errors } = await open("/posts/2026/10/diagrams", theme);
      await page.waitForSelector(".post-body figure.mermaid > svg");
      await page.evaluate(() => document.fonts.ready);

      const seen = await page.evaluate(() => {
        const svg = document.querySelector(".post-body figure.mermaid > svg")!;
        const probe = document.createElement("span");
        probe.style.color = "var(--foreground)";
        probe.style.backgroundColor = "var(--background)";
        svg.closest("figure")!.appendChild(probe);
        const site = getComputedStyle(probe);
        const result = {
          text: getComputedStyle(svg).color, siteText: site.color,
          font: getComputedStyle(svg).fontFamily,
          plex: document.fonts.check('16px "IBM Plex Sans"'),
          summary: document.querySelector(".post-body figure.mermaid > details > summary")!.textContent,
          refused: document.querySelector(".post-body figure.mermaid-refused figcaption")!.textContent,
        };
        probe.remove();
        return result;
      });
      expect(seen.text).toBe(seen.siteText);
      expect(seen.font.startsWith('"IBM Plex Sans"')).toBe(true);
      expect(seen.plex).toBe(true);
      expect(seen.summary).toBe("Diagram source");
      expect(seen.refused).toMatch(/^This diagram wasn't drawn: Parse error on line 3/);
      await expectAccessible(page);
      expect(errors).toEqual([]);
    });
  }

  it("fetches IBM's Plex Sans for them, from the site", async () => {
    const { page } = await open("/posts/2026/10/diagrams");
    await page.waitForSelector(".post-body figure.mermaid > svg");
    await page.evaluate(() => document.fonts.ready);
    const fetched = await page.evaluate(() => performance.getEntriesByType("resource").map((e) => e.name).filter((n) => n.includes("/diagram-fonts/")));
    expect(fetched.some((url) => url.endsWith("/diagram-fonts/IBMPlexSans-Regular.woff2"))).toBe(true);
  });

  it("doesn't load Pele on a post: its diagrams come drawn", async () => {
    const { page } = await open("/posts/2026/10/diagrams");
    await page.waitForSelector(".post-body figure.mermaid > svg");
    await page.waitForLoadState("networkidle");
    expect((await scriptsLoaded(page)).some((b) => b.includes(PELE))).toBe(false);
  });
});

describe("the editor's preview of a diagram, in a browser", () => {
  it("draws it as the API does, with the same widths", async () => {
    const { page, errors } = await preview(`A diagram:\n\n\`\`\`mermaid\n${diagram}\n\`\`\`\n`);
    const svg = ".editor-preview figure.mermaid > svg";
    await page.waitForSelector(svg);

    expect(await page.locator(`${svg} title`).textContent()).toBe("How a post ships");
    expect(await page.locator(".editor-preview figure.mermaid > details pre > code").textContent()).toBe(`${diagram}\n`);
    // Measured by the browser in IBM Plex, as the API measures with Java 2D
    const server = Number(/viewBox="0 0 ([\d.]+) /.exec(published)![1]);
    const width = await page.locator(svg).evaluate((s) => (s as SVGSVGElement).viewBox.baseVal.width);
    expect(Math.abs(width - server)).toBeLessThanOrEqual(2);
    const html = await page.locator(svg).evaluate((s) => s.outerHTML);
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("<image");
    // Pele was loaded to draw it, which is what the tests of pages without one look for
    expect((await scriptsLoaded(page)).some((b) => b.includes(PELE))).toBe(true);
    expect(errors).toEqual([]);
  });

  it("names an untitled diagram by its kind", async () => {
    const { page } = await preview("```mermaid\nsequenceDiagram\n  Alice->>Bob: Hello\n```\n");
    const svg = ".editor-preview figure.mermaid > svg";
    await page.waitForSelector(svg);
    expect(await page.locator(svg).getAttribute("aria-label")).toBe("Diagram (sequence)");
  });

  it("shows a diagram that won't parse with its source and why, as the published post will", async () => {
    const { page } = await preview("```mermaid\nflowchart LR\n  A -->\n```\n");
    await page.waitForSelector(".editor-preview figure.mermaid-refused figcaption");
    expect(await page.locator(".editor-preview figure.mermaid-refused figcaption").textContent())
      .toBe("This diagram wasn't drawn: Parse error on line 3: Expecting 'NODE_STRING', got 'EOF'");
    expect(await page.locator(".editor-preview figure.mermaid-refused pre > code").textContent()).toBe("flowchart LR\n  A -->\n");
  });

  it("loads Pele only once a preview has a diagram", async () => {
    const { page } = await preview("No diagram, just _words_.");
    await page.waitForSelector(".editor-preview em");
    await page.waitForLoadState("networkidle");
    expect((await scriptsLoaded(page)).some((b) => b.includes(PELE))).toBe(false);
  });
});
