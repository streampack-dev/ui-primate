import { beforeEach, describe, it } from "vitest";
import { expectAccessible, open, useBrowser } from "../support/browser.ts";
import { resetStubs, stub, stubSite } from "../support/stub.ts";

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
