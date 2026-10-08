/* A real browser on the app, as ui-pudl's Playwright tests use one, and axe's accessibility check. */
import AxeBuilder from "@axe-core/playwright";
import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, expect, inject } from "vitest";

let browser: Browser;
export function useBrowser() {
  beforeAll(async () => { browser = await chromium.launch(); });
  afterAll(async () => { await browser?.close(); });
}

/** A page at [path], in [theme], with its script errors collected; [cookies] (a Visitor's, say)
   carry a session into the browser; a [viewport] (a phone's, say) and reduced motion may be asked for. */
export async function open(path: string, theme: "light" | "dark" = "light", cookies: Map<string, string> = new Map(), { viewport, reducedMotion }: { viewport?: { width: number; height: number }; reducedMotion?: "reduce" } = {}): Promise<{ page: Page; errors: string[] }> {
  const context = await browser.newContext({ colorScheme: theme, ...(viewport ? { viewport } : {}), ...(reducedMotion ? { reducedMotion } : {}) });
  await context.addCookies([...cookies].map(([name, value]) => ({ name, value, url: inject("appUrl") })));
  // Seeded once: a reader's own choice, made on the page, stands across reloads.
  await context.addInitScript((t) => { try { if (!localStorage.getItem("theme")) localStorage.setItem("theme", t); } catch {} }, theme);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${inject("appUrl")}${path}`);
  return { page, errors };
}

/** Fails with axe's findings, if any, at WCAG 2 A and AA. */
export async function expectAccessible(page: Page) {
  // After the entrance animations: mid-fade, text is measured nearly transparent.
  // An animation cancelled along the way (by a dialog opening, say) is as done as a finished one.
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}
