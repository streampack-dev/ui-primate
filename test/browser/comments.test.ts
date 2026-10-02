import { beforeEach, describe, it } from "vitest";
import { expectAccessible, open, useBrowser } from "../support/browser.ts";
import { ADMIN, signedIn } from "../support/readers.ts";
import { resetStubs, stub, stubSite } from "../support/stub.ts";

useBrowser();

const SLUG = "2026/09/midden";
const ID = "019f0000-0000-7000-8000-0000000e0002";

beforeEach(async () => {
  await resetStubs();
  await stubSite();
  await stub(`/posts/${SLUG}`, {
    id: "019f0000-0000-7000-8000-000000000001", title: "Midden", slug: SLUG, excerpt: "Midden.",
    renderedHtml: "<p>Midden.</p>", authorDisplayName: "dreamreal", publishedAt: "2026-10-01T02:30:00Z", tags: [], categories: [],
  });
  await stub(`/posts/${SLUG}/comments`, {
    totalActiveCount: 1,
    comments: [{ id: ID, authorDisplayName: "Joe O", renderedHtml: "<p>Mine.</p>", markdownSource: "Mine.", createdAt: "2026-10-01T12:00:00Z", deleted: false, editable: true, children: [] }],
  });
  await stub(`/posts/${SLUG}/comments`, { status: 403, detail: "Verify your email address before commenting." }, { method: "POST", status: 403 });
});

describe("a post's thread, in a browser", () => {
  it("is accessible for an admin, light and dark, with a refused reply open", async () => {
    const v = await signedIn(ADMIN);
    for (const theme of ["light", "dark"] as const) {
      const { page } = await open(`/posts/${SLUG}`, theme, v.cookies);
      await expectAccessible(page);
      await page.click(`#comment-${ID} .comment-reply summary`);
      await page.fill(`#reply-${ID}`, "A reply.");
      await page.click(`#comment-${ID} .comment-reply button[type=submit]`);
      await page.waitForSelector(`#comment-${ID} .comment-reply[open] .form-error`);
      await page.click(`#comment-${ID} .comment-edit summary`);
      await expectAccessible(page);
    }
  });

  it("asks before a removal, accessibly", async () => {
    const v = await signedIn(ADMIN);
    for (const theme of ["light", "dark"] as const) {
      const { page } = await open(`/comments/${ID}/remove?post=${encodeURIComponent(SLUG)}`, theme, v.cookies);
      await expectAccessible(page);
    }
  });
});
