import { beforeEach, describe, expect, it } from "vitest";
import { expectAccessible, open, useBrowser } from "../support/browser.ts";
import { ADMIN, signedIn } from "../support/readers.ts";
import { requests, resetStubs, stub, stubSite } from "../support/stub.ts";

useBrowser();

const JAVA = "irc://libera/%23java";
const REPORT = "019f0000-0000-7000-8000-0000000e0001";
const L1 = "019f0000-0000-7000-8000-0000000f0001";
const L2 = "019f0000-0000-7000-8000-0000000f0002";
const report = {
  id: REPORT, provenanceUri: JAVA, protocol: "irc", serviceId: "libera", channel: "#java", sender: "mallory", userId: null,
  score: 4.5, signals: { SLUR: 2 }, verdict: null, status: "OPEN", windowStart: "2026-10-06T03:04:05Z", windowEnd: "2026-10-06T03:09:00Z",
  createdAt: "2026-10-06T03:10:00Z", actedBy: null, actedAt: null,
};
const line = (id: string, time: string, sender: string, content: string, hidden = false) => ({
  id, timestamp: `2026-10-06T${time}Z`, day: "2026-10-06", sender, content, direction: "INBOUND", hidden, flagged: !hidden, cited: false,
  // Why it was flagged (streampack#169), drawn beside its mark: weak, so it isn't checked to begin with.
  signals: hidden ? null : ["AIMED_HOSTILITY", "REPETITION"], weight: hidden ? null : 2, strong: hidden ? null : false,
});
const lines = [line(L1, "03:03:00", "ada", "morning", true), line(L2, "03:04:05", "mallory", "you are all idiots")];

beforeEach(async () => {
  await resetStubs();
  await stubSite();
  await stub("/admin/moderation/reports", { page: 0, size: 20, totalCount: 1, totalPages: 1, openCount: 1, reports: [report] });
  await stub(`/admin/moderation/reports/${REPORT}`, { report, lines, purgedLineIds: [], actions: [] });
  await stub("/admin/moderation/logs", { provenanceUri: JAVA, day: "2026-10-06", lines });
});

describe("the moderation pages, in a browser", () => {
  it("are accessible, light and dark", async () => {
    const v = await signedIn(ADMIN);
    for (const theme of ["light", "dark"] as const) {
      for (const path of ["/admin/moderation", `/admin/moderation/${REPORT}?done=hidden&n=2`, `/admin/moderation/logs?provenance=${encodeURIComponent(JAVA)}&day=2026-10-06`, `/admin/moderation/logs?provenance=${encodeURIComponent(JAVA)}&day=2026-10-06&events=none`]) {
        const { page } = await open(path, theme, v.cookies);
        await expectAccessible(page);
      }
    }
  });

  it("unhide the checked lines by their own button, not the form's Hide", async () => {
    await stub(`/admin/moderation/reports/${REPORT}/unhide`, { action: { id: REPORT, action: "UNHIDE", lineIds: [L1], actor: "ed", actedAt: "2026-10-06T05:00:00Z" }, changed: 1 }, { method: "POST" });
    const v = await signedIn(ADMIN);
    const { page } = await open(`/admin/moderation/${REPORT}`, "light", v.cookies);
    await page.check(`#pick-${L1}`);
    await page.getByRole("button", { name: "Unhide selected" }).click();
    await page.waitForURL(/done=unhidden/);
    const posted = (await requests()).filter((r) => r.method === "POST" && r.path.startsWith("/admin/moderation/"));
    expect(posted.map((r) => [r.path, r.body])).toEqual([[`/admin/moderation/reports/${REPORT}/unhide`, { lineIds: [L1] }]]);
  });
});
