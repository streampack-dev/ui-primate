import { beforeEach, describe, expect, it } from "vitest";
import { expectAccessible, open, useBrowser } from "../support/browser.ts";
import { ADMIN, signedIn } from "../support/readers.ts";
import { post, resetStubs, stub, stubSite } from "../support/stub.ts";

useBrowser();

const user = (username: string, role = "USER") => ({ id: `019f0000-0000-7000-8000-${username.padStart(12, "0").slice(-12)}`, username, displayName: username.toUpperCase(), role });

beforeEach(async () => {
  await resetStubs();
  await stubSite();
  await stub("/admin/posts/pending", { posts: [post({ title: "Midden", excerpt: "Reads heap dumps.", categories: ["Guides"] })], page: 0, totalPages: 2, totalCount: 21 }, { query: { page: 0, size: 20, deleted: "false" } });
  await stub("/admin/posts/pending", { posts: [post()], page: 0, totalPages: 1, totalCount: 4 }, { query: { page: 0, size: 1, deleted: "false" } });
  await stub("/admin/posts/scheduled", { posts: [post({ title: "Tomorrow's post", publishedAt: "2026-10-20T09:00:00Z", versionKinds: ["audio"] })], page: 0, totalPages: 2, totalCount: 21 }, { query: { page: 0, size: 20 } });
  await stub("/admin/posts/scheduled", { posts: [post()], page: 0, totalPages: 1, totalCount: 1 }, { query: { page: 0, size: 1 } });
  await stub("/posts", { posts: [post()], page: 0, totalPages: 9, totalCount: 120 }, { query: { page: 0, size: 1 } });
  await stub("/admin/users", [user("ada"), user("ed", "SUPER_ADMIN")], { query: { status: "ACTIVE" } });
  await stub("/admin/users", [user("mallory")], { query: { status: "SUSPENDED" } });
  await stub("/categories", [{ id: "019f0000-0000-7000-8000-0000000c0001", name: "Guides", parentName: null }, { id: "019f0000-0000-7000-8000-0000000c0003", name: "JVM", parentName: "Guides" }]);
  await stub("/taxonomy", { tags: { jvm: 12, kotlin: 30 }, categories: { guides: 7, jvm: 3 } });
});

describe("the header, signed in as an admin, on a phone", () => {
  it("is one row that fits the screen, its menu holding Sign out, and stays accessible", async () => {
    const v = await signedIn(ADMIN);
    for (const theme of ["light", "dark"] as const) {
      for (const path of ["/", "/admin", "/admin/scheduled"]) {
        const { page } = await open(path, theme, v.cookies, { viewport: { width: 390, height: 844 } });
        // One row: the account is in the menu (#95), which opens within the screen.
        await page.locator("header summary[aria-label=Menu]").click();
        const fit = await page.evaluate(() => {
          const header = document.querySelector("header")!;
          const account = [...header.querySelectorAll(".hmenu-sheet a[href='/admin'], .hmenu-sheet a[href='/profile'], .hmenu-sheet form[action='/logout'] button")]
            .map((item) => item.getBoundingClientRect());
          return { header: header.scrollWidth, row: header.getBoundingClientRect().height, page: document.documentElement.scrollWidth, account };
        });
        expect(fit.header, `${path} header width`).toBeLessThanOrEqual(390);
        expect(fit.row, `${path} header height`).toBeLessThanOrEqual(64);
        expect(fit.page, `${path} page width`).toBeLessThanOrEqual(390);
        expect(fit.account, `${path} Admin, Profile and Sign out`).toHaveLength(3);
        for (const box of fit.account) {
          expect(box.width, path).toBeGreaterThan(0);
          expect(box.right, path).toBeLessThanOrEqual(390);
        }
        await expectAccessible(page);
      }
    }
  });
});

describe("the admin pages, in a browser", () => {
  it("are accessible, light and dark", async () => {
    const v = await signedIn(ADMIN);
    for (const theme of ["light", "dark"] as const) {
      for (const path of ["/admin", "/admin/pending", "/admin/scheduled", "/admin/users", "/admin/users?status=SUSPENDED&done=unsuspended&who=mallory", "/admin/categories", "/admin/users/ada/suspend"]) {
        const { page } = await open(path, theme, v.cookies);
        await expectAccessible(page);
      }
    }
  }, 60_000);
});
