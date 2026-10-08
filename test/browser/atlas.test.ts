import { readFileSync } from "node:fs";
import type { Page } from "playwright";
import { beforeEach, describe, expect, it } from "vitest";
import { atlas, stubAtlas } from "../support/atlas.ts";
import { expectAccessible, open, useBrowser } from "../support/browser.ts";
import { resetStubs, stubSite } from "../support/stub.ts";

/* The Atlas in a browser: zoom, pan and find (client/atlas.ts), region names that never overlap,
   shapes told apart without colour, and a phone. The live map (test/fixtures/atlas-live.json, the
   API's /atlas of 2026-10-08 without its pins) is the case for names on a whole real map. */

useBrowser();
const live = JSON.parse(readFileSync("test/fixtures/atlas-live.json", "utf8"));
const still = { reducedMotion: "reduce" as const };

beforeEach(async () => {
  await resetStubs();
  await stubSite();
  await stubAtlas();
});

const viewBox = async (page: Page) => (await page.getAttribute("svg.atlas-map", "viewBox"))!.split(" ").map(Number);

/** The region names showing, and whether any two overlap on screen. */
async function namesShown(page: Page) {
  return page.evaluate(() => {
    const shown = [...document.querySelectorAll<SVGTextElement>(".region-name")]
      .filter((n) => getComputedStyle(n).display !== "none")
      .map((n) => {
        const lines = [...n.querySelectorAll("tspan")].map((t) => t.textContent);
        return { name: lines.length ? lines.join(" ") : n.textContent!.trim(), r: n.getBoundingClientRect() };
      });
    const overlaps: string[] = [];
    for (let i = 0; i < shown.length; i++) {
      for (let j = i + 1; j < shown.length; j++) {
        const a = shown[i].r, b = shown[j].r;
        if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) overlaps.push(`${shown[i].name} / ${shown[j].name}`);
      }
    }
    return { names: shown.map((s) => s.name), overlaps };
  });
}

describe("the Atlas, in a browser", () => {
  it("is accessible, light and dark, with What's new and a framed place", { timeout: 60_000 }, async () => {
    // Still: axe waits for animations to finish, and What's new's glow never does.
    for (const theme of ["light", "dark"] as const) {
      for (const path of ["/atlas", "/atlas?at=java"]) {
        const { page, errors } = await open(path, theme, new Map(), still);
        await expectAccessible(page);
        expect(errors).toEqual([]);
      }
    }
  });

  it("zooms with the buttons and the wheel, and goes back to the whole map", async () => {
    const { page } = await open("/atlas", "light", new Map(), still);
    await page.waitForSelector(".atlas-zoom:not([hidden])");
    const first = await viewBox(page);
    const world = (await page.getAttribute("svg.atlas-map", "data-world"))!.split(" ").map(Number);

    await page.click("[data-atlas-zoom=in]");
    const closer = await viewBox(page);
    expect(closer[2]).toBeLessThan(first[2] * 0.7);

    const box = (await page.locator("svg.atlas-map").boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -400);
    await expect.poll(async () => (await viewBox(page))[2]).toBeLessThan(closer[2]);

    await page.click("[data-atlas-zoom=fit]");
    expect(await viewBox(page)).toEqual(world);
  });

  it("pans by dragging, and a drag that ends on a place doesn't follow its link", async () => {
    const { page } = await open("/atlas", "light", new Map(), still);
    await page.waitForSelector(".atlas-zoom:not([hidden])");
    const before = await viewBox(page);
    const box = (await page.locator("svg.atlas-map").boundingBox())!;
    await page.mouse.move(box.x + 60, box.y + 200);
    await page.mouse.down();
    await page.mouse.move(box.x + 160, box.y + 150, { steps: 5 });
    await page.mouse.up();
    const after = await viewBox(page);
    expect(after[0]).toBeLessThan(before[0]);
    expect(after[1]).toBeGreaterThan(before[1]);
    expect(after[2]).toBe(before[2]);

    // From empty map onto a place: still the Atlas.
    const java = (await page.locator("a.place[data-tag=java] .mark").boundingBox())!;
    await page.mouse.move(java.x - 60, java.y + 60);
    await page.mouse.down();
    await page.mouse.move(java.x + java.width / 2, java.y + java.height / 2, { steps: 5 });
    await page.mouse.up();
    expect(new URL(page.url()).pathname).toBe("/atlas");
  });

  it("finds a place without a reload, frames it, shows its pins and says so in the address", async () => {
    const { page } = await open("/atlas", "light", new Map(), still);
    await page.waitForSelector(".atlas-zoom:not([hidden])");
    await page.evaluate(() => ((window as unknown as { stayed: boolean }).stayed = true));
    expect(await page.isVisible("g.pins[data-for=rust]")).toBe(false);

    await page.fill("#atlas-at", "Rust");
    await page.press("#atlas-at", "Enter");

    await expect.poll(() => page.url()).toMatch(/\/atlas\?at=rust$/);
    expect(await page.evaluate(() => (window as unknown as { stayed?: boolean }).stayed)).toBe(true);
    const [x, y, w, h] = await viewBox(page);
    expect(Math.abs(x + w / 2 - 260)).toBeLessThan(1);
    expect(Math.abs(y + h / 2 - 40)).toBeLessThan(1);
    expect(await page.getAttribute("a.place[data-tag=rust]", "class")).toContain("here");
    expect(await page.evaluate(() => document.activeElement?.getAttribute("data-tag"))).toBe("rust");
    // Close up, the framed place's pins show, and only its.
    expect(await page.getAttribute("svg.atlas-map", "data-zoom")).toBe("near");
    expect(await page.isVisible("g.pins[data-for=rust] a.pin-factoid")).toBe(true);
    expect(await page.isVisible("g.pins[data-for=java]")).toBe(false);

    // A name not on the map is the server's to answer.
    await page.fill("#atlas-at", "fortran");
    await page.press("#atlas-at", "Enter");
    await expect.poll(() => page.textContent(".atlas-missed").catch(() => null)).toBe("No place on the map is called “fortran”.");
  });

  it("shows every place's pins when zoomed in far enough", async () => {
    const { page } = await open("/atlas?at=java", "light", new Map(), still);
    await page.waitForSelector(".atlas-zoom:not([hidden])");
    expect(await page.isVisible("g.pins[data-for=java]")).toBe(true);
    expect(await page.isVisible("g.pins[data-for=spring]")).toBe(false);
    for (let i = 0; i < 3; i++) await page.click("[data-atlas-zoom=in]");
    expect(await page.getAttribute("svg.atlas-map", "data-close")).toBe("");
    expect(await page.isVisible("g.pins[data-for=spring] a.pin-article")).toBe(true);
  });

  it("frames a place What's new names, in place", async () => {
    const { page } = await open("/atlas", "light", new Map(), still);
    await page.waitForSelector(".atlas-zoom:not([hidden])");
    await page.click(".whats-new-meta a[data-atlas-frame=rust]");
    await expect.poll(() => page.url()).toMatch(/\/atlas\?at=rust$/);
    expect(await page.getAttribute("a.place[data-tag=rust]", "class")).toContain("here");
  });

  it("is drawn after a client-side navigation, and its script starts", async () => {
    const { page, errors } = await open("/tags", "light");
    await page.click("header nav a[href='/atlas'] >> visible=true");
    await page.waitForSelector(".atlas-zoom:not([hidden])");
    // SVG elements, not HTML ones of the same name.
    expect(await page.evaluate(() => document.querySelector("a.place") instanceof SVGAElement)).toBe(true);
    expect(await page.isVisible("a.place[data-tag=java] .mark")).toBe(true);
    expect(errors).toEqual([]);
  });

  it("tells the kinds apart by shape, not colour", async () => {
    const { page } = await open("/atlas?at=java", "light");
    const shapes = await page.evaluate(() => {
      const mark = (tag: string) => document.querySelector<SVGGraphicsElement>(`a.place[data-tag=${tag}] .mark`)!;
      const style = (el: Element) => getComputedStyle(el);
      const bg = style(document.querySelector(".atlas")!).backgroundColor;
      const disc = mark("spring"), ring = mark("rust"), diamond = mark("java");
      const kind = (sel: string) => style(document.querySelector(sel)!);
      return {
        disc: { tag: disc.tagName, hollow: style(disc).fill === bg },
        ring: { tag: ring.tagName, hollow: style(ring).fill === bg, stroke: parseFloat(style(ring).strokeWidth) },
        diamond: { tag: diamond.tagName, corners: (diamond.getAttribute("d")!.match(/[ML]/g) || []).length },
        square: (document.querySelector(".pin-mark-article")!.getAttribute("d")!.match(/[HV]/g) || []).length,
        triangle: (document.querySelector(".pin-mark-factoid")!.getAttribute("d")!.match(/[ML]/g) || []).length,
        list: {
          articles: [kind(".atlas-kind-articles").borderRadius, kind(".atlas-kind-articles").backgroundColor !== "rgba(0, 0, 0, 0)"],
          factoids: [kind(".atlas-kind-factoids").borderRadius, kind(".atlas-kind-factoids").backgroundColor === "rgba(0, 0, 0, 0)", parseFloat(kind(".atlas-kind-factoids").borderTopWidth)],
          shared: [kind(".atlas-kind-shared").borderRadius, kind(".atlas-kind-shared").transform !== "none"],
        },
      };
    });
    expect(shapes.disc).toEqual({ tag: "circle", hollow: false });
    expect(shapes.ring.tag).toBe("circle");
    expect(shapes.ring.hollow).toBe(true);
    expect(shapes.ring.stroke).toBeGreaterThanOrEqual(2);
    expect(shapes.diamond).toEqual({ tag: "path", corners: 4 });
    expect(shapes.square).toBe(3);
    expect(shapes.triangle).toBe(3);
    expect(shapes.list.articles).toEqual(["50%", true]);
    expect(shapes.list.factoids[0]).toBe("50%");
    expect(shapes.list.factoids[1]).toBe(true);
    expect(shapes.list.factoids[2]).toBeGreaterThanOrEqual(2);
    expect(shapes.list.shared).toEqual(["0px", true]);
  });
});

describe("the Atlas's region names", () => {
  it("never overlap on the whole live map, and show again closer in", async () => {
    await stubAtlas(live);
    const visited = new Map([["bcn-atlas-seen", String(Math.floor(Date.now() / 1000))]]);
    const { page } = await open("/atlas", "light", visited, { ...still, viewport: { width: 1920, height: 1080 } });
    await page.waitForSelector(".atlas-zoom:not([hidden])");
    expect(await page.getAttribute("svg.atlas-map", "viewBox")).toBe(await page.getAttribute("svg.atlas-map", "data-world"));
    const far = await namesShown(page);
    expect(far.overlaps).toEqual([]);
    expect(far.names.length).toBeGreaterThan(5);

    for (let i = 0; i < 4; i++) await page.click("[data-atlas-zoom=in]");
    expect((await namesShown(page)).overlaps).toEqual([]);
  });

  it("make way for the bigger region's when two would collide, and the smaller returns closer in", async () => {
    // Two regions whose names, written across them from afar, fall on each other.
    const crowded = atlas();
    crowded.regions = [
      { id: 1, name: "java · spring", x: 0, y: 0, r: 90, uncharted: false },
      { id: 2, name: "rust · wasm", x: 30, y: 8, r: 30, uncharted: false },
      { id: 0, name: "Uncharted", x: 460, y: 0, r: 40, uncharted: true },
    ];
    crowded.places = crowded.places.map((p) => (p.region === 2 ? { ...p, region: 1 } : p));
    crowded.places.push({ tag: "zig", region: 2, x: 30, y: 8, articleCount: 1, factoidCount: 0, kind: "articles", r: 6.6, labelSize: 11, minor: true, pins: [] });
    await stubAtlas(crowded);
    // Nothing new since a moment ago: the page opens on the whole map, not on what's fresh.
    const visited = new Map([["bcn-atlas-seen", String(Math.floor(Date.now() / 1000))]]);
    const { page } = await open("/atlas", "light", visited, still);
    expect(await page.getAttribute("svg.atlas-map", "data-zoom")).toBe("far");
    await page.waitForSelector(".atlas-zoom:not([hidden])");

    const far = await namesShown(page);
    expect(far.overlaps).toEqual([]);
    // The bigger region keeps its name; the smaller's waits.
    expect(far.names).toContain("java spring");
    expect(far.names).not.toContain("rust wasm");
    // Without the decluttering, they would overlap: the case is a real collision.
    await page.evaluate(() => document.querySelectorAll(".region-name.crowded").forEach((n) => n.classList.remove("crowded")));
    expect((await namesShown(page)).overlaps).toEqual(["java spring / rust wasm"]);

    // Closer in, names move above their regions, apart, and both show.
    for (let i = 0; i < 6; i++) await page.click("[data-atlas-zoom=in]");
    const near = await namesShown(page);
    expect(near.overlaps).toEqual([]);
    expect(near.names).toEqual(expect.arrayContaining(["java · spring", "rust · wasm"]));
  });
});

describe("the Atlas on a phone", () => {
  it("keeps the map usable at 390 pixels, the key folded behind a button", async () => {
    const { page, errors } = await open("/atlas", "light", new Map(), { ...still, viewport: { width: 390, height: 844 } });
    await page.waitForSelector(".atlas-zoom:not([hidden])");

    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    const map = (await page.locator("svg.atlas-map").boundingBox())!;
    expect(map.width).toBeGreaterThan(340);
    expect(map.height).toBeGreaterThan(300);
    expect(await page.evaluate(() => document.querySelector<HTMLDetailsElement>("details.atlas-key-box")!.open)).toBe(false);
    expect(await page.isVisible(".atlas-legend")).toBe(false);
    expect(await page.isVisible("[data-atlas-zoom=in]")).toBe(true);

    await page.click(".atlas-key-button");
    expect(await page.isVisible(".atlas-legend")).toBe(true);
    // The list follows the map.
    const list = (await page.locator("nav.atlas-list").boundingBox())!;
    expect(list.y).toBeGreaterThan(map.y + map.height - 1);
    await expectAccessible(page);
    expect(errors).toEqual([]);
  });
});
