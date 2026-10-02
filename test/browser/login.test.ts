import { beforeEach, describe, it } from "vitest";
import { expectAccessible, open, useBrowser } from "../support/browser.ts";
import { stubSignIn } from "../support/readers.ts";
import { resetStubs, stubSite } from "../support/stub.ts";

useBrowser();

beforeEach(async () => {
  await resetStubs();
  await stubSite({ authentication: { otp: true, otpFrom: "noreply@bytecode.news" } });
  await stubSignIn();
});

describe("signing in, in a browser", () => {
  it("is accessible, light and dark, at both steps", async () => {
    for (const theme of ["light", "dark"] as const) {
      const { page } = await open("/login", theme);
      await expectAccessible(page);
      await page.fill("#login-email", "joe@example.com");
      await page.click("form[action='/login/code'] button[type=submit]");
      await page.waitForSelector("#login-code");
      await expectAccessible(page);
    }
  });
});
