import { beforeEach, describe, expect, it } from "vitest";
import { text } from "../support/page.ts";
import { ADMIN, signedIn } from "../support/readers.ts";
import { requests, resetStubs, stub, stubSite } from "../support/stub.ts";
import { Visitor } from "../support/visitor.ts";

/* The moderation pages (streampack#150): the reports, a report with its lines, and a day with its
   hidden lines, each step a plain form posted to the API as the admin. */
const JAVA = "irc://libera/%23java";
const REPORT = "019f0000-0000-7000-8000-0000000e0001";
const QUIET = "019f0000-0000-7000-8000-0000000e0002";
const L1 = "019f0000-0000-7000-8000-0000000f0001";
const L2 = "019f0000-0000-7000-8000-0000000f0002";
const L3 = "019f0000-0000-7000-8000-0000000f0003";
const L4 = "019f0000-0000-7000-8000-0000000f0004";
const ACTION = "019f0000-0000-7000-8000-0000000a0a01";

const sent = async (method: string, path: string) => (await requests()).filter((r) => r.method === method && r.path === path);

function report(fields: Partial<Record<string, unknown>> = {}) {
  return {
    id: REPORT, provenanceUri: JAVA, protocol: "irc", serviceId: "libera", channel: "#java", sender: "mallory", userId: null,
    score: 4.5, signals: { SLUR: 2, CAPS: 1 }, verdict: { abusive: true, reason: "Insults another user.", model: "claude-opus-5-5" },
    status: "OPEN", windowStart: "2026-10-06T03:04:05Z", windowEnd: "2026-10-06T03:09:00Z", createdAt: "2026-10-06T03:10:00Z",
    actedBy: null, actedAt: null, ...fields,
  };
}

const line = (id: string, time: string, sender: string, content: string, marks: Partial<Record<"hidden" | "flagged" | "cited" | "strong", boolean> & { signals: string[]; weight: number }> = {}) => ({
  id, timestamp: `2026-10-06T${time}Z`, day: "2026-10-06", sender, content, direction: "INBOUND", hidden: false, flagged: false, cited: false, ...marks,
});

const DETAIL = {
  report: report(),
  lines: [
    line(L1, "03:03:00", "ada", "morning"),
    line(L2, "03:04:05", "mallory", "you are all idiots", { flagged: true, cited: true }),
    line(L3, "03:05:00", "mallory", "IDIOTS", { flagged: true, hidden: true }),
  ],
  purgedLineIds: [],
  actions: [{ id: ACTION, reportId: REPORT, action: "HIDE", lineIds: [L3], note: "slur", actor: "ed", actedAt: "2026-10-06T04:00:00Z" }],
};

const done = (action: string, n: number) => ({ action: { id: ACTION, reportId: REPORT, action, lineIds: [], actor: "ed", actedAt: "2026-10-06T05:00:00Z" }, changed: n });

beforeEach(async () => {
  await resetStubs();
  await stubSite();
  await stub("/logs/provenances", { provenances: [{ provenanceUri: JAVA, protocol: "irc", serviceId: "libera", path: "irc/libera/java" }] });
  await stub("/admin/moderation/reports", { page: 0, size: 1, totalCount: 1, totalPages: 1, openCount: 1, reports: [report()] }, { query: { status: "open", page: 0, size: 1 } });
  await stub("/admin/moderation/reports", {
    page: 0, size: 20, totalCount: 41, totalPages: 3, openCount: 7,
    reports: [report(), report({ id: QUIET, sender: "bob", signals: {}, verdict: null, status: "DISMISSED", actedBy: "ed", actedAt: "2026-10-06T06:00:00Z" })],
  }, { query: { page: 0, size: 20 } });
  await stub(`/admin/moderation/reports/${REPORT}`, DETAIL);
});

describe("moderation", () => {
  it("is for admins: anyone else finds nothing there, and nothing is asked of the API", async () => {
    const pages = ["/admin/moderation", `/admin/moderation/${REPORT}`, `/admin/moderation/logs?provenance=${encodeURIComponent(JAVA)}&day=2026-10-06`];
    for (const path of pages) {
      expect((await new Visitor().get(path)).status, path).toBe(404);
      expect((await (await signedIn()).get(path)).status, path).toBe(404);
    }
    const reader = await signedIn();
    for (const step of ["hide", "unhide", "purge", "dismiss"]) {
      expect((await reader.post(`/admin/moderation/${REPORT}/${step}`, [["line", L2], ["confirm", "yes"]])).status, step).toBe(404);
    }
    expect((await reader.post("/admin/moderation/lines/hide", [["line", L2], ["provenance", JAVA], ["day", "2026-10-06"]])).status).toBe(404);
    expect((await requests()).filter((r) => r.path.startsWith("/admin/moderation") && r.method === "POST")).toEqual([]);
  });

  it("is in the admin nav, with the open reports counted", async () => {
    const v = await signedIn(ADMIN);
    const nav = (await v.get("/admin/users")).doc.querySelector("nav.admin-nav")!;
    const link = nav.querySelector("a[href='/admin/moderation']")!;
    expect(text(link)).toBe("Moderation 1");
    expect(link.querySelector(".admin-nav-count")?.getAttribute("aria-label")).toBe("1 open");
  });

  it("lists the reports: who, where, when, the signals and the AI's verdict, or that there's none", async () => {
    const v = await signedIn(ADMIN);
    const { status, doc } = await v.get("/admin/moderation");
    expect(status).toBe(200);
    const [first, second] = doc.querySelectorAll("article.mod-report");

    expect(text(first.querySelector("h2"))).toBe("mallory in #java");
    expect(first.querySelector("h2 a")?.getAttribute("href")).toBe(`/admin/moderation/${REPORT}`);
    expect(text(first)).toContain("2026-10-06 03:04 to 03:09 UTC");
    expect(first.querySelectorAll(".mod-signals li").map((li) => text(li))).toEqual(["slur ×2", "caps ×1"]);
    expect(text(first.querySelector(".mod-verdict"))).toBe("AI: abusive. Insults another user. (claude-opus-5-5)");
    expect(text(second.querySelector(".mod-verdict"))).toBe("No AI verdict");
    expect(text(second.querySelector(".mod-acted"))).toBe("Dismissed by ed, 2026-10-06 06:00 UTC");
    expect(text(doc.querySelector("main"))).toContain("bans stay with each channel's operators");

    // The list's own count, not asked for twice.
    expect(text(doc.querySelector("nav.admin-nav a[href='/admin/moderation']"))).toBe("Moderation 7");
    expect((await sent("GET", "/admin/moderation/reports")).length).toBe(1);
    expect((await sent("GET", "/admin/moderation/reports"))[0].headers.authorization).toBe("Bearer access-1");
    expect(doc.querySelector("a.pagelink[rel=next]")?.getAttribute("href")).toBe("/admin/moderation?page=1");
  });

  it("filters by status, and pages within it", async () => {
    await stub("/admin/moderation/reports", { page: 1, size: 20, totalCount: 30, totalPages: 2, openCount: 7, reports: [] }, { query: { status: "dismissed", page: 1, size: 20 } });
    const v = await signedIn(ADMIN);
    const { doc } = await v.get("/admin/moderation?status=dismissed&page=1");
    expect(doc.querySelector("nav.admin-tabs a[aria-current=page]")?.getAttribute("href")).toBe("/admin/moderation?status=dismissed");
    expect(doc.querySelector("a.pagelink[rel=prev]")?.getAttribute("href")).toBe("/admin/moderation?status=dismissed");
    expect(text(doc.querySelector("main"))).toContain("No dismissed reports");
    // Anything else is every status.
    await v.get("/admin/moderation?status=%3Cb%3E");
    expect((await sent("GET", "/admin/moderation/reports")).map((r) => r.query.status)).toEqual(["dismissed", undefined]);
  });

  it("shows a report's lines with their marks, its history, and the ways to its logs", async () => {
    const v = await signedIn(ADMIN);
    const { status, doc } = await v.get(`/admin/moderation/${REPORT}`);
    expect(status).toBe(200);
    const main = doc.querySelector("main")!;

    const rows = main.querySelectorAll("li.mod-line");
    expect(rows.map((r) => r.querySelector("input[type=checkbox]")?.getAttribute("value"))).toEqual([L1, L2, L3]);
    expect(rows[0].querySelectorAll(".mod-mark").length).toBe(0);
    expect(rows[1].querySelectorAll(".mod-mark").map((m) => text(m))).toEqual(["flagged", "cited"]);
    expect(rows[2].querySelectorAll(".mod-mark").map((m) => text(m))).toEqual(["flagged", "hidden"]);
    expect(rows[1].querySelector("a.log-time")?.getAttribute("href")).toBe("/logs/irc/libera/java/2026-10-06#l-030405");

    expect(main.querySelector("a.mod-day-public")?.getAttribute("href")).toBe("/logs/irc/libera/java/2026-10-06");
    expect(main.querySelector("a.mod-day-admin")?.getAttribute("href")).toBe(`/admin/moderation/logs?provenance=${encodeURIComponent(JAVA)}&day=2026-10-06`);
    expect(main.querySelector("a[href='/logs/irc/libera/java/search?from=mallory']")).not.toBeNull();
    expect(text(main.querySelector(".mod-no-bans"))).toContain("The bot doesn't ban anyone");
    expect(text(main.querySelector(".mod-action"))).toMatch(/^Hid 1 line by ed, 2026-10-06 04:00 UTC\s*“slur”$/);

    // Hide is the form's own action, and first: Enter hides. Purge is asked first, and last.
    const form = main.querySelector("form.mod-lines-form")!;
    expect(form.getAttribute("action")).toBe(`/admin/moderation/${REPORT}/hide`);
    expect(form.querySelectorAll("button").map((b) => b.getAttribute("formaction") ?? "")).toEqual(["", `/admin/moderation/${REPORT}/unhide`, `/admin/moderation/${REPORT}/purge`]);
    expect(form.querySelector("button")?.classList.contains("danger")).toBe(false);
    expect(main.querySelector(`form.mod-dismiss[action='/admin/moderation/${REPORT}/dismiss']`)).not.toBeNull();
  });

  it("checks only a report's strong lines, and says beside each flagged one why it was flagged", async () => {
    // streampack#169: an aimed insult weighs enough to hide; repetition alone doesn't.
    await stub(`/admin/moderation/reports/${REPORT}`, {
      ...DETAIL,
      lines: [
        line(L1, "03:03:00", "ada", "morning", { signals: null, weight: null, strong: null } as never),
        line(L2, "03:04:05", "mallory", "you are an idiot, ada", { flagged: true, signals: ["AIMED_HOSTILITY", "INSULT"], weight: 4, strong: true }),
        line(L4, "03:04:30", "mallory", "~sentiment", { flagged: true, signals: ["REPETITION"], weight: 1, strong: false }),
      ],
    });
    const v = await signedIn(ADMIN);
    const { doc } = await v.get(`/admin/moderation/${REPORT}`);
    const rows = doc.querySelectorAll("li.mod-line");
    expect(rows.map((r) => r.querySelector("input[type=checkbox]")?.hasAttribute("checked"))).toEqual([false, true, false]);
    expect(rows.map((r) => text(r.querySelector(".mod-why")))).toEqual(["", "aimed hostility, insult", "repetition"]);
    // Beside the mark it explains.
    expect(rows[1].querySelector(".mod-mark.flagged")?.nextElementSibling?.classList.contains("mod-why")).toBe(true);

    // A refused step draws the page again as it was left, not as it began.
    await stub(`/admin/moderation/reports/${REPORT}/hide`, { status: 400, detail: "Those lines changed." }, { method: "POST", status: 400 });
    const refused = await v.post(`/admin/moderation/${REPORT}/hide`, [["line", L4]]);
    expect(refused.status).toBe(400);
    expect(text(refused.doc.querySelector(".form-error[role=alert]"))).toBe("Those lines changed.");
    expect(refused.doc.querySelectorAll("li.mod-line input[type=checkbox]").map((c) => c.hasAttribute("checked"))).toEqual([false, false, true]);
    const empty = await v.post(`/admin/moderation/${REPORT}/hide`, []);
    expect(empty.doc.querySelectorAll("li.mod-line input[type=checkbox][checked]").length).toBe(0);
  });

  it("checks nothing in an older report, which doesn't say why its lines were flagged", async () => {
    const v = await signedIn(ADMIN);
    const { doc } = await v.get(`/admin/moderation/${REPORT}`);
    const rows = doc.querySelectorAll("li.mod-line");
    expect(rows.map((r) => r.querySelector("input[type=checkbox]")?.hasAttribute("checked"))).toEqual([false, false, false]);
    expect(doc.querySelectorAll(".mod-why").length).toBe(0);
    expect(rows[1].querySelectorAll(".mod-mark").map((m) => text(m))).toEqual(["flagged", "cited"]);
  });

  it("offers no dismissal for a report that isn't open, and has nothing for one that doesn't exist", async () => {
    await stub(`/admin/moderation/reports/${REPORT}`, { ...DETAIL, report: report({ status: "ACTIONED", actedBy: "ed", actedAt: "2026-10-06T04:00:00Z" }) });
    const v = await signedIn(ADMIN);
    expect((await v.get(`/admin/moderation/${REPORT}`)).doc.querySelector("form.mod-dismiss")).toBeNull();
    expect((await v.get(`/admin/moderation/${QUIET}`)).status).toBe(404);
    expect((await v.get("/admin/moderation/not-a-report")).status).toBe(404);
  });

  it("hides and unhides the checked lines, posting their ids and the note, and says so", async () => {
    await stub(`/admin/moderation/reports/${REPORT}/hide`, done("HIDE", 2), { method: "POST" });
    await stub(`/admin/moderation/reports/${REPORT}/unhide`, done("UNHIDE", 1), { method: "POST" });
    const v = await signedIn(ADMIN);

    const hid = await v.post(`/admin/moderation/${REPORT}/hide`, [["line", L2], ["line", L3], ["line", "nonsense"], ["note", " slurs "]]);
    expect(hid.location).toBe(`/admin/moderation/${REPORT}?done=hidden&n=2`);
    const [hide] = await sent("POST", `/admin/moderation/reports/${REPORT}/hide`);
    expect(hide.body).toEqual({ lineIds: [L2, L3], note: "slurs" });
    expect(hide.headers.authorization).toBe("Bearer access-1");
    expect(text((await v.get(hid.location!)).doc.querySelector("[role=status]"))).toBe("Hid 2 lines. They're gone from the public log, kept here.");

    const unhid = await v.post(`/admin/moderation/${REPORT}/unhide`, [["line", L3]]);
    expect(unhid.location).toBe(`/admin/moderation/${REPORT}?done=unhidden&n=1`);
    expect((await sent("POST", `/admin/moderation/reports/${REPORT}/unhide`))[0].body).toEqual({ lineIds: [L3] });
  });

  it("asks for lines before a step that needs them", async () => {
    const v = await signedIn(ADMIN);
    const { status, doc } = await v.post(`/admin/moderation/${REPORT}/hide`, []);
    expect(status).toBe(400);
    expect(text(doc.querySelector(".form-error[role=alert]"))).toBe("Select the lines to hide first.");
    expect(await sent("POST", `/admin/moderation/reports/${REPORT}/hide`)).toEqual([]);
  });

  it("asks before purging, saying it can't be undone, and only the confirmed form purges", async () => {
    await stub(`/admin/moderation/reports/${REPORT}/purge`, done("PURGE", 1), { method: "POST" });
    const v = await signedIn(ADMIN);

    const asked = await v.post(`/admin/moderation/${REPORT}/purge`, [["line", L2], ["note", "gone"]]);
    expect(asked.status).toBe(200);
    expect(text(asked.doc.querySelector("main h1"))).toBe("Purge 1 line for good?");
    expect(text(asked.doc.querySelector(".confirm-body"))).toContain("This can't be undone.");
    expect(text(asked.doc.querySelector("li.mod-line .log-content"))).toBe("you are all idiots");
    // Asking purged nothing.
    expect(await sent("POST", `/admin/moderation/reports/${REPORT}/purge`)).toEqual([]);

    const form = asked.doc.querySelector(".confirm-page form")!;
    expect(form.getAttribute("action")).toBe(`/admin/moderation/${REPORT}/purge`);
    const fields = form.querySelectorAll("input").filter((i) => i.getAttribute("name") !== "csrf").map((i) => [i.getAttribute("name")!, i.getAttribute("value") ?? ""] as [string, string]);
    expect(fields).toEqual([["lines", L2], ["confirm", "yes"], ["note", "gone"]]);
    expect(form.querySelector("a.confirm-cancel")?.getAttribute("href")).toBe(`/admin/moderation/${REPORT}`);

    const purged = await v.post(`/admin/moderation/${REPORT}/purge`, fields);
    expect(purged.location).toBe(`/admin/moderation/${REPORT}?done=purged&n=1`);
    expect((await sent("POST", `/admin/moderation/reports/${REPORT}/purge`)).map((r) => r.body)).toEqual([{ lineIds: [L2], confirm: true, note: "gone" }]);
  });

  it("dismisses an open report, and says what the API says when it won't", async () => {
    await stub(`/admin/moderation/reports/${REPORT}/dismiss`, done("DISMISS", 0), { method: "POST" });
    const v = await signedIn(ADMIN);
    const dismissed = await v.post(`/admin/moderation/${REPORT}/dismiss`, { note: "banter" });
    expect(dismissed.location).toBe(`/admin/moderation/${REPORT}?done=dismissed&n=0`);
    expect((await sent("POST", `/admin/moderation/reports/${REPORT}/dismiss`))[0].body).toEqual({ note: "banter" });
    expect(text((await v.get(dismissed.location!)).doc.querySelector("[role=status]"))).toBe("Dismissed the report.");

    await stub(`/admin/moderation/reports/${REPORT}/dismiss`, { status: 400, detail: "Only an open report can be dismissed." }, { method: "POST", status: 400 });
    const refused = await v.post(`/admin/moderation/${REPORT}/dismiss`, {});
    expect(refused.status).toBe(400);
    expect(text(refused.doc.querySelector(".form-error[role=alert]"))).toBe("Only an open report can be dismissed.");
  });

  it("refuses a step without the page's anti-forgery token", async () => {
    const v = await signedIn(ADMIN);
    expect((await v.post(`/admin/moderation/${REPORT}/hide`, [["line", L2]], { csrf: false })).status).toBe(403);
    expect(await sent("POST", `/admin/moderation/reports/${REPORT}/hide`)).toEqual([]);
  });
});

describe("the admin day view", () => {
  const DAY = `/admin/moderation/logs?provenance=${encodeURIComponent(JAVA)}&day=2026-10-06`;

  beforeEach(async () => {
    await stub("/admin/moderation/logs", { provenanceUri: JAVA, day: "2026-10-06", lines: DETAIL.lines }, { query: { provenance: JAVA, day: "2026-10-06" } });
  });

  it("shows every line, the hidden ones marked, with Hide and Unhide", async () => {
    const v = await signedIn(ADMIN);
    const { status, doc } = await v.get(DAY);
    expect(status).toBe(200);
    expect(doc.querySelectorAll("li.mod-line").length).toBe(3);
    expect(doc.querySelectorAll("li.mod-line.is-hidden").map((li) => li.getAttribute("id"))).toEqual([`line-${L3}`]);
    const form = doc.querySelector("form.mod-lines-form")!;
    expect(form.getAttribute("action")).toBe("/admin/moderation/lines/hide");
    expect(form.querySelector("button[formaction='/admin/moderation/lines/unhide']")).not.toBeNull();
    expect(form.querySelector("input[name=provenance]")?.getAttribute("value")).toBe(JAVA);
    expect(doc.querySelector("a.log-day-link[rel=prev]")?.getAttribute("href")).toBe(`/admin/moderation/logs?provenance=${encodeURIComponent(JAVA)}&day=2026-10-05`);
    expect((await v.get(`/admin/moderation/logs?provenance=${encodeURIComponent(JAVA)}&day=yesterday`)).status).toBe(404);
  });

  it("hides and unhides lines, and comes back to the day", async () => {
    await stub("/admin/moderation/lines/hide", done("HIDE", 1), { method: "POST" });
    await stub("/admin/moderation/lines/unhide", done("UNHIDE", 1), { method: "POST" });
    const v = await signedIn(ADMIN);
    const at: [string, string][] = [["provenance", JAVA], ["day", "2026-10-06"]];

    const hid = await v.post("/admin/moderation/lines/hide", [...at, ["line", L1]]);
    expect(hid.location).toBe(`${DAY}&done=hidden&n=1`);
    expect((await sent("POST", "/admin/moderation/lines/hide"))[0].body).toEqual({ lineIds: [L1] });
    expect(text((await v.get(hid.location!)).doc.querySelector("[role=status]"))).toContain("Hid 1 line.");

    const unhid = await v.post("/admin/moderation/lines/unhide", [...at, ["line", L3], ["note", "fine after all"]]);
    expect(unhid.location).toBe(`${DAY}&done=unhidden&n=1`);
    expect((await sent("POST", "/admin/moderation/lines/unhide"))[0].body).toEqual({ lineIds: [L3], note: "fine after all" });
  });

  it("is a step from the public log's day, for admins only", async () => {
    await stub("/logs", { provenanceUri: JAVA, day: "2026-10-06", entries: [] }, { query: { provenance: JAVA, day: "2026-10-06" } });
    const admin = await signedIn(ADMIN);
    expect((await admin.get("/logs/irc/libera/java/2026-10-06")).doc.querySelector("a.log-moderate")?.getAttribute("href")).toBe(DAY);
    expect((await (await signedIn()).get("/logs/irc/libera/java/2026-10-06")).doc.querySelector("a.log-moderate")).toBeNull();
  });
});
