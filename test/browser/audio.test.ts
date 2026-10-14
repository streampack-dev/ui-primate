import { beforeEach, describe, expect, it } from "vitest";
import { ADMIN, signedIn } from "../support/readers.ts";
import { expectAccessible, open, useBrowser } from "../support/browser.ts";
import { features, list, post, resetStubs, stub, stubSite } from "../support/stub.ts";

useBrowser();

/* A post's recording (#33) in a browser: the player, the mark and the editor's form, on a phone too,
   in both themes. */

const ID = "019f0000-0000-7000-8000-0000000b0033";
const PHONE = { width: 390, height: 844 };
const MEDIA = `https://api.bytecode.news/media/posts/${ID}/audio`;
const recording = {
  kind: "audio", variant: null, mediaType: "audio/mpeg", size: 3_900_000, duration: 257, url: MEDIA,
  note: "read by the author", maker: "dreamreal", current: false, createdAt: "2026-10-12T15:00:00Z", replacedAt: null,
};
const detail = {
  id: ID, title: "Heard", slug: "2026/10/heard", markdownSource: "Heard.", excerpt: "Heard.", renderedHtml: "<p>Heard.</p>",
  authorDisplayName: "dreamreal", status: "APPROVED", publishedAt: "2026-10-12T14:00:00Z", tags: [], categories: [], versions: [recording],
};

beforeEach(async () => {
  await resetStubs();
  await stubSite();
  await stub(`/posts/${detail.slug}`, detail);
  await stub(`/posts/${detail.slug}/comments`, { totalActiveCount: 0, comments: [] });
  await stub(`/posts/${ID}/access`, {}, { status: 204 });
  await stub(`/posts/${ID}`, detail);
  await stub("/categories", []);
  await stub("/features", features());
  await stub("/posts", list([post({ title: "Heard", slug: detail.slug, versionKinds: ["audio"] })]));
});

const width = () => document.documentElement.scrollWidth;

describe("a post's recording, in a browser", () => {
  for (const theme of ["light", "dark"] as const) {
    it(`passes axe on the post, the front page and the editor, in the ${theme} theme`, async () => {
      for (const path of [`/posts/${detail.slug}`, "/"]) {
        const { page } = await open(path, theme);
        await expectAccessible(page);
      }
      const admin = await signedIn(ADMIN);
      const { page } = await open(`/edit/${ID}`, theme, admin.cookies);
      await expectAccessible(page);
    });
  }

  it("fits a phone: the player as wide as the post, no wider", async () => {
    const { page, errors } = await open(`/posts/${detail.slug}`, "light", new Map(), { viewport: PHONE });
    const player = await page.locator(".post-audio audio").boundingBox();
    expect(player!.width).toBeGreaterThan(200);
    expect(player!.x + player!.width).toBeLessThanOrEqual(PHONE.width);
    expect(await page.evaluate(width)).toBeLessThanOrEqual(PHONE.width);
    expect(errors).toEqual([]);
  });

  it("fits a phone in the editor, the recording's facts and form too", async () => {
    const admin = await signedIn(ADMIN);
    const { page } = await open(`/edit/${ID}`, "light", admin.cookies, { viewport: PHONE });
    await page.locator("#recording").scrollIntoViewIfNeeded();
    expect(await page.evaluate(width)).toBeLessThanOrEqual(PHONE.width);
  });

  it("refuses a file over the limit as it's chosen, before any of it is sent", async () => {
    const admin = await signedIn(ADMIN);
    const { page } = await open(`/edit/${ID}`, "light", admin.cookies);
    const field = page.locator("#audio-file");
    // One byte over the test app's 100 KB limit (test/support/app.ts).
    await field.setInputFiles({ name: "big.mp3", mimeType: "audio/mpeg", buffer: Buffer.alloc(100 * 1024 + 1) });
    expect(await field.evaluate((f: HTMLInputElement) => f.validationMessage)).toBe("The recording is over 100 KB, the most the site takes.");
    await field.setInputFiles({ name: "small.mp3", mimeType: "audio/mpeg", buffer: Buffer.from("ID3") });
    expect(await field.evaluate((f: HTMLInputElement) => f.validity.valid)).toBe(true);
  });
});
