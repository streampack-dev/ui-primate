import { beforeEach, describe, expect, it } from "vitest";
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

describe("searching a channel's log, in a browser (#4)", () => {
  // A long day, so the line found is well below the fold.
  const long = Array.from({ length: 300 }, (_, i) => {
    const t = `${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}:00`;
    return { timestamp: `${DAY}T${t}Z`, sender: "ada", content: `line ${i}`, direction: "INBOUND" };
  });

  it("searches in place, and a line found opens its day there", async () => {
    await stub("/logs", { provenanceUri: JAVA, day: DAY, entries: long }, { query: { provenance: JAVA, day: DAY } });
    await stub("/logs/search", {
      provenanceUri: JAVA, page: 0, size: 50, totalCount: 1, totalPages: 1,
      hits: [{ timestamp: `${DAY}T04:10:00Z`, day: DAY, sender: "ada", content: "line 250", direction: "INBOUND" }],
    }, { query: { provenance: JAVA, q: "line 250" } });
    const { page, errors } = await open(`/logs?${new URLSearchParams({ provenance: JAVA, day: DAY })}`);
    const documents: string[] = [];
    page.on("request", (r) => { if (r.resourceType() === "document") documents.push(r.url()); });

    await page.fill("form.log-search input[name=q]", "line 250");
    await page.press("form.log-search input[name=q]", "Enter");
    await page.waitForURL(/\/logs\/search\?/);
    await page.click("li.log-hit a.log-hit-when");
    await page.waitForURL(/#l-041000$/);

    await expect.poll(() => page.evaluate(() => {
      const box = document.getElementById("l-041000")!.getBoundingClientRect();
      return box.top >= 0 && box.bottom <= window.innerHeight;
    })).toBe(true);
    expect(documents).toEqual([]);
    expect(errors).toEqual([]);
  });

  it("passes axe, light and dark, with results and refused", async () => {
    await stub("/logs/search", {
      provenanceUri: JAVA, page: 0, size: 50, totalCount: 1, totalPages: 1,
      hits: [{ timestamp: `${DAY}T09:00:05Z`, day: DAY, sender: "ada", content: "morning", direction: "INBOUND" }],
    }, { query: { provenance: JAVA } });
    for (const theme of ["light", "dark"] as const) {
      for (const q of ["morning", "mo"]) {
        const { page } = await open(`/logs/search?${new URLSearchParams({ provenance: JAVA, q })}`, theme);
        await expectAccessible(page);
      }
    }
  });
});

describe("the log filter, in a browser (ui-pudl#202)", () => {
  const day = (entries: unknown[], query: Record<string, string>) => stub("/logs", { provenanceUri: JAVA, day: DAY, entries }, { query });

  beforeEach(async () => {
    const every = [
      { timestamp: "2026-09-30T09:00:00Z", sender: "ada", content: "* ada joined #java", direction: "INBOUND", kind: "JOIN" },
      { timestamp: "2026-09-30T09:00:05Z", sender: "ada", content: "morning all", direction: "INBOUND", kind: "MESSAGE" },
      { timestamp: "2026-09-30T09:00:09Z", sender: "bob", content: "* bob has quit", direction: "INBOUND", kind: "QUIT" },
    ];
    await day(every, { provenance: JAVA, day: DAY });
    await day(every.filter((e) => e.kind === "MESSAGE"), { provenance: JAVA, day: DAY, events: "none" });
  });

  it("shows the conversation only when asked, and keeps it through a reload", async () => {
    const { page, errors } = await open(`/logs?${new URLSearchParams({ provenance: JAVA, day: DAY })}`);
    await expect.poll(() => page.locator("li.log-line").count()).toBe(3);

    await page.getByRole("link", { name: "Conversation only" }).click();
    await page.waitForURL(/[?&]events=none/);
    await expect.poll(() => page.locator("li.log-line").count()).toBe(1);
    expect(await page.locator("nav.log-filter a[aria-current=page]").textContent()).toBe("Conversation only");

    await page.reload();
    await expect.poll(() => page.locator("li.log-line").count()).toBe(1);
    expect(await page.locator("li.log-line .log-content").textContent()).toBe("morning all");
    expect(await page.locator("a[rel=prev]").getAttribute("href")).toContain("events=none");

    await page.getByRole("link", { name: "Everything" }).click();
    await expect.poll(() => page.locator("li.log-line").count()).toBe(3);
    expect(page.url()).not.toContain("events=");
    expect(errors).toEqual([]);
  });

  for (const theme of ["light", "dark"] as const) {
    it(`passes axe in the ${theme} theme, filtered and not, its events marked`, async () => {
      for (const query of ["", "&events=none"]) {
        const { page } = await open(`/logs?${new URLSearchParams({ provenance: JAVA, day: DAY })}${query}`, theme);
        await page.locator("nav.log-filter").waitFor();
        await expectAccessible(page);
      }
    });
  }
});

describe("the logs in the instance's log zone, in a browser (#36)", () => {
  // 03:00 UTC on the 1st of October is 23:00 on the 30th of September in New York.
  beforeEach(async () => {
    await stubSite({ logs: { zone: "America/New_York" } });
    await stub("/logs", { provenanceUri: JAVA, day: DAY, entries: [{ timestamp: "2026-10-01T03:00:00Z", sender: "ada", content: "late one", direction: "INBOUND" }] },
      { query: { provenance: JAVA, day: DAY } });
  });

  it("writes each line's tooltip on the reader's clock on a first visit", async () => {
    const { page, errors } = await open(`/logs?${new URLSearchParams({ provenance: JAVA, day: DAY })}`, "light", new Map(), { timezoneId: "Asia/Kolkata" });
    const time = page.locator("li.log-line time");

    expect(await time.textContent()).toBe("23:00:00");
    await expect.poll(() => time.getAttribute("title")).toBe("Your time: 2026-10-01 08:30:00 GMT+5:30");
    expect(errors).toEqual([]);
  });

  for (const theme of ["light", "dark"] as const) {
    it(`passes axe in the ${theme} theme`, async () => {
      const { page } = await open(`/logs?${new URLSearchParams({ provenance: JAVA, day: DAY })}`, theme, new Map(), { timezoneId: "America/New_York" });
      await page.locator("li.log-line time[data-local-zone]").waitFor();
      await expectAccessible(page);
    });
  }
});
