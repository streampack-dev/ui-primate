import { beforeEach, describe, expect, it } from "vitest";
import { expectAccessible, open, useBrowser } from "../support/browser.ts";
import { requests, resetStubs, stub, stubSite } from "../support/stub.ts";

useBrowser();

beforeEach(async () => {
  await resetStubs();
  await stubSite();
  await stub("/categories", [{ id: "019f0000-0000-7000-8000-0000000c0001", name: "Guides", slug: "guides" }]);
  await stub("/posts", { id: "019f0000-0000-7000-8000-0000000d0001", title: "Midden", status: "DRAFT" }, { method: "POST", status: 201 });
  await stub("/posts/derive-tags", { tags: ["heap"] }, { method: "POST" });
});

describe("the submission form, in a browser", () => {
  it("submits the post when Enter is pressed in the title, rather than running a helper", async () => {
    const { page } = await open("/submit");
    await page.fill("#submit-body", "Midden reads heap dumps.");
    await page.fill("#submit-title", "Midden");
    await page.press("#submit-title", "Enter");
    await page.waitForURL("**/submit/thanks");

    const posted = (await requests()).filter((r) => r.method === "POST").map((r) => r.path);
    expect(posted).toEqual(["/posts"]);
  });

  it("is accessible, light and dark, and with a helper's word shown", async () => {
    for (const theme of ["light", "dark"] as const) {
      const { page } = await open("/submit", theme);
      await expectAccessible(page);
      await page.fill("#submit-title", "Midden");
      await page.fill("#submit-body", "Midden reads heap dumps.");
      await page.click("button[value=suggest-tags]");
      await page.waitForSelector("#helper-tags .form-status");
      await expectAccessible(page);
    }
  });
});
