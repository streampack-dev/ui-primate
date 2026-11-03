import { beforeEach, describe, expect, it } from "vitest";
import { expectAccessible, open, useBrowser } from "../support/browser.ts";
import { ADMIN, signedIn } from "../support/readers.ts";
import { requests, resetStubs, stub, stubSite } from "../support/stub.ts";

useBrowser();

const ID = "019f0000-0000-7000-8000-0000000a0001";

beforeEach(async () => {
  await resetStubs();
  await stubSite();
  await stub(`/posts/${ID}`, {
    id: ID, title: "Midden", slug: "2026/09/midden", markdownSource: "Midden reads **heap dumps**.", excerpt: "Reads heap dumps.",
    status: "DRAFT", publishedAt: null, sortOrder: 0, tags: ["jvm"], categories: ["Guides"],
  });
  await stub("/categories", [{ id: "019f0000-0000-7000-8000-0000000c0001", name: "Guides" }, { id: "019f0000-0000-7000-8000-0000000c0002", name: "_sidebar" }]);
});

describe("the editor, in a browser", () => {
  it("previews as the admin types, asking the API for nothing", async () => {
    const v = await signedIn(ADMIN);
    const { page, errors } = await open(`/edit/${ID}`, "light", v.cookies);
    const before = (await requests()).length;
    await page.fill("#edit-body", "Now with _emphasis_ and a [[factoid]].");
    await page.waitForSelector(".editor-preview em");
    expect(await page.locator(".editor-preview a").getAttribute("href")).toBe("/factoids/factoid");
    expect((await requests()).length).toBe(before);
    expect(errors).toEqual([]);
  });

  it("is accessible, light and dark, and so are its questions", async () => {
    const v = await signedIn(ADMIN);
    for (const theme of ["light", "dark"] as const) {
      for (const path of [`/edit/${ID}`, `/edit/${ID}/approve`, `/edit/${ID}/delete?hard=true`]) {
        const { page } = await open(path, theme, v.cookies);
        await expectAccessible(page);
      }
    }
  });

  // Primate's client draws the answer in place, and Marko keeps a field's live value then (#106).
  it("fills the fields from each helper, not just the words beside it", async () => {
    await stubSite({ ai: true });
    await stub("/posts/derive-tags", { tags: ["heap"] }, { method: "POST" });
    await stub(`/admin/posts/${ID}/derive-tags`, { tags: ["memory"] }, { method: "POST" });
    await stub("/posts/derive-summary", { summary: "A heap-dump reader." }, { method: "POST" });
    const v = await signedIn(ADMIN);
    const { page } = await open(`/edit/${ID}`, "light", v.cookies);
    // What the admin types is kept while the preview is drawn again.
    await page.fill("#edit-tags", "jvm, own");
    await page.fill("#edit-body", "Midden reads _heap dumps_.");
    await page.waitForSelector(".editor-preview em");
    expect(await page.inputValue("#edit-tags")).toBe("jvm, own");

    await page.click("button[value=suggest-tags]");
    await expect.poll(() => page.inputValue("#edit-tags")).toBe("jvm, own, heap");
    await page.click("button[value=ai-tags]");
    await expect.poll(() => page.inputValue("#edit-tags")).toBe("jvm, own, heap, memory");
    await page.click("button[value=derive-summary]");
    await expect.poll(() => page.inputValue("#edit-summary")).toBe("A heap-dump reader.");
  });
});
