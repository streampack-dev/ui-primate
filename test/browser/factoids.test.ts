import { beforeEach, describe, expect, it } from "vitest";
import { expectAccessible, open, useBrowser } from "../support/browser.ts";
import { signedIn } from "../support/readers.ts";
import { requests, resetStubs, stub, stubSite } from "../support/stub.ts";

useBrowser();

beforeEach(async () => {
  await resetStubs();
  await stubSite();
  await stub("/factoids", { factoids: [
    { selector: "spring", locked: true, updatedBy: "ada", updatedAt: "2026-10-01T02:30:00Z", accessCount: 12, text: "a framework", tags: ["jvm"] },
  ], page: 0, totalPages: 2, totalCount: 21 }, { query: { page: 0 } });
  await stub("/factoids/spring", { selector: "spring", locked: true, updatedBy: "ada", updatedAt: "2026-10-01T02:30:00Z", accessCount: 42, attributes: [
    { type: "text", value: "a framework", rendered: "" }, { type: "seealso", value: "boot", rendered: "" }, { type: "urls", value: "https://spring.io", rendered: "" },
  ] });
});

describe("the knowledge base, in a browser", () => {
  it("is accessible, light and dark: the list, a factoid, a missing one", async () => {
    for (const theme of ["light", "dark"] as const) {
      for (const path of ["/factoids", "/factoids/spring", "/factoids/missing"]) {
        const { page } = await open(path, theme);
        await expectAccessible(page);
      }
    }
  });
});

describe("changing the knowledge base, in a browser (#170)", () => {
  const BOOT = "/factoids/spring%20boot";
  const boot = (text: string) => ({ selector: "spring boot", locked: false, updatedBy: "ada", updatedAt: "2026-10-01T02:30:00Z", accessCount: 42,
    attributes: [{ type: "text", value: text, rendered: "" }] });

  it("is accessible, light and dark, with the editor and the teaching forms open", async () => {
    await stub(BOOT, boot("an opinionated layer."));
    const v = await signedIn();
    for (const theme of ["light", "dark"] as const) {
      const { page } = await open(BOOT, theme, v.cookies);
      await page.click("details.factoid-edit summary");
      await expectAccessible(page);
      const list = await open("/factoids", theme, v.cookies);
      await list.page.click("details.factoid-teach summary");
      await expectAccessible(list.page);
      await expectAccessible((await open("/factoids/missing", theme, v.cookies)).page);
    }
  });

  it("saves in place, and forgets after asking in a dialog", async () => {
    await stub(BOOT, boot("an opinionated layer."));
    await stub(BOOT, boot("Spring, opinionated."), { method: "PUT" });
    await stub(BOOT, {}, { method: "DELETE", status: 204 });
    const v = await signedIn();
    const { page, errors } = await open(BOOT, "light", v.cookies);
    const documents: string[] = [];
    page.on("request", (r) => { if (r.resourceType() === "document") documents.push(r.url()); });

    await page.click("details.factoid-edit summary");
    await page.fill("textarea[name=text]", "Spring, opinionated.");
    await stub(BOOT, boot("Spring, opinionated."));
    await page.click("details.factoid-edit button[type=submit]");
    await page.getByText("spring boot is Spring, opinionated.").waitFor();
    expect((await requests()).some((r) => r.method === "PUT" && r.path === BOOT)).toBe(true);

    await page.click("details.factoid-edit summary");
    await page.click("a.factoid-forget");
    await page.waitForSelector("dialog.confirm-dialog[open]");
    await page.click("dialog.confirm-dialog button[type=submit]");
    await page.waitForURL(/\/factoids$/);
    expect((await requests()).some((r) => r.method === "DELETE" && r.path === BOOT)).toBe(true);
    expect(documents).toEqual([]);
    expect(errors).toEqual([]);
  });
});
