import { beforeEach, describe, it } from "vitest";
import { expectAccessible, open, useBrowser } from "../support/browser.ts";
import { ADMIN, signedIn } from "../support/readers.ts";
import { resetStubs, stub, stubSite } from "../support/stub.ts";

useBrowser();

const JAVA = "irc://libera/%23java";
const DAY = "2026-09-30";

beforeEach(async () => {
  await resetStubs();
  await stubSite();
  const channel = (uri: string) => ({ provenanceUri: uri, protocol: "irc", replyTo: uri, latestTimestamp: "2026-09-30T20:00:00Z", latestSender: "ada", latestContentPreview: "morning all" });
  await stub("/logs/provenances", { provenances: [channel(JAVA), channel("irc://libera/%23kotlin")] });
  await stub("/logs", {
    provenanceUri: JAVA, day: DAY,
    entries: [
      { timestamp: "2026-09-30T09:00:00Z", sender: "unknown", content: "ada joined", direction: "INBOUND" },
      { timestamp: "2026-09-30T09:00:05Z", sender: "ada", content: "morning, see https://openjdk.org/jeps/444", direction: "INBOUND" },
      { timestamp: "2026-09-30T09:01:00Z", sender: "javabot", content: "JEP 444: Virtual Threads", direction: "OUTBOUND" },
    ],
  }, { query: { provenance: JAVA, day: DAY } });
});

describe("today's log, in a browser", () => {
  // Today has no next day: its "Next" is greyed out, and must still be readable.
  for (const theme of ["light", "dark"] as const) {
    it(`passes axe in the ${theme} theme, with no next day to go to`, async () => {
      await stub("/logs", { provenanceUri: JAVA, day: "today", entries: [] }, { query: { provenance: JAVA } });
      const { page } = await open(`/logs?provenance=${encodeURIComponent(JAVA)}`, theme);
      await page.locator(".log-day-link.is-disabled").waitFor();
      await expectAccessible(page);
    });
  }
});

describe("the logs, in a browser", () => {
  it("are accessible, light and dark, for an admin, with a line linked to", async () => {
    const v = await signedIn(ADMIN);
    await stub("/logs/provenances", { provenances: [{ provenanceUri: JAVA, protocol: "irc", replyTo: JAVA }] }, { when: { authorization: "Bearer access-1" } });
    await stub("/logs", { provenanceUri: JAVA, day: DAY, entries: [{ timestamp: "2026-09-30T09:00:05Z", sender: "ada", content: "morning", direction: "INBOUND" }] },
      { query: { provenance: JAVA, day: DAY }, when: { authorization: "Bearer access-1" } });
    for (const theme of ["light", "dark"] as const) {
      const { page } = await open(`/logs?${new URLSearchParams({ provenance: JAVA, day: DAY })}#l-090005`, theme, v.cookies);
      await expectAccessible(page);
    }
  });

  it("are accessible to anyone, light and dark", async () => {
    for (const theme of ["light", "dark"] as const) {
      const { page } = await open(`/logs?${new URLSearchParams({ provenance: JAVA, day: DAY })}`, theme);
      await expectAccessible(page);
    }
  });
});
