import { beforeEach, describe, expect, it } from "vitest";
import { expectAccessible, open, useBrowser } from "../support/browser.ts";
import { ADMIN, signedIn } from "../support/readers.ts";
import { requests, resetStubs, stub, stubSite } from "../support/stub.ts";

useBrowser();

const E1 = "019f0000-0000-7000-8000-0000000c0001";
const entry = {
  id: E1, tag: "compiler", firstSeen: "2026-10-08T14:00:00Z", source: "post", hintKind: "PLURAL", hintTags: ["compilers"],
  aiCandidate: "compilers", aiConfidence: 0.97, aiReason: "Singular of compilers.", aiModel: "claude-haiku-4-5",
  status: "OPEN", actedBy: null, actedAt: null,
};
const feed = {
  waitingCount: 1, promoteEntries: 3, promoteFeeds: 2, totalCount: 1, totalPages: 1,
  tags: [{
    name: "quarkus", written: ["Quarkus"], status: "WAITING", entries: 2, feeds: 1, firstSeen: "2026-10-08T14:00:00Z", lastSeen: "2026-10-08T15:00:00Z",
    tag: null, decidedBy: null, decidedAt: null,
    examples: [{ entryId: "019f0000-0000-7000-8000-0000000d0001", title: "Quarkus 4", link: "https://example.com/q4", feedTitle: "A blog" }],
  }],
};
const PHONE = { width: 390, height: 844 };

beforeEach(async () => {
  await resetStubs();
  await stubSite();
  await stub("/taxonomy", { tags: { compilers: 3, java: 9 }, categories: {}, factoidTags: {} });
  await stub("/admin/tags/review", { openCount: 1, totalCount: 1, totalPages: 1, entries: [entry] });
  await stub("/admin/rss/tags", feed);
  await stub(`/admin/tags/review/${E1}`, entry);
  await stub("/admin/tags/aliases", [{ alias: "k8s", tag: "kubernetes", createdBy: "ed", createdAt: "2026-10-07T10:00:00Z" }]);
  await stub("/admin/tags/stoplist", [{ term: "self hosted", createdBy: "ed", createdAt: "2026-10-07T11:00:00Z" }]);
  await stub("/admin/tags/actions", [{ action: "ALIAS", subject: "compiler", detail: "compilers", actor: "ed", actedAt: "2026-10-08T18:01:00Z" }]);
  await stub(`/admin/tags/review/${E1}/alias`, { tag: "compiler", now: ["compilers"], posts: 3, factoids: 1 }, { method: "POST", query: { dryRun: "true" } });
});

describe("the tag vocabulary's pages, in a browser", () => {
  const PATHS = ["/admin/tags?done=aliased&t=compiler&to=compilers&p=3&f=1", "/admin/tags/feed", "/admin/tags/aliases", "/admin/tags/stoplist", "/admin/tags/history",
    `/admin/tags/review/${E1}/alias`, `/admin/tags/review/${E1}/split`, "/admin/tags/aliases/new"];
  for (const theme of ["light", "dark"] as const) {
    for (const [size, viewport] of [["wide", undefined], ["on a phone", PHONE]] as const) {
      it(`are accessible, ${theme}, ${size}`, async () => {
        const v = await signedIn(ADMIN);
        for (const path of PATHS) {
          const { page, errors } = await open(path, theme, v.cookies, { viewport });
          await expectAccessible(page);
          expect(errors, path).toEqual([]);
          // The page's own content fits a phone; the header's fit is test/browser/header.test.ts's (#94).
          if (viewport) {
            const wide = await page.evaluate(() => [...document.querySelectorAll("main *")].filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1).map((el) => el.outerHTML.slice(0, 80)));
            expect(wide, `${path} fits a phone`).toEqual([]);
          }
          await page.context().close();
        }
      });
    }
  }

  it("preview as the admin types, offering Confirm only once a preview says it can be done", async () => {
    const v = await signedIn(ADMIN);
    const { page } = await open(`/admin/tags/review/${E1}/alias`, "light", v.cookies);
    const confirm = page.getByRole("button", { name: "Alias to “compilers”" });
    await expect.poll(() => confirm.isEnabled()).toBe(true);

    await stub(`/admin/tags/review/${E1}/alias`, { status: 400, detail: "“nope” isn't a tag." }, { method: "POST", query: { dryRun: "true" }, status: 400 });
    await page.getByLabel("Alias to").fill("nope");
    await expect.poll(() => page.locator("#tag-preview").textContent()).toBe("Not possible: “nope” isn't a tag.");
    expect(await page.locator("form.tag-ask-confirm").isVisible()).toBe(false);

    await stub(`/admin/tags/review/${E1}/alias`, { tag: "compiler", now: ["java"], posts: 1, factoids: 0 }, { method: "POST", query: { dryRun: "true" } });
    await page.getByLabel("Alias to").fill("java");
    const java = page.getByRole("button", { name: "Alias to “java”" });
    await expect.poll(() => java.isVisible()).toBe(true);
    expect(await page.locator("#tag-preview").textContent()).toBe("This re-points 1 post and 0 factoids to “java”.");
    expect(await page.locator("form.tag-ask-confirm input[name=tag]").inputValue()).toBe("java");

    // Confirm posts what was previewed.
    await stub(`/admin/tags/review/${E1}/alias`, { tag: "compiler", now: ["java"], posts: 1, factoids: 0 }, { method: "POST" });
    await java.click();
    await page.waitForURL(/done=aliased/);
    const posted = (await requests()).filter((r) => r.method === "POST" && r.path === `/admin/tags/review/${E1}/alias` && !r.query.dryRun);
    expect(posted.map((r) => r.body)).toEqual([{ tag: "java" }]);
    expect(await page.locator(".tag-notice").textContent()).toContain("“compiler” is now an alias of “java”: 1 post and 0 factoids re-pointed.");
  });
});
