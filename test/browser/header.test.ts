import { beforeEach, describe, expect, it } from "vitest";
import type { Page } from "playwright";
import { expectAccessible, open, useBrowser } from "../support/browser.ts";
import { ADMIN, signedIn } from "../support/readers.ts";
import { list, post, resetStubs, stub, stubSite } from "../support/stub.ts";

useBrowser();

/* The header (#94, #95): one row at every width, nothing in it overlapping or broken over two lines,
   nothing wider than the screen, signed in or out; its menus open, shut, and hold the rest. */
const LONG_NAME = { ...ADMIN, displayName: "Josephine Ottinger-Abernathy" };
const WIDTHS = [320, 390, 768, 800, 1024, 1280, 1440];

beforeEach(async () => {
  await resetStubs();
  await stubSite();
  await stub("/posts", list([post(), post(), post()]), { query: { page: 0, size: 9 } });
  await stub("/posts/popular", list([]), { query: { page: 0, size: 3 } });
});

/** What's shown in the header's row: each item's box, and the row's and the page's widths. */
async function row(page: Page) {
  return page.evaluate(() => {
    const header = document.querySelector("header")!;
    const items = [...header.querySelectorAll<HTMLElement>("a, summary, button, input")]
      .filter((e) => !e.closest(".hmenu-panel") && e.checkVisibility())
      .map((e) => { const r = e.getBoundingClientRect(); return { name: (e.textContent || e.getAttribute("aria-label") || e.id).trim(), left: r.left, right: r.right, top: r.top, height: r.height }; });
    const shut = [...header.querySelectorAll<HTMLElement>(".hmenu-panel a, .hmenu-panel button, .hmenu-panel input")]
      .filter((e) => e.checkVisibility()).map((e) => (e.textContent || e.id).trim());
    return { items, shut, header: header.getBoundingClientRect().height, page: document.documentElement.scrollWidth };
  });
}

describe("the header, at every width", () => {
  for (const who of ["signed out", "signed in as an admin with a long name"] as const) {
    it(`is one row, ${who}, with nothing overlapping, broken or off the screen`, async () => {
      const cookies = who === "signed out" ? new Map<string, string>() : (await signedIn(LONG_NAME)).cookies;
      for (const width of WIDTHS) {
        const { page } = await open("/", "dark", cookies, { viewport: { width, height: 800 } });
        const { items, shut, header, page: wide } = await row(page);
        expect(shut, `${width}: what the shut menus hold`).toEqual([]);
        const names = items.map((i) => i.name);
        expect(names.includes("Menu"), `${width}: the phone's menu`).toBe(width < 1024);
        expect(names.includes("Tags"), `${width}: the sections in the row`).toBe(width >= 1024);
        expect(wide, `${width}: the page's width`).toBeLessThanOrEqual(width);
        expect(header, `${width}: the header's height`).toBeLessThanOrEqual(64);
        for (const item of items) {
          expect(item.right, `${width}: ${item.name}'s right edge`).toBeLessThanOrEqual(width);
          expect(item.height, `${width}: ${item.name} on one line`).toBeLessThanOrEqual(40);
        }
        const sorted = [...items].sort((a, b) => a.left - b.left);
        for (let i = 1; i < sorted.length; i++) {
          expect(sorted[i].left, `${width}: ${sorted[i - 1].name} and ${sorted[i].name}`).toBeGreaterThanOrEqual(sorted[i - 1].right - 0.5);
        }
        expect(items.map((i) => i.name), `${width}: Submit shown`).toContain("Submit");
        await page.context().close();
      }
    }, 60_000);
  }
});

describe("the header's menus", () => {
  it("on a wide screen, keep the rarer sections, the feeds and the account, one menu open at a time", async () => {
    const v = await signedIn(ADMIN);
    const { page, errors } = await open("/", "light", v.cookies, { viewport: { width: 1280, height: 800 } });
    const panel = (title: string) => page.locator("header details[data-menu]:visible").filter({ has: page.locator("summary", { hasText: title }) });

    await panel("More").locator("summary").click();
    expect(await panel("More").locator(".hmenu-panel a").allTextContents()).toEqual(["Factoids", "RSS Reader", "Karma", "Logs"]);
    await panel("Subscribe").locator("summary").click();
    expect(await panel("More").getAttribute("open")).toBeNull();
    expect((await panel("Subscribe").locator(".hmenu-panel a").allTextContents()).map((t) => t.trim())).toEqual(["RSS", "Podcast"]);
    await panel("Ed Itor").locator("summary").click();
    expect((await panel("Ed Itor").locator(".hmenu-panel a, .hmenu-panel button").allTextContents()).map((t) => t.trim())).toEqual(["Profile", "Admin", "Sign out"]);
    await expectAccessible(page);

    await page.locator("main").click({ position: { x: 5, y: 300 } });
    expect(await page.locator("header details[data-menu][open]").count()).toBe(0);
    expect(errors).toEqual([]);
  });

  it("on a phone, are one menu with everything else in it, shut again by Escape", async () => {
    const v = await signedIn(ADMIN);
    for (const theme of ["light", "dark"] as const) {
      const { page, errors } = await open("/", theme, v.cookies, { viewport: { width: 390, height: 844 } });
      await page.locator("header summary[aria-label=Menu]").click();
      const sheet = page.locator("header .hmenu-sheet");
      await sheet.waitFor();
      expect(await sheet.locator("#mobile-header-search").isVisible()).toBe(true);
      const labels = (await sheet.locator("a, button").allTextContents()).map((t) => t.trim()).filter(Boolean);
      expect(labels).toEqual(expect.arrayContaining(["Front Page", "Tags", "Atlas", "Factoids", "Karma", "Logs", "RSS", "Podcast", "Profile", "Admin", "Sign out"]));
      expect(await sheet.locator("[data-theme-toggle]").isVisible()).toBe(true);
      const box = await sheet.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(390);
      await expectAccessible(page);

      await page.keyboard.press("Escape");
      expect(await page.locator("header details[data-menu][open]").count()).toBe(0);
      expect(errors).toEqual([]);
      await page.context().close();
    }
  });

  it("shut when a choice in them draws the next page in place", async () => {
    await stub("/karma/leaderboard", { top: [], bottom: [], limit: 10 });
    const { page } = await open("/", "light", new Map(), { viewport: { width: 1280, height: 800 } });
    await page.locator("header summary", { hasText: "More" }).click();
    await page.locator("header .hmenu-panel a[href='/karma']:visible").click();
    await page.waitForURL(/\/karma$/);
    expect(await page.locator("header details[data-menu][open]").count()).toBe(0);
  });

  it("make Submit the header's one filled button, boxed in every theme", async () => {
    for (const theme of ["light", "dark"] as const) {
      const { page } = await open("/", theme, new Map(), { viewport: { width: 1280, height: 800 } });
      const submit = page.locator("header a.submit-button");
      expect(await submit.count()).toBe(1);
      const style = await submit.evaluate((e) => { const s = getComputedStyle(e); return { border: s.borderTopWidth, radius: s.borderTopLeftRadius }; });
      expect(style.border).not.toBe("0px");
      expect(style.radius).not.toBe("0px");
      await page.context().close();
    }
  });
});
