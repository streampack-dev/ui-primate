import { beforeEach, describe, it } from "vitest";
import { expectAccessible, open, useBrowser } from "../support/browser.ts";
import { list, post, resetStubs, stub, stubSite } from "../support/stub.ts";

useBrowser();

beforeEach(async () => {
  await resetStubs();
  await stubSite();
  await stub("/posts", list([post({ title: "Midden", slug: "2026/09/midden", excerpt: "Reads heap dumps." })]), { query: { page: 0, size: 5 } });
  await stub("/posts/2026/09/midden", { id: "x", title: "Midden", slug: "2026/09/midden", excerpt: "Reads heap dumps.", publishedAt: "2026-09-21T15:00:00Z" });
});

describe("the link-preview gallery, in a browser", () => {
  it("is accessible, light and dark, its cards drawn", async () => {
    for (const theme of ["light", "dark"] as const) {
      const { page } = await open("/og-preview", theme);
      await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth === 1200));
      await expectAccessible(page);
    }
  });
});
