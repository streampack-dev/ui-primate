import { beforeEach, describe, expect, it } from "vitest";
import { expectAccessible, open, useBrowser } from "../support/browser.ts";
import { signedIn } from "../support/readers.ts";
import { list, post, resetStubs, stub, stubSite } from "../support/stub.ts";

useBrowser();

const ADA = "019c5c8a-609d-7cd4-975b-50bbcc412a33";

beforeEach(async () => {
  await resetStubs();
  await stubSite();
  await stub("/posts", { posts: [post({ authorId: ADA, authorDisplayName: "ada", tags: ["jvm"] })], page: 0, totalPages: 2, totalCount: 21 }, { query: { author: ADA } });
  await stub("/posts", { posts: [post({ authorId: ADA, authorDisplayName: "ada" })], page: 0, totalPages: 1, totalCount: 1 }, { query: { category: "Guides" } });
});

describe("an author's page, in a browser", () => {
  it("is where a byline goes", async () => {
    const { page } = await open("/category/Guides");
    await page.click("article.post-row .byline a.author-link");
    await page.waitForURL(`**/authors/${ADA}`);
    expect(await page.textContent("main h1")).toBe("ada");
  });

  it("is accessible, light and dark", async () => {
    for (const theme of ["light", "dark"] as const) {
      const { page } = await open(`/authors/${ADA}`, theme);
      await expectAccessible(page);
    }
  });

  it("leaves the profile accessible with the reader's posts listed", async () => {
    await stub("/auth/posts", list([
      post({ title: "Out now", state: "PUBLISHED" }),
      post({ title: "Half done", state: "DRAFT", publishedAt: null }),
    ]), { query: { page: 0, size: 20 } });
    const v = await signedIn();
    for (const theme of ["light", "dark"] as const) {
      const { page } = await open("/profile", theme, v.cookies);
      await page.waitForSelector("li.own-post");
      await expectAccessible(page);
    }
  });
});
