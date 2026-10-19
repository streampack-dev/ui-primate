import type { Page } from "playwright";
import { beforeEach, describe, expect, it } from "vitest";
import { expectAccessible, open, useBrowser } from "../support/browser.ts";
import { signedIn } from "../support/readers.ts";
import { requests, resetStubs, stub, stubSite } from "../support/stub.ts";

/* Comments on a passage in the browser (#65): a selection becomes the comment's quote, and anchored
   comments show as callouts in the margin when there's room and as markers when there isn't. The
   finding and placing is clientjs's anchors module; this checks the site's use of it with real
   layout and real selections. */
useBrowser();

const SLUG = "2026/09/passages";
const PAGE = `/posts/${SLUG}`;
const TWO_ON_ONE = "019f0000-0000-7000-8000-0000000000a1";
const ALSO_ON_ONE = "019f0000-0000-7000-8000-0000000000a2";
const ON_SECOND = "019f0000-0000-7000-8000-0000000000a3";
const ON_THIRD = "019f0000-0000-7000-8000-0000000000a4";
const ORPHAN = "019f0000-0000-7000-8000-0000000000a5";
const PLAIN = "019f0000-0000-7000-8000-0000000000a6";

const WIDE = { viewport: { width: 1400, height: 900 } };
const NARROW = { viewport: { width: 500, height: 900 } };

// Room between Alpha and Beta for Alpha's callout, so Beta's can sit level with its passage.
const filler = "<p>Filler paragraph that only takes up room, line after line after line.</p>";
const body =
  "<p>Alpha paragraph has the first quoted words in it.</p>" +
  "<p>Gamma paragraph is plain, with <a href=\"https://example.com/\">a link</a>.</p>" +
  filler.repeat(4) +
  "<p>Beta paragraph says second and third close together.</p>" +
  "<p>Delta paragraph ends the post.</p>";

function quoted(id: string, author: string, exact: string, words: string, found = true) {
  return {
    id, authorDisplayName: author, markdownSource: null, createdAt: "2026-10-01T12:00:00Z", deleted: false, editable: false, children: [],
    renderedHtml: `<blockquote class="comment-anchor"><p>${exact}</p></blockquote><p>${words}</p>`,
    anchor: { exact, prefix: null, suffix: null }, anchorFound: found,
  };
}

beforeEach(async () => {
  await resetStubs();
  await stubSite();
  await stub(`/posts/${SLUG}`, {
    id: "019f0000-0000-7000-8000-0000000000a0", title: "Passages", slug: SLUG, excerpt: "Passages.",
    renderedHtml: body, authorDisplayName: "dreamreal", publishedAt: "2026-10-01T02:30:00Z", tags: [], categories: [],
  });
  await stub(`/posts/${SLUG}/comments`, {
    totalActiveCount: 6,
    comments: [
      quoted(TWO_ON_ONE, "Ann", "first quoted words", "One of two on this."),
      quoted(ALSO_ON_ONE, "Bea", "first quoted words", "The second on it."),
      quoted(ON_SECOND, "Cy", "second", "About second."),
      quoted(ON_THIRD, "Di", "third", "About third."),
      quoted(ORPHAN, "Ed", "words an edit removed", "Gone.", false),
      { id: PLAIN, authorDisplayName: "Flo", renderedHtml: "<p>No quote.</p>", markdownSource: null, createdAt: "2026-10-01T12:00:00Z", deleted: false, editable: false, children: [] },
    ],
  });
  await stub(`/posts/${SLUG}/comments`, { id: "019f0000-0000-7000-8000-0000000000a7" }, { method: "POST", status: 201 });
});

/** Selects the text from [from] to the end of [to] in the post's body, as a reader would. */
async function select(page: Page, from: string, to = from) {
  await page.evaluate(([from, to]) => {
    const body = document.querySelector("[data-anchor-body]")!;
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    let start: [Node, number] | undefined;
    let end: [Node, number] | undefined;
    for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
      if (!start && n.data.includes(from)) start = [n, n.data.indexOf(from)];
      if (start && n.data.includes(to)) { end = [n, n.data.indexOf(to) + to.length]; break; }
    }
    const range = document.createRange();
    range.setStart(...start!);
    range.setEnd(...end!);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(range);
  }, [from, to]);
}

const top = (page: Page, selector: string) => page.$eval(selector, (e) => e.getBoundingClientRect().top);
const bottom = (page: Page, selector: string) => page.$eval(selector, (e) => e.getBoundingClientRect().bottom);
const focused = (page: Page) => page.evaluate(() => document.activeElement?.id);

/** The top of the passage [text] in the post, from its first line. */
function passageTop(page: Page, text: string) {
  return page.evaluate((t) => {
    const walker = document.createTreeWalker(document.querySelector("[data-anchor-body]")!, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
      const i = n.data.indexOf(t);
      if (i >= 0) {
        const r = document.createRange();
        r.setStart(n, i);
        r.setEnd(n, i + t.length);
        return r.getBoundingClientRect().top;
      }
    }
    return NaN;
  }, text);
}

async function reader() {
  return (await signedIn()).cookies;
}

describe("comments on a passage, in a browser", () => {
  it("with room beside the post, gives each passage a callout level with it", async () => {
    const { page, errors } = await open(PAGE, "light", new Map(), WIDE);
    await page.waitForSelector(".anchor-callout");

    expect(await page.locator(".anchor-margin .anchor-callout").count()).toBe(3);
    expect(await page.locator(".anchor-marker").count()).toBe(0);
    const one = `#anchor-callout-${TWO_ON_ONE}`;
    const said = await page.locator(one).innerText();
    expect(said).toContain("Ann");
    expect(said).toContain("Bea");
    expect(said).toContain("2 comments");
    expect(Math.abs(await top(page, one) - await passageTop(page, "first quoted words"))).toBeLessThanOrEqual(1);
    expect(Math.abs(await top(page, `#anchor-callout-${ON_SECOND}`) - await passageTop(page, "second"))).toBeLessThanOrEqual(1);
    // "third" is on the same line as "second": its callout moves down below that one's.
    expect(await top(page, `#anchor-callout-${ON_THIRD}`)).toBeGreaterThanOrEqual(await bottom(page, `#anchor-callout-${ON_SECOND}`));
    // The light mark: one highlight range for each passage.
    expect(await page.evaluate(() => CSS.highlights.get("comment-anchor")?.size)).toBe(3);
    // The post doesn't move for them: it stays centred, and nothing scrolls sideways.
    const centres = await page.$eval(".post-article", (a) => {
      const r = a.getBoundingClientRect();
      const s = a.parentElement!.getBoundingClientRect();
      return [r.left + r.width / 2, s.left + s.width / 2];
    });
    expect(Math.abs(centres[0] - centres[1])).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    // The callouts sit beside the post's text, not over it.
    expect(await page.$eval(".anchor-margin", (e) => e.getBoundingClientRect().left))
      .toBeGreaterThanOrEqual(await page.$eval("[data-anchor-body]", (e) => e.getBoundingClientRect().right));
    expect(errors).toEqual([]);
  });

  it("hides a comment's quote where its callout shows it, and keeps an orphan's", async () => {
    const { page } = await open(PAGE, "light", new Map(), WIDE);
    await page.waitForSelector(".anchor-callout");

    expect(await page.locator(`#comment-${ON_SECOND} .comment-body > blockquote.comment-anchor`).isVisible()).toBe(false);
    expect(await page.locator(`#comment-${ORPHAN} .comment-body > blockquote.comment-anchor`).isVisible()).toBe(true);
    expect(await page.locator(`#comment-${ORPHAN} .comment-anchor-gone`).innerText()).toBe("This passage is no longer in the post.");
    expect(await page.locator(`#anchor-callout-${ORPHAN}`).count()).toBe(0);
    expect(await page.locator(`#comment-${PLAIN} .comment-anchor-link`).count()).toBe(0);
  });

  it("links a callout and its comments to each other", async () => {
    const { page } = await open(PAGE, "light", new Map(), WIDE);
    await page.waitForSelector(".anchor-callout");

    await page.click(`#anchor-callout-${ON_SECOND} a.anchor-callout-link`);
    expect(await focused(page)).toBe(`comment-${ON_SECOND}`);
    await page.click(`#comment-${ALSO_ON_ONE} a.comment-anchor-link`);
    expect(await focused(page)).toBe(`anchor-callout-${TWO_ON_ONE}`);
  });

  it("without room, puts a marker after each passage's paragraph that goes to its comments", async () => {
    const { page } = await open(PAGE, "light", new Map(), NARROW);
    await page.waitForSelector(".anchor-marker");

    expect(await page.locator(".anchor-margin").count()).toBe(0);
    const markers = page.locator("[data-anchor-body] .anchor-marker");
    expect(await markers.allInnerTexts()).toEqual(["2", "1", "1"]);
    expect(await markers.first().getAttribute("aria-label")).toBe("2 comments on the passage “first quoted words”");
    expect(await page.evaluate(() => document.querySelector(".anchor-marker")!.previousElementSibling!.textContent)).toMatch(/^Alpha/);
    // No callout, so the quotes stay in the thread.
    expect(await page.locator(`#comment-${ON_SECOND} .comment-body > blockquote.comment-anchor`).isVisible()).toBe(true);

    await markers.first().click();
    expect(await focused(page)).toBe(`comment-${TWO_ON_ONE}`);
    await page.click(`#comment-${ON_THIRD} a.comment-anchor-link`);
    expect(await focused(page)).toBe(`anchor-marker-${ON_THIRD}`);
  });

  it("uses markers where the space beside the centred post is too narrow for callouts, and leaves the post where it was", async () => {
    const { page } = await open(PAGE, "light", new Map(), { viewport: { width: 1200, height: 900 } });
    const before = await page.$eval("[data-anchor-body]", (e) => e.getBoundingClientRect().left);
    await page.waitForSelector(".anchor-marker");

    expect(await page.locator(".anchor-callout").count()).toBe(0);
    expect(await page.$eval("[data-anchor-body]", (e) => e.getBoundingClientRect().left)).toBe(before);
  });

  it("has room for callouts from a window about 1280px wide", async () => {
    const { page } = await open(PAGE, "light", new Map(), { viewport: { width: 1300, height: 900 } });
    await page.waitForSelector(".anchor-callout");

    expect(await page.locator(".anchor-callout").count()).toBe(3);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  it("moves between callouts and markers as the window is resized", async () => {
    const { page } = await open(PAGE, "light", new Map(), WIDE);
    await page.waitForSelector(".anchor-callout");

    await page.setViewportSize({ width: 500, height: 900 });
    await page.waitForSelector(".anchor-marker");
    expect(await page.locator(".anchor-callout").count()).toBe(0);

    await page.setViewportSize({ width: 1400, height: 900 });
    await page.waitForSelector(".anchor-callout");
    expect(await page.locator(".anchor-marker").count()).toBe(0);
    expect(await page.locator(".anchor-callout").count()).toBe(3);
  });

  it("makes a selection the new comment's quote, sent as its anchor", async () => {
    const { page } = await open(PAGE, "light", await reader(), WIDE);
    await select(page, "plain", "link");
    await page.click(".anchor-ask button[data-anchor-ask]");

    const form = page.locator("form.comment-form");
    expect(await form.locator("input[name=anchorExact]").inputValue()).toBe("plain, with a link");
    expect(await form.locator("input[name=anchorPrefix]").inputValue()).toMatch(/Gamma paragraph is $/);
    expect(await form.locator("input[name=anchorSuffix]").inputValue()).toMatch(/^\. Filler/);
    expect(await form.locator("[data-comment-quote]").isVisible()).toBe(true);
    expect(await form.locator("[data-comment-quote-text]").innerText()).toBe("plain, with a link");
    expect(await page.evaluate(() => (document.activeElement as HTMLTextAreaElement).name)).toBe("markdownSource");
    expect(await page.locator(".anchor-ask").isVisible()).toBe(false);

    await page.keyboard.type("Linked well.");
    await Promise.all([page.waitForURL(/#comment-/), form.locator("button[type=submit]").click()]);

    const sent = (await requests()).filter((r) => r.method === "POST" && r.path === `/posts/${SLUG}/comments`);
    expect(sent.at(-1)!.body).toMatchObject({ markdownSource: "Linked well.", anchor: { exact: "plain, with a link" } });
  });

  it("lets the quote be taken out again", async () => {
    const { page } = await open(PAGE, "light", await reader(), WIDE);
    await select(page, "Delta");
    await page.click("[data-anchor-ask]");

    await page.click("[data-comment-quote-remove]");

    expect(await page.locator("form.comment-form input[name=anchorExact]").inputValue()).toBe("");
    expect(await page.locator("form.comment-form [data-comment-quote]").isVisible()).toBe(false);
    expect(await page.evaluate(() => (document.activeElement as HTMLTextAreaElement).name)).toBe("markdownSource");
  });

  it("puts the button after the post in the tab order, and it works from the keyboard", async () => {
    const { page } = await open(PAGE, "light", await reader(), WIDE);
    await select(page, "Beta", "together.");
    await page.waitForSelector(".anchor-ask:not([hidden])");
    // The last link in the post, then Tab: the next stop is the button.
    await page.locator("[data-anchor-body] a").last().focus();
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => (document.activeElement as HTMLElement).dataset.anchorAsk)).toBe("");

    await page.keyboard.press("Enter");

    expect(await page.locator("form.comment-form input[name=anchorExact]").inputValue()).toBe("Beta paragraph says second and third close together.");
  });

  it("offers nothing for a selection outside the post, or none", async () => {
    const { page } = await open(PAGE, "light", await reader(), WIDE);
    await page.evaluate(() => {
      const r = document.createRange();
      r.selectNodeContents(document.querySelector(".comments h2")!);
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(r);
    });
    await page.waitForTimeout(100);
    expect(await page.locator(".anchor-ask").isVisible()).toBe(false);

    await select(page, "Alpha");
    await page.waitForSelector(".anchor-ask:not([hidden])");
    await page.evaluate(() => getSelection()!.removeAllRanges());
    await page.waitForTimeout(100);
    expect(await page.locator(".anchor-ask").isVisible()).toBe(false);
  });

  it("says why a selection is too long to quote, and keeps the form as it was", async () => {
    await stub(`/posts/${SLUG}`, {
      id: "019f0000-0000-7000-8000-0000000000a0", title: "Passages", slug: SLUG, excerpt: "Passages.",
      renderedHtml: `<p>Start ${"word ".repeat(120)}end.</p>`, authorDisplayName: "dreamreal", publishedAt: "2026-10-01T02:30:00Z", tags: [], categories: [],
    });
    const { page } = await open(PAGE, "light", await reader(), WIDE);
    await select(page, "Start", "end.");
    await page.click("[data-anchor-ask]");

    expect(await page.locator("[data-anchor-note]").innerText()).toMatch(/^Select at most 500 characters to quote; this is \d+\.$/);
    expect(await page.locator("form.comment-form input[name=anchorExact]").inputValue()).toBe("");
  });

  it("offers no button signed out, and still shows the callouts", async () => {
    const { page } = await open(PAGE, "light", new Map(), WIDE);
    await select(page, "Alpha");
    await page.waitForSelector(".anchor-callout");
    expect(await page.locator(".anchor-ask").count()).toBe(0);
  });

  it("is set up again on a page reached by the site's own navigation", async () => {
    const { page } = await open("/", "light", new Map(), WIDE);
    await page.evaluate((path) => {
      const a = document.createElement("a");
      a.href = path;
      a.textContent = "Passages";
      a.id = "to-passages";
      document.querySelector("main")?.prepend(a);
    }, PAGE);
    await page.click("#to-passages");
    await page.waitForSelector(".anchor-callout");
    expect(await page.locator(".anchor-callout").count()).toBe(3);
  });

  for (const theme of ["light", "dark"] as const) {
    it(`passes axe with callouts, markers and a quote, in the ${theme} theme`, async () => {
      const wide = await open(PAGE, theme, await reader(), WIDE);
      await wide.page.waitForSelector(".anchor-callout");
      await select(wide.page, "Delta");
      await wide.page.click("[data-anchor-ask]");
      await expectAccessible(wide.page);

      const narrow = await open(PAGE, theme, new Map(), NARROW);
      await narrow.page.waitForSelector(".anchor-marker");
      await expectAccessible(narrow.page);
    });
  }
});
