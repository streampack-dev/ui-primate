import { beforeEach, describe, expect, inject, it } from "vitest";
import { text } from "../support/page.ts";
import { ADMIN, signedIn } from "../support/readers.ts";
import { requests, resetStubs, stub, stubSite } from "../support/stub.ts";
import { Visitor } from "../support/visitor.ts";

const JAVA = "irc://libera/%23java";
const KOTLIN = "irc://libera/%23kotlin";
const SLACK = "slack://streampack/general";
const TODAY = new Date().toISOString().slice(0, 10);
const DAY = "2026-09-30";

function channel(uri: string, fields: Record<string, unknown> = {}) {
  return { provenanceUri: uri, protocol: uri.split(":")[0], serviceId: null, replyTo: uri, latestTimestamp: "2026-09-30T20:00:00Z", latestSender: "ada", latestContentPreview: "morning", ...fields };
}

function entry(timestamp: string, sender: string, content: string, direction = "INBOUND") {
  return { timestamp, sender, content, direction };
}

async function stubDay(uri: string, day: string, entries: unknown[], options: { when?: Record<string, string> } = {}) {
  await stub("/logs", { provenanceUri: uri, day, entries }, { query: { provenance: uri, day }, ...options });
}

const logsHref = (uri: string, day: string) => `/logs?${new URLSearchParams({ provenance: uri, day })}`;

beforeEach(async () => {
  await resetStubs();
  await stubSite();
  await stub("/logs/provenances", { provenances: [channel(JAVA), channel(SLACK), channel(KOTLIN)] });
});

describe("the logs", () => {
  it("list the IRC channels by name, each with its latest line, keeping the day", async () => {
    await stubDay(JAVA, DAY, []);
    const { status, doc } = await new Visitor().get(`/logs?day=${DAY}`);
    const links = doc.querySelectorAll("nav.log-channels a");

    expect(status).toBe(200);
    expect(links.map((a) => text(a.querySelector(".log-channel-name")))).toEqual(["#java", "#kotlin"]);
    expect(links[0].getAttribute("href")).toBe(logsHref(JAVA, DAY));
    expect(text(links[0])).toContain("ada: morning");
  });

  it("show the first channel's day when none is chosen, and today when no day is", async () => {
    await stubDay(JAVA, TODAY, [entry(`${TODAY}T00:00:01Z`, "ada", "first light")]);
    const { doc } = await new Visitor().get("/logs");

    expect(doc.querySelector("nav.log-channels a[aria-current=page] .log-channel-name")?.textContent).toBe("#java");
    expect(text(doc.querySelector(".log-lines"))).toContain("first light");
  });

  it("show a day's lines: the time in UTC, linking to the line itself, who said it and what", async () => {
    await stubDay(KOTLIN, DAY, [
      entry("2026-09-30T03:04:05Z", "ada", "hello"),
      entry("2026-09-30T03:04:05.500Z", "grace", "hi"),
    ]);
    const { doc } = await new Visitor().get(logsHref(KOTLIN, DAY));
    const lines = doc.querySelectorAll(".log-line");

    expect(lines.map((l) => l.getAttribute("id"))).toEqual(["l-030405", "l-030405-2"]);
    // The app runs in New York; the log's day is UTC's.
    expect(text(lines[0].querySelector("a.log-time"))).toBe("03:04:05");
    expect(lines[0].querySelector("a.log-time")?.getAttribute("href")).toBe(`${logsHref(KOTLIN, DAY)}#l-030405`);
    expect(text(lines[0].querySelector(".log-sender"))).toBe("ada");
    expect(text(lines[1].querySelector(".log-content"))).toBe("hi");
  });

  it("make web addresses links, leaving trailing punctuation and everything else as text", async () => {
    await stubDay(JAVA, DAY, [entry("2026-09-30T10:00:00Z", "ada", "see https://openjdk.org/jeps/444, <b>not bold</b> javascript:alert(1)")]);
    const { doc, html } = await new Visitor().get(logsHref(JAVA, DAY));
    const content = doc.querySelector(".log-content")!;

    expect(content.querySelectorAll("a").map((a) => a.getAttribute("href"))).toEqual(["https://openjdk.org/jeps/444"]);
    expect(content.querySelector("a")?.getAttribute("rel")).toContain("nofollow");
    expect(text(content)).toBe("see https://openjdk.org/jeps/444, <b>not bold</b> javascript:alert(1)");
    expect(html).not.toContain("<b>not bold</b>");
  });

  it("show a line from no one (a join, a part) as the channel's own", async () => {
    await stubDay(JAVA, DAY, [entry("2026-09-30T10:00:00Z", "unknown", "ada joined")]);
    const { doc } = await new Visitor().get(logsHref(JAVA, DAY));
    const line = doc.querySelector(".log-line")!;

    expect(line.classList.contains("log-system")).toBe(true);
    expect(line.querySelector(".log-sender")).toBeNull();
  });

  it("go back a day, and forward a day but not past today", async () => {
    await stubDay(JAVA, DAY, []);
    await stubDay(JAVA, TODAY, []);
    const earlier = (await new Visitor().get(logsHref(JAVA, DAY))).doc;
    const today = (await new Visitor().get(logsHref(JAVA, TODAY))).doc;

    expect(earlier.querySelector("a[rel=prev]")?.getAttribute("href")).toBe(logsHref(JAVA, "2026-09-29"));
    expect(earlier.querySelector("a[rel=next]")?.getAttribute("href")).toBe(logsHref(JAVA, "2026-10-01"));
    expect(today.querySelector("a[rel=next]")).toBeNull();
  });

  it("say so for a day with nothing in it", async () => {
    await stubDay(JAVA, DAY, []);
    expect(text((await new Visitor().get(logsHref(JAVA, DAY))).doc.querySelector("main"))).toContain("No entries for this day.");
    // The API has no log for the day at all.
    expect(text((await new Visitor().get(logsHref(JAVA, "2026-09-01"))).doc.querySelector("main"))).toContain("No entries for this day.");
  });

  it("aren't found for a day that's malformed or still to come", async () => {
    expect((await new Visitor().get(logsHref(JAVA, "yesterday"))).status).toBe(404);
    expect((await new Visitor().get(logsHref(JAVA, "2999-01-01"))).status).toBe(404);
  });

  it("show only channels the reader is offered, whatever's asked for", async () => {
    await stubDay(JAVA, DAY, []);
    const { doc } = await new Visitor().get(logsHref("irc://elsewhere/%23secret", DAY));

    expect(doc.querySelector("nav.log-channels a[aria-current=page] .log-channel-name")?.textContent).toBe("#java");
    expect((await requests()).some((r) => r.path === "/logs" && r.query.provenance?.includes("secret"))).toBe(false);
  });

  it("say they're unavailable when the API can't list the channels and none were kept", async () => {
    // A signed-in reader's channels are never kept, so there's nothing to fall back on.
    await stub("/logs/provenances", { detail: "down" }, { status: 503, when: { authorization: "Bearer access-1" } });
    const { status, doc } = await (await signedIn()).get("/logs");

    expect(status).toBe(503);
    expect(text(doc.querySelector("main"))).toContain("Logs Unavailable");
  });

  it("keep the channels when a day can't be had", async () => {
    // A day no one has asked for, so none was kept.
    await stub("/logs", { detail: "down" }, { query: { provenance: JAVA, day: "2026-08-15" }, status: 503 });
    const { doc } = await new Visitor().get(logsHref(JAVA, "2026-08-15"));

    expect(doc.querySelectorAll("nav.log-channels a").length).toBe(2);
    expect(text(doc.querySelector(".log-error"))).toContain("couldn't be loaded");
  });

  it("are titled with the channel and the day", async () => {
    await stubDay(JAVA, DAY, []);
    const { doc } = await new Visitor().get(logsHref(JAVA, DAY));
    expect(text(doc.querySelector("title"))).toBe("#java, September 30, 2026 | ByteCode.News");
  });
});

describe("the logs for a signed-in reader", () => {
  it("are read as the reader, who may see channels others can't, and kept private", async () => {
    await stub("/logs/provenances", { provenances: [channel(JAVA), channel("irc://libera/%23ops")] }, { when: { authorization: "Bearer access-1" } });
    await stubDay("irc://libera/%23ops", DAY, [entry("2026-09-30T10:00:00Z", "ed", "members only")], { when: { authorization: "Bearer access-1" } });
    const v = await signedIn();
    const { doc } = await v.get(logsHref("irc://libera/%23ops", DAY));

    expect(text(doc.querySelector(".log-lines"))).toContain("members only");
    const response = await fetch(`${inject("appUrl")}/logs`, { headers: { Cookie: `session_id=${v.cookies.get("session_id")}` } });
    expect(response.headers.get("cache-control")).toContain("private");
  });

  it("offer an admin every protocol's channels, when asked", async () => {
    await stubDay(JAVA, DAY, []);
    const admin = await signedIn(ADMIN);
    const plain = (await admin.get(`/logs?day=${DAY}`)).doc;
    expect(plain.querySelector("a.log-all")?.getAttribute("href")).toBe(`/logs?day=${DAY}&all=1`);

    const all = (await admin.get(`/logs?day=${DAY}&all=1`)).doc;
    expect(all.querySelectorAll("nav.log-channels .log-channel-name").map((n) => n.textContent)).toEqual(["#java", "general", "#kotlin"]);
    expect(all.querySelector("nav.log-channels a")?.getAttribute("href")).toContain("all=1");
  });

  it("offer everyone else IRC's alone, even when they ask for all", async () => {
    await stubDay(JAVA, DAY, []);
    const reader = await signedIn();
    const { doc } = await reader.get(`/logs?day=${DAY}&all=1`);

    expect(doc.querySelector("a.log-all")).toBeNull();
    expect(doc.querySelectorAll("nav.log-channels .log-channel-name").map((n) => n.textContent)).toEqual(["#java", "#kotlin"]);
  });
});
