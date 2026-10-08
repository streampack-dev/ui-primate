import { beforeEach, describe, expect, it } from "vitest";
import { text } from "../support/page.ts";
import { ADMIN, signedIn } from "../support/readers.ts";
import { requests, resetStubs, stub, stubSite } from "../support/stub.ts";
import { Visitor } from "../support/visitor.ts";

/* The log filter (ui-pudl#202): a day's every line, as ever, or the conversation only, without
   joins, parts, quits, nick changes and topics: `?events=none` on any log address, and the API's
   `events=none` behind it. The stub /logs honours it as the API does. */

const JAVA = "irc://libera/%23java";
const KOTLIN = "irc://libera/%23kotlin";
const DAY = "2026-09-30";
const TODAY = new Date().toISOString().slice(0, 10);
const PAGE = `/logs/irc/libera/java/${DAY}`;

function channel(uri: string, path: string | null) {
  return { provenanceUri: uri, protocol: "irc", serviceId: "libera", replyTo: uri, latestTimestamp: "2026-09-30T20:00:00Z", latestSender: "ada", latestContentPreview: "morning", path };
}

const entry = (time: string, sender: string, content: string, kind?: string) =>
  ({ timestamp: `${DAY}T${time}Z`, sender, content, direction: "INBOUND", ...(kind ? { kind } : {}) });

const EVERYTHING = [
  entry("09:00:00", "pebble", "* pebble joined #java", "JOIN"),
  entry("09:00:05", "ada", "morning", "MESSAGE"),
  // A line without a kind is something said: the field is optional.
  entry("09:00:10", "grace", "hello there"),
  entry("09:01:00", "pebble", "* pebble is now known as rock", "NICK"),
];
const SAID = EVERYTHING.filter((e) => !e.kind || e.kind === "MESSAGE");

/** [uri]'s [day], as the API answers it: every line, or with events=none what was said only. */
async function stubDay(uri: string, day: string, every: unknown[], said: unknown[], when?: Record<string, string>) {
  await stub("/logs", { provenanceUri: uri, day, entries: every }, { query: { provenance: uri, day }, when });
  await stub("/logs", { provenanceUri: uri, day, entries: said }, { query: { provenance: uri, day, events: "none" }, when });
}

const asked = async (path: string) => (await requests()).filter((r) => r.path === path);

beforeEach(async () => {
  await resetStubs();
  await stubSite();
  await stub("/logs/provenances", { provenances: [channel(JAVA, "irc/libera/java"), channel(KOTLIN, null)] });
  await stubDay(JAVA, DAY, EVERYTHING, SAID);
});

describe("the log filter", () => {
  it("shows everything by default, asking the API for every line, its events marked", async () => {
    const { status, doc } = await new Visitor().get(PAGE);

    expect(status).toBe(200);
    expect((await asked("/logs")).map((r) => r.query)).toEqual([{ provenance: JAVA, day: DAY }]);
    const lines = doc.querySelectorAll("li.log-line");
    expect(lines.map((l) => text(l.querySelector(".log-content")))).toEqual(["* pebble joined #java", "morning", "hello there", "* pebble is now known as rock"]);
    expect(lines.map((l) => l.classList.contains("log-event"))).toEqual([true, false, false, true]);
  });

  it("with events=none, asks the API for the conversation only: events hidden, messages kept", async () => {
    const { status, doc } = await new Visitor().get(`${PAGE}?events=none`);

    expect(status).toBe(200);
    expect((await asked("/logs")).map((r) => r.query)).toEqual([{ provenance: JAVA, day: DAY, events: "none" }]);
    const shown = doc.querySelectorAll("li.log-line .log-content").map(text);
    expect(shown).toEqual(["morning", "hello there"]);
    expect(doc.querySelectorAll("li.log-event").length).toBe(0);
  });

  it("keeps the two days apart, filtered and not, one after the other", async () => {
    const v = new Visitor();
    expect((await v.get(PAGE)).doc.querySelectorAll("li.log-line").length).toBe(4);
    expect((await v.get(`${PAGE}?events=none`)).doc.querySelectorAll("li.log-line").length).toBe(2);
    expect((await v.get(PAGE)).doc.querySelectorAll("li.log-line").length).toBe(4);
  });

  it("offers both as real links, the one shown marked current", async () => {
    const plain = (await new Visitor().get(PAGE)).doc.querySelectorAll("nav.log-filter a");
    expect(plain.map((a) => [text(a), a.getAttribute("href"), a.getAttribute("aria-current")]))
      .toEqual([["Everything", PAGE, "page"], ["Conversation only", `${PAGE}?events=none`, undefined]]);
    expect(plain[0].classList.contains("is-current")).toBe(true);

    const filtered = (await new Visitor().get(`${PAGE}?events=none`)).doc.querySelectorAll("nav.log-filter a");
    expect(filtered.map((a) => [a.getAttribute("href"), a.getAttribute("aria-current")]))
      .toEqual([[PAGE, undefined], [`${PAGE}?events=none`, "page"]]);
  });

  it("offers it on today's address too, which stays today's", async () => {
    await stubDay(JAVA, TODAY, [], []);
    const { doc } = await new Visitor().get("/logs/irc/libera/java?events=none");

    expect(doc.querySelectorAll("nav.log-filter a").map((a) => a.getAttribute("href")))
      .toEqual(["/logs/irc/libera/java", "/logs/irc/libera/java?events=none"]);
    expect((await asked("/logs")).at(-1)?.query).toEqual({ provenance: JAVA, day: TODAY, events: "none" });
    expect(text(doc.querySelector("main") ?? doc)).toContain("Nothing was said this day.");
  });

  it("keeps the filter on the days either side, the lines' own links and the other channels", async () => {
    const { doc } = await new Visitor().get(`${PAGE}?events=none`);

    expect(doc.querySelector("a[rel=prev]")?.getAttribute("href")).toBe("/logs/irc/libera/java/2026-09-29?events=none");
    expect(doc.querySelector("a[rel=next]")?.getAttribute("href")).toBe("/logs/irc/libera/java/2026-10-01?events=none");
    expect(doc.querySelector("a.log-time")?.getAttribute("href")).toBe(`${PAGE}?events=none#l-090005`);
    expect(doc.querySelectorAll("nav.log-channels a").map((a) => a.getAttribute("href")))
      .toEqual([`${PAGE}?events=none`, `/logs?${new URLSearchParams({ provenance: KOTLIN, day: DAY, events: "none" })}`]);
  });

  it("leaves the unfiltered day's links as they were", async () => {
    const { doc } = await new Visitor().get(PAGE);

    expect(doc.querySelector("a[rel=prev]")?.getAttribute("href")).toBe("/logs/irc/libera/java/2026-09-29");
    expect(doc.querySelector("a.log-time")?.getAttribute("href")).toBe(`${PAGE}#l-090000`);
    expect(doc.querySelector("form.log-search input[name=events]")).toBeNull();
  });

  it("shows everything for any other events, as without it", async () => {
    for (const events of ["all", "bogus", ""]) {
      const { status, doc } = await new Visitor().get(`${PAGE}?events=${events}`);
      expect(status, events).toBe(200);
      expect(doc.querySelectorAll("li.log-line").length, events).toBe(4);
    }
    expect((await asked("/logs")).every((r) => !("events" in r.query))).toBe(true);
  });

  it("is kept by the query form's move to the readable address, and on a channel without one", async () => {
    expect(await new Visitor().get(`/logs?${new URLSearchParams({ provenance: JAVA, day: DAY, events: "none" })}`))
      .toMatchObject({ status: 301, location: `${PAGE}?events=none` });
    expect(await new Visitor().get(`/logs?${new URLSearchParams({ provenance: JAVA, events: "none" })}`))
      .toMatchObject({ status: 301, location: "/logs/irc/libera/java?events=none" });

    await stubDay(KOTLIN, DAY, EVERYTHING, SAID);
    const kotlin = `/logs?${new URLSearchParams({ provenance: KOTLIN, day: DAY })}`;
    const { status, doc } = await new Visitor().get(`${kotlin}&events=none`);
    expect(status).toBe(200);
    expect(doc.querySelectorAll("li.log-line").length).toBe(2);
    expect(doc.querySelector("a.log-time")?.getAttribute("href")).toBe(`${kotlin}&events=none#l-090005`);
    expect(doc.querySelectorAll("nav.log-filter a").map((a) => a.getAttribute("href"))).toEqual([kotlin, `${kotlin}&events=none`]);
  });

  it("is kept when another spelling of the address is sent to the API's", async () => {
    await stub("/logs/channels/irc/libera/%23java", { provenanceUri: JAVA, path: "irc/libera/java" });

    expect(await new Visitor().get(`/logs/irc/libera/%23java/${DAY}?events=none`))
      .toMatchObject({ status: 301, location: `${PAGE}?events=none` });
  });
});

describe("searching from a filtered day", () => {
  const hits = { provenanceUri: JAVA, page: 0, size: 50, totalCount: 120, totalPages: 3, hits: [{ timestamp: `${DAY}T09:00:05Z`, day: DAY, sender: "ada", content: "morning", direction: "INBOUND", kind: "MESSAGE" }] };

  beforeEach(async () => {
    await stub("/logs/search", hits, { query: { provenance: JAVA } });
  });

  it("is offered by a form that keeps the filter", async () => {
    const { doc } = await new Visitor().get(`${PAGE}?events=none`);
    expect(doc.querySelector("form.log-search input[name=events]")?.getAttribute("value")).toBe("none");
  });

  it("asks the API for what was said only, and its lines open their day filtered", async () => {
    const { status, doc } = await new Visitor().get("/logs/irc/libera/java/search?q=morning&events=none");

    expect(status).toBe(200);
    expect((await asked("/logs/search"))[0].query).toEqual({ provenance: JAVA, q: "morning", events: "none", page: "0", size: "50" });
    expect(doc.querySelector("a.log-hit-when")?.getAttribute("href")).toBe(`${PAGE}?events=none#l-090005`);
    expect(doc.querySelector("a[rel=next]")?.getAttribute("href")).toBe("/logs/irc/libera/java/search?q=morning&events=none&page=2");
    expect(doc.querySelector("form.log-search input[name=events]")?.getAttribute("value")).toBe("none");
    expect(text(doc.querySelector(".log-search-heading"))).toContain("(conversation only)");
  });

  it("is kept by the query form's move to the readable search", async () => {
    expect(await new Visitor().get(`/logs/search?${new URLSearchParams({ provenance: JAVA, q: "morning", events: "none" })}`))
      .toMatchObject({ status: 301, location: "/logs/irc/libera/java/search?q=morning&events=none" });
  });

  it("leaves an unfiltered search as it was", async () => {
    const { doc } = await new Visitor().get("/logs/irc/libera/java/search?q=morning");

    expect((await asked("/logs/search"))[0].query).toEqual({ provenance: JAVA, q: "morning", page: "0", size: "50" });
    expect(doc.querySelector("a.log-hit-when")?.getAttribute("href")).toBe(`${PAGE}#l-090005`);
    expect(doc.querySelector("form.log-search input[name=events]")).toBeNull();
  });
});

describe("the admin day view, filtered", () => {
  const L1 = "019f0000-0000-7000-8000-0000000f0001";
  const L2 = "019f0000-0000-7000-8000-0000000f0002";
  const L3 = "019f0000-0000-7000-8000-0000000f0003";
  const L4 = "019f0000-0000-7000-8000-0000000f0004";
  const ADMIN_DAY = `/admin/moderation/logs?${new URLSearchParams({ provenance: JAVA, day: DAY })}`;
  const line = (id: string, e: { timestamp: string; sender: string; content: string }, hidden = false) =>
    ({ id, timestamp: e.timestamp, day: DAY, sender: e.sender, content: e.content, direction: "INBOUND", hidden, flagged: false, cited: false });
  // The moderation day has no kinds: a join, two lines said, and a hidden one the public log leaves out.
  const LINES = [
    line(L1, EVERYTHING[0]),
    line(L2, EVERYTHING[1]),
    line(L3, EVERYTHING[2]),
    line(L4, entry("09:02:00", "mallory", "* mallory has quit"), true),
  ];
  const AS_ADMIN = { authorization: "Bearer access-1" };

  beforeEach(async () => {
    await stub("/admin/moderation/logs", { provenanceUri: JAVA, day: DAY, lines: LINES }, { query: { provenance: JAVA, day: DAY } });
  });

  it("keeps the lines the public conversation has, and every hidden line", async () => {
    await stubDay(JAVA, DAY, EVERYTHING, SAID, AS_ADMIN);
    const v = await signedIn(ADMIN);
    const { status, doc } = await v.get(`${ADMIN_DAY}&events=none`);

    expect(status).toBe(200);
    expect(doc.querySelectorAll("li.mod-line").map((li) => li.getAttribute("id"))).toEqual([`line-${L2}`, `line-${L3}`, `line-${L4}`]);
    expect((await asked("/logs")).at(-1)?.query).toEqual({ provenance: JAVA, day: DAY, events: "none" });
    expect(doc.querySelector("form.mod-lines-form input[name=events]")?.getAttribute("value")).toBe("none");
    expect(doc.querySelector("a.log-day-link[rel=prev]")?.getAttribute("href")).toBe(`/admin/moderation/logs?${new URLSearchParams({ provenance: JAVA, day: "2026-09-29", events: "none" })}`);
    expect(doc.querySelectorAll("nav.log-filter a").map((a) => [a.getAttribute("href"), a.getAttribute("aria-current")]))
      .toEqual([[ADMIN_DAY, undefined], [`${ADMIN_DAY}&events=none`, "page"]]);
  });

  it("shows every line when the public day can't be read", async () => {
    await stub("/logs", { detail: "down" }, { query: { provenance: JAVA, day: DAY, events: "none" }, status: 500 });
    const v = await signedIn(ADMIN);
    const { status, doc } = await v.get(`${ADMIN_DAY}&events=none`);

    expect(status).toBe(200);
    expect(doc.querySelectorAll("li.mod-line").length).toBe(4);
  });

  it("shows every line unfiltered, without asking the public log", async () => {
    const v = await signedIn(ADMIN);
    const { doc } = await v.get(ADMIN_DAY);

    expect(doc.querySelectorAll("li.mod-line").length).toBe(4);
    expect(await asked("/logs")).toEqual([]);
    expect(doc.querySelector("form.mod-lines-form input[name=events]")).toBeNull();
  });

  it("comes back to the filtered day after a step", async () => {
    await stub("/admin/moderation/lines/hide", { action: { id: L1, reportId: null, action: "HIDE", lineIds: [], actor: "ed", actedAt: "2026-10-06T05:00:00Z" }, changed: 1 }, { method: "POST" });
    const v = await signedIn(ADMIN);
    const hid = await v.post("/admin/moderation/lines/hide", [["provenance", JAVA], ["day", DAY], ["events", "none"], ["line", L2]]);

    expect(hid.location).toBe(`${ADMIN_DAY}&events=none&done=hidden&n=1`);
  });

  it("is a step from the filtered public day", async () => {
    await stubDay(JAVA, DAY, EVERYTHING, SAID, AS_ADMIN);
    const v = await signedIn(ADMIN);
    expect((await v.get(`${PAGE}?events=none`)).doc.querySelector("a.log-moderate")?.getAttribute("href")).toBe(`${ADMIN_DAY}&events=none`);
  });
});
