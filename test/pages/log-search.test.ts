import { beforeEach, describe, expect, it } from "vitest";
import { text } from "../support/page.ts";
import { signedIn } from "../support/readers.ts";
import { requests, resetStubs, stub, stubSite } from "../support/stub.ts";
import { Visitor } from "../support/visitor.ts";

/* Searching a channel's logs (#4), through streampack's GET /logs/search. */
const JAVA = "irc://libera/%23java";
const OPS = "irc://libera/%23ops";
const DAY = "2026-09-30";

function channel(uri: string) {
  return { provenanceUri: uri, protocol: "irc", serviceId: null, replyTo: uri, latestTimestamp: "2026-09-30T20:00:00Z", latestSender: "ada", latestContentPreview: "morning" };
}

function hit(timestamp: string, sender: string, content: string) {
  return { timestamp, day: timestamp.slice(0, 10), sender, content, direction: "INBOUND" };
}

const found = (hits: unknown[], totalCount = hits.length, totalPages = 1) =>
  ({ provenanceUri: JAVA, page: 0, size: 50, totalCount, totalPages, hits });

const searchHref = (fields: Record<string, string>) => `/logs/search?${new URLSearchParams({ provenance: JAVA, ...fields })}`;

beforeEach(async () => {
  await resetStubs();
  await stubSite();
  await stub("/logs/provenances", { provenances: [channel(JAVA)] });
  await stub("/logs", { provenanceUri: JAVA, day: DAY, entries: [] }, { query: { provenance: JAVA, day: DAY } });
  await stub("/logs/search", found([
    hit("2026-09-30T03:04:05Z", "dreamreal", "the rover <b>lands</b> https://example.org/rover."),
    hit("2026-09-20T09:00:00Z", "nexen", "rover? what rover"),
  ]), { query: { provenance: JAVA } });
});

describe("a channel's log", () => {
  it("offers a search of the channel", async () => {
    const { doc } = await new Visitor().get(`/logs?${new URLSearchParams({ provenance: JAVA, day: DAY })}`);
    const form = doc.querySelector("form.log-search")!;

    expect(form.getAttribute("action")).toBe("/logs/search");
    expect(form.getAttribute("method")).toBe("get");
    expect(form.querySelector("input[name=provenance]")!.getAttribute("value")).toBe(JAVA);
    expect(form.querySelector("input[name=q]")!.getAttribute("minlength")).toBe("3");
    expect(form.querySelector("input[name=from]")).not.toBeNull();
  });
});

describe("searching a channel's logs", () => {
  it("asks the API for the text and the nick, and lists each line found, linking to it on its day", async () => {
    const { status, doc } = await new Visitor().get(searchHref({ q: "rover", from: "dreamreal" }));

    expect(status).toBe(200);
    const asked = (await requests()).find((r) => r.path === "/logs/search")!;
    expect(asked.query).toEqual({ provenance: JAVA, q: "rover", sender: "dreamreal", page: "0", size: "50" });
    expect(text(doc.querySelector(".log-search-heading"))).toBe("“rover” from dreamreal in #java · 2 lines");
    const hits = doc.querySelectorAll("li.log-hit");
    expect(hits.length).toBe(2);
    expect(hits[0].querySelector("a.log-hit-when")!.getAttribute("href")).toBe(`/logs?${new URLSearchParams({ provenance: JAVA, day: DAY })}#l-030405`);
    expect(text(hits[0].querySelector(".log-sender"))).toBe("dreamreal");
    // What was said is text and links, never markup.
    expect(text(hits[0].querySelector(".log-content"))).toBe("the rover <b>lands</b> https://example.org/rover.");
    expect(hits[0].querySelector(".log-content b")).toBeNull();
    expect(hits[0].querySelector(".log-content a")!.getAttribute("href")).toBe("https://example.org/rover");
    expect(hits[1].querySelector("a.log-hit-when")!.getAttribute("href")).toContain("day=2026-09-20#l-090000");
    // The form keeps what was asked.
    expect(doc.querySelector("form.log-search input[name=q]")!.getAttribute("value")).toBe("rover");
    expect(doc.querySelector("form.log-search input[name=from]")!.getAttribute("value")).toBe("dreamreal");
  });

  it("lists what someone said, with a nick alone", async () => {
    await new Visitor().get(searchHref({ from: "nexen" }));

    const asked = (await requests()).find((r) => r.path === "/logs/search")!;
    expect(asked.query.sender).toBe("nexen");
    expect(asked.query.q).toBeUndefined();
  });

  it("pages, keeping the search", async () => {
    await stub("/logs/search", found([hit("2026-09-01T01:02:03Z", "nexen", "rover again")], 120, 3), { query: { provenance: JAVA, page: "1" } });
    const { doc } = await new Visitor().get(searchHref({ q: "rover", page: "2" }));

    expect((await requests()).find((r) => r.path === "/logs/search")!.query.page).toBe("1");
    expect(doc.querySelector("a.pagelink[rel=prev]")!.getAttribute("href")).toBe(searchHref({ q: "rover" }));
    expect(doc.querySelector("a.pagelink[rel=next]")!.getAttribute("href")).toBe(searchHref({ q: "rover", page: "3" }));
  });

  it("refuses a query too short before asking, in the API's words", async () => {
    const { status, doc } = await new Visitor().get(searchHref({ q: "ro" }));

    expect(status).toBe(400);
    expect(text(doc.querySelector("[role=alert]"))).toBe("Search for 3 to 200 characters.");
    expect((await requests()).some((r) => r.path === "/logs/search")).toBe(false);
  });

  it("shows the API's refusal, as it words it", async () => {
    await stub("/logs/search", { title: "Too Many Requests", status: 429, detail: "Too many searches; try again shortly." }, { query: { provenance: JAVA, q: "busy" }, status: 429 });
    const { status, doc } = await new Visitor().get(searchHref({ q: "busy" }));

    expect(status).toBe(429);
    expect(text(doc.querySelector("[role=alert]"))).toBe("Too many searches; try again shortly.");
  });

  it("says when nothing matched", async () => {
    await stub("/logs/search", found([]), { query: { provenance: JAVA, q: "zebra" } });
    const { doc } = await new Visitor().get(searchHref({ q: "zebra" }));

    expect(doc.querySelectorAll("li.log-hit").length).toBe(0);
    expect(text(doc.querySelector("main") ?? doc)).toContain("No lines in #java match");
  });

  it("searches only a channel the reader is offered", async () => {
    const { status } = await new Visitor().get(`/logs/search?${new URLSearchParams({ provenance: OPS, q: "secret" })}`);

    expect(status).toBe(404);
    expect((await requests()).some((r) => r.path === "/logs/search")).toBe(false);
  });

  it("goes to the channel's log with nothing to look for", async () => {
    const { status, location } = await new Visitor().get(searchHref({ q: " " }));

    expect(status).toBe(303);
    expect(location).toBe(`/logs?${new URLSearchParams({ provenance: JAVA })}`);
  });

  it("searches a members' channel as the signed-in reader", async () => {
    await stub("/logs/provenances", { provenances: [channel(JAVA), channel(OPS)] }, { when: { authorization: "Bearer access-1" } });
    await stub("/logs/search", found([hit("2026-09-30T10:00:00Z", "ed", "psst")]), { query: { provenance: OPS }, when: { authorization: "Bearer access-1" } });
    const v = await signedIn();

    const { doc } = await v.get(`/logs/search?${new URLSearchParams({ provenance: OPS, q: "psst" })}`);

    expect(text(doc.querySelector("li.log-hit .log-content"))).toBe("psst");
  });
});
