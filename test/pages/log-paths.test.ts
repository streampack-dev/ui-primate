import { beforeEach, describe, expect, it } from "vitest";
import { text } from "../support/page.ts";
import { resetStubs, stub, stubSite } from "../support/stub.ts";
import { Visitor } from "../support/visitor.ts";

/* Readable log addresses (#16, streampack#147): /logs/irc/libera/java and its days and search. */

const JAVA = "irc://libera/%23java";
const KOTLIN = "irc://libera/%23kotlin";
const TODAY = new Date().toISOString().slice(0, 10);
const DAY = "2026-09-30";

function channel(uri: string, path: string | null) {
  return { provenanceUri: uri, protocol: "irc", serviceId: "libera", replyTo: uri, latestTimestamp: "2026-09-30T20:00:00Z", latestSender: "ada", latestContentPreview: "morning", path };
}

async function stubDay(uri: string, day: string, entries: unknown[]) {
  await stub("/logs", { provenanceUri: uri, day, entries }, { query: { provenance: uri, day } });
}

beforeEach(async () => {
  await resetStubs();
  await stubSite();
  await stub("/logs/provenances", { provenances: [channel(JAVA, "irc/libera/java"), channel(KOTLIN, null)] });
});

describe("a channel's readable address", () => {
  it("is what the channel list links to, with the day", async () => {
    await stubDay(JAVA, DAY, []);
    const { doc } = await new Visitor().get(`/logs?day=${DAY}`);
    const links = doc.querySelectorAll("nav.log-channels a");

    expect(links[0].getAttribute("href")).toBe(`/logs/irc/libera/java/${DAY}`);
    // A channel the API gives no address keeps the query form.
    expect(links[1].getAttribute("href")).toBe(`/logs?${new URLSearchParams({ provenance: KOTLIN, day: DAY })}`);
  });

  it("shows that day's log, with its lines linked at that address and the days either side", async () => {
    await stubDay(JAVA, DAY, [{ timestamp: "2026-09-30T03:04:05Z", sender: "ada", content: "hello", direction: "INBOUND" }]);
    const { status, doc } = await new Visitor().get(`/logs/irc/libera/java/${DAY}`);

    expect(status).toBe(200);
    expect(text(doc.querySelector(".log-lines"))).toContain("hello");
    expect(doc.querySelector("a.log-time")?.getAttribute("href")).toBe(`/logs/irc/libera/java/${DAY}#l-030405`);
    expect(doc.querySelector("a[rel=prev]")?.getAttribute("href")).toBe("/logs/irc/libera/java/2026-09-29");
    expect(doc.querySelector("a[rel=next]")?.getAttribute("href")).toBe("/logs/irc/libera/java/2026-10-01");
  });

  it("without a day, shows today's", async () => {
    await stubDay(JAVA, TODAY, [{ timestamp: `${TODAY}T00:00:01Z`, sender: "ada", content: "first light", direction: "INBOUND" }]);
    const { status, doc } = await new Visitor().get("/logs/irc/libera/java");

    expect(status).toBe(200);
    expect(text(doc.querySelector(".log-lines"))).toContain("first light");
  });

  it("is where the query form sends a reader, for good", async () => {
    expect(await new Visitor().get(`/logs?${new URLSearchParams({ provenance: JAVA, day: DAY })}`))
      .toMatchObject({ status: 301, location: `/logs/irc/libera/java/${DAY}` });
    expect(await new Visitor().get(`/logs?${new URLSearchParams({ provenance: JAVA })}`))
      .toMatchObject({ status: 301, location: "/logs/irc/libera/java" });
  });

  it("is where another spelling of it is sent, as the API resolves it", async () => {
    await stub("/logs/channels/irc/libera/%23java", { provenanceUri: JAVA, path: "irc/libera/java" });

    expect(await new Visitor().get(`/logs/irc/libera/%23java/${DAY}`))
      .toMatchObject({ status: 301, location: `/logs/irc/libera/java/${DAY}` });
  });

  it("names no channel when the API knows none, or a day that isn't one", async () => {
    expect((await new Visitor().get("/logs/irc/libera/nowhere")).status).toBe(404);
    expect((await new Visitor().get("/logs/irc/libera/java/2026-02-30")).status).toBe(404);
    expect((await new Visitor().get("/logs/irc/libera")).status).toBe(404);
  });
});

describe("a channel's search, at its readable address", () => {
  it("searches the channel and links each hit to its day there", async () => {
    await stub("/logs/search", {
      provenanceUri: JAVA, query: "hello", page: 0, size: 50, totalCount: 1, totalPages: 1,
      hits: [{ timestamp: "2026-09-30T03:04:05Z", day: DAY, sender: "ada", content: "hello there", direction: "INBOUND" }],
    }, { query: { provenance: JAVA, q: "hello" } });
    const { status, doc } = await new Visitor().get("/logs/irc/libera/java/search?q=hello");

    expect(status).toBe(200);
    expect(doc.querySelector("form.log-search")?.getAttribute("action")).toBe("/logs/irc/libera/java/search");
    expect(doc.querySelector("form.log-search input[name=provenance]")).toBeNull();
    expect(doc.querySelector(".log-hit a, a[href*='#l-']")?.getAttribute("href")).toBe(`/logs/irc/libera/java/${DAY}#l-030405`);
  });

  it("is where the query form's search sends a reader, for good", async () => {
    expect(await new Visitor().get(`/logs/search?${new URLSearchParams({ provenance: JAVA, q: "hello" })}`))
      .toMatchObject({ status: 301, location: "/logs/irc/libera/java/search?q=hello" });
  });

  it("is offered on the channel's day by a form that searches there", async () => {
    await stubDay(JAVA, DAY, []);
    const { doc } = await new Visitor().get(`/logs/irc/libera/java/${DAY}`);

    expect(doc.querySelector("form.log-search")?.getAttribute("action")).toBe("/logs/irc/libera/java/search");
  });
});
