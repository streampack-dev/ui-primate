import { beforeEach, describe, expect, it } from "vitest";
import { expectAccessible, open, useBrowser } from "../support/browser.ts";
import { ADMIN, signedIn } from "../support/readers.ts";
import { post, resetStubs, stub, stubSite } from "../support/stub.ts";

useBrowser();

/* The reader's zone in a browser (#35): client/zone.ts keeps it in a cookie, and on a first visit,
   before the server has it, writes the page's times and the publish date in it. */

const ID = "019f0000-0000-7000-8000-0000000a0035";
const AT = "2026-10-20T14:30:00Z";

beforeEach(async () => {
  await resetStubs();
  await stubSite();
  await stub("/admin/posts/scheduled", { posts: [post({ id: ID, title: "Tomorrow", publishedAt: AT })], page: 0, totalPages: 1, totalCount: 1 }, { query: { page: 0, size: 20 } });
  await stub(`/posts/${ID}`, {
    id: ID, title: "Tomorrow", slug: "2026/10/tomorrow", markdownSource: "Soon.", excerpt: "Soon.", renderedHtml: "<p>Soon.</p>",
    authorDisplayName: "dreamreal", status: "APPROVED", publishedAt: AT, sortOrder: 0, tags: [], categories: [], versions: [],
  });
});

describe("the reader's zone, in a browser", () => {
  it("is kept in a cookie, and a first visit's times are written in it", async () => {
    const v = await signedIn(ADMIN);
    const { page } = await open("/admin/scheduled", "light", v.cookies, { timezoneId: "America/New_York" });

    await expect.poll(() => page.locator("article.admin-scheduled time").textContent()).toBe("October 20, 2026, 10:30 AM EDT");
    const cookie = (await page.context().cookies()).find((c) => c.name === "bcn-tz");
    expect(decodeURIComponent(cookie?.value || "")).toBe("America/New_York");
    expect(cookie?.sameSite).toBe("Lax");
    // Now the server has it.
    await page.reload();
    expect(await page.locator("article.admin-scheduled time").getAttribute("data-local-zone")).toBe("America/New_York");
    expect(await page.locator("article.admin-scheduled time").textContent()).toBe("October 20, 2026, 10:30 AM EDT");
  });

  it("moves a first visit's publish date onto the reader's clock, with its zone, for saving as seen", async () => {
    const v = await signedIn(ADMIN);
    const { page } = await open(`/edit/${ID}`, "light", v.cookies, { timezoneId: "Asia/Kolkata" });
    const field = page.locator("input[name=publishedAt]");

    await expect.poll(() => field.inputValue()).toBe("2026-10-20T20:00");
    // As the browser names it (Chromium's ICU may say Asia/Calcutta).
    const zone = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
    expect(["Asia/Kolkata", "Asia/Calcutta"]).toContain(zone);
    expect(await page.locator("input[name=publishedZone]").inputValue()).toBe(zone);
    expect(await page.locator("label[for=edit-published]").textContent()).toBe(`Published (${zone})`);
  });

  it("leaves it all accessible, light and dark", async () => {
    const v = await signedIn(ADMIN);
    for (const theme of ["light", "dark"] as const) {
      for (const path of ["/admin/scheduled", `/edit/${ID}`]) {
        const { page } = await open(path, theme, v.cookies, { timezoneId: "America/New_York" });
        await expectAccessible(page);
      }
    }
  });
});
