import { beforeEach, describe, it } from "vitest";
import { expectAccessible, open, useBrowser } from "../support/browser.ts";
import { signedIn } from "../support/readers.ts";
import { resetStubs, stubSite } from "../support/stub.ts";

useBrowser();

beforeEach(async () => {
  await resetStubs();
  await stubSite();
});

describe("the profile page, in a browser", () => {
  it("is accessible, light and dark, with a refused deletion open", async () => {
    const v = await signedIn();
    for (const theme of ["light", "dark"] as const) {
      const { page } = await open("/profile", theme, v.cookies);
      await expectAccessible(page);
      await page.click(".profile-delete summary");
      await page.fill("#delete-confirm", "someone");
      await page.click(".profile-delete button[type=submit]");
      await page.waitForSelector("#delete-error");
      await expectAccessible(page);
    }
  });
});
