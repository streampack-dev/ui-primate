import { beforeEach, describe, expect, it } from "vitest";
import { expectAccessible, open, useBrowser } from "../support/browser.ts";
import { ADMIN, signedIn } from "../support/readers.ts";
import { requests, resetStubs, stub, stubSite } from "../support/stub.ts";

useBrowser();

const SLUG = "2026/09/midden";
const POST = "019f0000-0000-7000-8000-000000000001";
const COMMENT = "019f0000-0000-7000-8000-0000000e0002";

beforeEach(async () => {
  await resetStubs();
  await stubSite();
  await stub(`/posts/${SLUG}`, {
    id: POST, title: "Midden", slug: SLUG, excerpt: "Midden.", renderedHtml: "<p>Midden.</p>", authorDisplayName: "dreamreal",
    publishedAt: "2026-10-01T02:30:00Z", tags: [], categories: [],
  });
  await stub(`/posts/${SLUG}/comments`, {
    totalActiveCount: 1,
    comments: [{ id: COMMENT, authorDisplayName: "alice", renderedHtml: "<p>Nice.</p>", createdAt: "2026-10-01T12:00:00Z", deleted: false, editable: false, children: [] }],
  });
  await stub(`/posts/${POST}`, { id: POST, title: "Midden", slug: SLUG, status: "DRAFT", markdownSource: "Midden.", tags: [], categories: [] });
  await stub("/categories", []);
});

const deletes = async (path: string) => (await requests()).filter((r) => r.method === "DELETE" && r.path === path);

describe("a question asked first, with script", () => {
  it("is asked in a dialog over the page, which stays where it was", async () => {
    const v = await signedIn(ADMIN);
    const { page } = await open(`/posts/${SLUG}`, "light", v.cookies);
    const link = page.locator(`#comment-${COMMENT} a.comment-remove`);
    expect(await link.getAttribute("data-confirm")).not.toBeNull();
    await link.click();

    const dialog = page.locator("dialog.confirm-dialog[open]");
    await dialog.waitFor();
    expect(await dialog.locator("h2").textContent()).toBe("Remove this comment?");
    expect(page.url()).toMatch(/\/posts\/2026\/09\/midden$/);
  });

  it("goes ahead from the dialog, as the page's own form would", async () => {
    await stub(`/admin/comments/${COMMENT}`, {}, { method: "DELETE" });
    const v = await signedIn(ADMIN);
    const { page } = await open(`/posts/${SLUG}`, "light", v.cookies);
    await page.click(`#comment-${COMMENT} a.comment-remove`);
    await page.locator("dialog.confirm-dialog[open] button[type=submit]").click();
    await page.waitForURL(/#comments$/);

    expect((await deletes(`/admin/comments/${COMMENT}`)).length).toBe(1);
  });

  it("closes on Cancel or Escape, sending nothing, and puts the reader back where they were", async () => {
    const v = await signedIn(ADMIN);
    const { page } = await open(`/posts/${SLUG}`, "light", v.cookies);
    const link = page.locator(`#comment-${COMMENT} a.comment-remove`);

    await link.click();
    await page.locator("dialog.confirm-dialog[open] .confirm-cancel").click();
    await expect.poll(() => page.locator("dialog.confirm-dialog[open]").count()).toBe(0);
    expect(await link.evaluate((el) => el === document.activeElement)).toBe(true);

    await link.click();
    await page.locator("dialog.confirm-dialog[open]").waitFor();
    await page.keyboard.press("Escape");
    await expect.poll(() => page.locator("dialog.confirm-dialog[open]").count()).toBe(0);
    expect(await deletes(`/admin/comments/${COMMENT}`)).toEqual([]);
  });

  it("moves on to a harder question in the same dialog", async () => {
    await stub(`/admin/comments/${COMMENT}`, {}, { method: "DELETE" });
    const v = await signedIn(ADMIN);
    const { page } = await open(`/posts/${SLUG}`, "light", v.cookies);
    await page.click(`#comment-${COMMENT} a.comment-remove`);
    await page.locator("dialog.confirm-dialog[open] a[data-confirm]").click();
    await expect.poll(() => page.locator("dialog.confirm-dialog[open] h2").textContent()).toContain("cannot be undone");
    expect(await page.locator("dialog.confirm-dialog").count()).toBe(1);

    await page.locator("dialog.confirm-dialog[open] button[type=submit]").click();
    await page.waitForURL(/#comments$/);
    expect((await deletes(`/admin/comments/${COMMENT}`))[0].query.hard).toBe("true");
  });

  it("carries its field: approving a draft asks when, in the dialog", async () => {
    await stub(`/admin/posts/${POST}/approve`, {}, { method: "PUT" });
    const v = await signedIn(ADMIN);
    const { page } = await open(`/edit/${POST}`, "light", v.cookies);
    await page.click(`a[href='/edit/${POST}/approve']`);
    const field = page.locator("dialog.confirm-dialog[open] input[name=publishedAt]");
    await field.fill("2026-10-03T09:00");
    await page.locator("dialog.confirm-dialog[open] button[type=submit]").click();
    await page.waitForURL(/\?approved$/);

    const put = (await requests()).find((r) => r.method === "PUT" && r.path === `/admin/posts/${POST}/approve`)!;
    expect(put.body).toEqual({ publishedAt: "2026-10-03T09:00:00.000Z" });
  });

  it("is asked for the admin pages' steps too", async () => {
    await stub("/admin/users", [{ id: "u1", username: "ada", displayName: "ADA", role: "USER" }], { query: { status: "ACTIVE" } });
    const v = await signedIn(ADMIN);
    const { page } = await open("/admin/users", "light", v.cookies);
    await page.click("a[href='/admin/users/ada/suspend']");
    expect(await page.locator("dialog.confirm-dialog[open] h2").textContent()).toBe("Suspend ada?");
  });

  it("is accessible, light and dark", async () => {
    const v = await signedIn(ADMIN);
    for (const theme of ["light", "dark"] as const) {
      const { page } = await open(`/edit/${POST}`, theme, v.cookies);
      await page.click(`a[href='/edit/${POST}/approve']`);
      await page.locator("dialog.confirm-dialog[open]").waitFor();
      await expectAccessible(page);
    }
  });
});
