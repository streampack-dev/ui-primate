import { beforeEach, describe, expect, it } from "vitest";
import { text } from "../support/page.ts";
import { ADMIN, signedIn } from "../support/readers.ts";
import { requests, resetStubs, stub, stubSite } from "../support/stub.ts";
import { Visitor } from "../support/visitor.ts";

/* The logs in the instance's log zone (#36, streampack#212): /features names it as logs.zone, the
   API's days are split at its midnight, and the pages show its days and times, each line's time on
   the reader's clock in its tooltip. A server that doesn't name one is UTC's, and says so. */
const JAVA = "irc://libera/%23java";
const PAGE = "/logs/irc/libera/java";
const NY = { logs: { zone: "America/New_York" } };
// 03:00 UTC on the 6th is 23:00 on the 5th in New York (EDT).
const AT = "2026-10-06T03:00:00Z";
const L1 = "019f0000-0000-7000-8000-0000000f0361";
const REPORT = "019f0000-0000-7000-8000-0000000e0361";

const entry = (timestamp: string, sender: string, content: string) => ({ timestamp, sender, content, direction: "INBOUND" });
const visitor = (zone?: string) => {
  const v = new Visitor();
  if (zone) v.cookies.set("bcn-tz", encodeURIComponent(zone));
  return v;
};

beforeEach(async () => {
  await resetStubs();
  await stubSite(NY);
  await stub("/logs/provenances", { provenances: [{ provenanceUri: JAVA, protocol: "irc", serviceId: "libera", path: "irc/libera/java" }] });
  await stub("/logs", { provenanceUri: JAVA, day: "2026-10-05", entries: [entry("2026-10-05T04:00:00Z", "ada", "first light"), entry(AT, "grace", "late one")] },
    { query: { provenance: JAVA, day: "2026-10-05" } });
});

describe("a log day, in the log's zone", () => {
  it("is labelled with the zone, its lines at their times there, anchored as ever by their UTC second", async () => {
    const { status, doc } = await visitor().get(`${PAGE}/2026-10-05`);
    const lines = doc.querySelectorAll(".log-line");

    expect(status).toBe(200);
    expect(text(doc.querySelector(".dateline"))).toBe("Monday, October 5, 2026 (America/New_York)");
    expect(lines.map((l) => text(l.querySelector("a.log-time")))).toEqual(["00:00:00", "23:00:00"]);
    expect(lines[1].getAttribute("id")).toBe("l-030000");
    expect(lines[1].querySelector("a.log-time")?.getAttribute("href")).toBe(`${PAGE}/2026-10-05#l-030000`);
    expect(lines[1].querySelector("time")?.getAttribute("datetime")).toBe(AT);
  });

  it("gives each line's time on the reader's clock in its tooltip, UTC until the reader's zone is known", async () => {
    const time = async (zone?: string) => (await visitor(zone).get(`${PAGE}/2026-10-05`)).doc.querySelectorAll(".log-line time")[1];

    expect((await time("Asia/Kolkata")).getAttribute("title")).toBe("Your time: 2026-10-06 08:30:00 GMT+5:30");
    expect((await time("America/New_York")).getAttribute("title")).toBe("Your time: 2026-10-05 23:00:00 EDT");
    const first = await time();
    expect(first.getAttribute("title")).toBe("Your time: 2026-10-06 03:00:00 UTC");
    // For client/zone.ts to write again in the browser's zone.
    expect(first.hasAttribute("data-local-title")).toBe(true);
  });

  it("is today's in the log's zone when no day is asked for", async () => {
    await stub("/logs", { provenanceUri: JAVA, day: "today", entries: [] }, { query: { provenance: JAVA } });
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    await visitor().get(PAGE);

    expect((await requests()).filter((r) => r.path === "/logs").at(-1)?.query.day).toBe(today);
  });

  it("stays UTC's from a server that names no zone, and says so", async () => {
    await resetStubs();
    await stubSite();
    await stub("/logs/provenances", { provenances: [{ provenanceUri: JAVA, protocol: "irc", serviceId: "libera", path: "irc/libera/java" }] });
    await stub("/logs", { provenanceUri: JAVA, day: "2026-10-06", entries: [entry(AT, "grace", "late one")] }, { query: { provenance: JAVA, day: "2026-10-06" } });
    const { doc } = await visitor("America/New_York").get(`${PAGE}/2026-10-06`);

    expect(text(doc.querySelector(".dateline"))).toBe("Tuesday, October 6, 2026 (UTC)");
    expect(text(doc.querySelector(".log-line a.log-time"))).toBe("03:00:00");
    expect(doc.querySelector(".log-line time")?.getAttribute("title")).toBe("Your time: 2026-10-05 23:00:00 EDT");
  });
});

describe("a log search, in the log's zone", () => {
  it("shows each hit at its time there, linking to its day as the API gives it", async () => {
    await stub("/logs/search", { provenanceUri: JAVA, page: 0, size: 50, totalCount: 1, totalPages: 1, hits: [{ ...entry(AT, "grace", "late one"), day: "2026-10-05" }] },
      { query: { provenance: JAVA } });
    const { doc } = await visitor("Asia/Kolkata").get(`${PAGE}/search?q=late`);
    const when = doc.querySelector("a.log-hit-when")!;

    expect(text(doc.querySelector(".dateline"))).toBe("Search (America/New_York)");
    expect(text(when)).toBe("Oct 5, 2026, 23:00");
    expect(when.getAttribute("href")).toBe(`${PAGE}/2026-10-05#l-030000`);
    expect(when.querySelector("time")?.getAttribute("title")).toBe("Your time: 2026-10-06 08:30:00 GMT+5:30");
  });
});

describe("moderation, in the log's zone", () => {
  const line = { id: L1, timestamp: AT, day: "2026-10-05", sender: "mallory", content: "late one", direction: "INBOUND", hidden: false, flagged: true, cited: false };

  it("shows a report's lines at their times there, linking to their public log anchors", async () => {
    await stub(`/admin/moderation/reports/${REPORT}`, {
      report: {
        id: REPORT, provenanceUri: JAVA, protocol: "irc", serviceId: "libera", channel: "#java", sender: "mallory", userId: null, score: 4, signals: {}, verdict: null,
        status: "OPEN", windowStart: AT, windowEnd: AT, createdAt: AT, actedBy: null, actedAt: null,
      },
      lines: [line], purgedLineIds: [], actions: [],
    });
    const v = await signedIn(ADMIN);
    v.cookies.set("bcn-tz", "UTC");
    const { doc } = await v.get(`/admin/moderation/${REPORT}`);
    const link = doc.querySelector("li.mod-line a.log-time")!;

    expect(text(link)).toBe("23:00:00");
    expect(link.getAttribute("href")).toBe(`${PAGE}/2026-10-05#l-030000`);
    expect(link.querySelector("time")?.getAttribute("title")).toBe("Your time: 2026-10-06 03:00:00 UTC");
    expect(text(doc.querySelector("h3.section-label"))).toBe("The lines, with their context (America/New_York)");
    expect(doc.querySelector("a.mod-day-public")?.getAttribute("href")).toBe(`${PAGE}/2026-10-05`);
  });

  it("shows the admin day in the zone, said beside it", async () => {
    await stub("/admin/moderation/logs", { provenanceUri: JAVA, day: "2026-10-05", lines: [line] }, { query: { provenance: JAVA, day: "2026-10-05" } });
    const v = await signedIn(ADMIN);
    const { doc } = await v.get(`/admin/moderation/logs?provenance=${encodeURIComponent(JAVA)}&day=2026-10-05`);

    expect(text(doc.querySelector(".log-day"))).toBe("#java · 2026-10-05 (America/New_York)");
    expect(text(doc.querySelector("li.mod-line a.log-time"))).toBe("23:00:00");
  });
});
