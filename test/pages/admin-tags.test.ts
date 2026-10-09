import { beforeEach, describe, expect, inject, it } from "vitest";
import { text } from "../support/page.ts";
import { ADMIN, signedIn } from "../support/readers.ts";
import { requests, resetStubs, stub, stubSite } from "../support/stub.ts";
import { Visitor } from "../support/visitor.ts";

/* The tag vocabulary's admin pages (streampack#140, #139, as ui-pudl#212): the review queue, feed
   tags, aliases, the stoplist and history, each step a plain form posted to the API as the admin;
   alias, split and a new alias asked first, previewed by the API's dry run. */
const E1 = "019f0000-0000-7000-8000-0000000c0001";
const E2 = "019f0000-0000-7000-8000-0000000c0002";
const E3 = "019f0000-0000-7000-8000-0000000c0003";

const sent = async (method: string, path: string) => (await requests()).filter((r) => r.method === method && r.path === path);
const adminCalls = async () => (await requests()).filter((r) => r.path.startsWith("/admin/tags") || r.path.startsWith("/admin/rss/tags"));

function entry(fields: Partial<Record<string, unknown>> = {}) {
  return {
    id: E1, tag: "compiler", firstSeen: "2026-10-08T14:00:00Z", source: "post", hintKind: "PLURAL", hintTags: ["compilers"],
    aiCandidate: "compilers", aiConfidence: 0.97, aiReason: "Singular of compilers.", aiModel: "claude-haiku-4-5",
    status: "OPEN", actedBy: null, actedAt: null, ...fields,
  };
}

const REVIEW = {
  openCount: 3, totalCount: 41, totalPages: 3,
  entries: [
    entry(),
    entry({ id: E2, tag: "java kotlin", source: "factoid", hintKind: "MISSING_COMMA", hintTags: ["java", "kotlin"], aiCandidate: null, aiConfidence: null, aiReason: null, aiModel: null }),
    entry({ id: E3, tag: "k8s", source: "rss", hintKind: "AI", hintTags: ["kubernetes"], aiCandidate: "kubernetes", aiConfidence: 0.6, aiReason: "", status: "KEPT", actedBy: "ed", actedAt: "2026-10-08T16:30:00Z" }),
  ],
};

const feedTag = (fields: Partial<Record<string, unknown>> = {}) => ({
  name: "quarkus", written: ["Quarkus", "quarkus"], status: "WAITING", entries: 2, feeds: 1,
  firstSeen: "2026-10-08T14:00:00Z", lastSeen: "2026-10-08T15:00:00Z", tag: null, decidedBy: null, decidedAt: null,
  examples: [{ entryId: "019f0000-0000-7000-8000-0000000d0001", title: "Quarkus 4", link: "https://example.com/q4", feedTitle: "A blog" }],
  ...fields,
});

const FEED = {
  waitingCount: 5, promoteEntries: 3, promoteFeeds: 2, totalCount: 5, totalPages: 1,
  tags: [feedTag(), feedTag({ name: "golang", written: ["Golang"], status: "MAPPED", entries: 4, feeds: 2, tag: "go", decidedBy: "ed", decidedAt: "2026-10-08T17:00:00Z", examples: [] })],
};

beforeEach(async () => {
  await resetStubs();
  await stubSite();
  await stub("/taxonomy", { tags: { compilers: 3, java: 9, kotlin: 4, _sidebar: 1 }, categories: {}, factoidTags: { kubernetes: 2 } });
  // The nav's counts.
  await stub("/admin/tags/review", { openCount: 3, totalCount: 3, totalPages: 3, entries: [] }, { query: { status: "open", page: 0, size: 1 } });
  await stub("/admin/rss/tags", { ...FEED, tags: [] }, { query: { status: "waiting", page: 0, size: 1 } });
  await stub("/admin/tags/review", REVIEW, { query: { status: "open", page: 0, size: 20 } });
  await stub("/admin/rss/tags", FEED, { query: { status: "waiting", page: 0, size: 20 } });
  await stub(`/admin/tags/review/${E1}`, entry());
  await stub(`/admin/tags/review/${E2}`, REVIEW.entries[1]);
  await stub(`/admin/tags/review/${E3}`, REVIEW.entries[2]);
  await stub("/admin/tags/aliases", [{ alias: "k8s", tag: "kubernetes", createdBy: "ed", createdAt: "2026-10-07T10:00:00Z" }]);
  await stub("/admin/tags/stoplist", [{ term: "self hosted", createdBy: "ed", createdAt: "2026-10-07T11:00:00Z" }]);
  await stub("/admin/tags/actions", [
    { action: "ALIAS", subject: "compiler", detail: "compilers", actor: "ed", actedAt: "2026-10-08T18:01:00Z" },
    { action: "STOP", subject: "self hosted", detail: null, actor: "ed", actedAt: "2026-10-07T11:00:00Z" },
  ], { query: { limit: 50 } });
});

describe("the tag vocabulary's admin pages", () => {
  it("are for admins: anyone else gets a 404 everywhere, and nothing is asked of the API", async () => {
    const pages = ["/admin/tags", "/admin/tags?status=kept", "/admin/tags/feed", "/admin/tags/aliases", "/admin/tags/stoplist", "/admin/tags/history",
      `/admin/tags/review/${E1}/alias`, `/admin/tags/review/${E1}/split`, `/admin/tags/review/${E1}/alias/preview?tag=x`,
      "/admin/tags/aliases/new?alias=a&tag=b", "/admin/tags/aliases/preview?alias=a&tag=b", "/admin/tags/aliases/remove?alias=k8s"];
    const posts: [string, Record<string, string>][] = [
      [`/admin/tags/review/${E1}/alias`, { tag: "compilers" }], [`/admin/tags/review/${E1}/split`, { parts: "a, b" }],
      [`/admin/tags/review/${E1}/keep`, {}], [`/admin/tags/review/${E1}/dismiss`, {}],
      ["/admin/tags/feed/map", { name: "quarkus", tag: "java" }], ["/admin/tags/feed/create", { name: "quarkus" }], ["/admin/tags/feed/ignore", { name: "quarkus" }],
      ["/admin/tags/aliases", { alias: "a", tag: "b" }], ["/admin/tags/aliases/remove", { alias: "k8s" }],
      ["/admin/tags/stoplist", { term: "x" }], ["/admin/tags/stoplist/remove", { term: "x" }],
    ];
    const reader = await signedIn();
    for (const v of [new Visitor(), reader]) {
      for (const path of pages) expect((await v.get(path)).status, path).toBe(404);
      for (const [path, form] of posts) expect((await v.post(path, form)).status, path).toBe(404);
    }
    expect(await adminCalls()).toEqual([]);
  });

  it("is in the admin nav, counting open review entries and waiting feed tags", async () => {
    const v = await signedIn(ADMIN);
    const link = (await v.get("/admin/users")).doc.querySelector("nav.admin-nav a[href='/admin/tags']")!;
    expect(text(link)).toBe("Tags 8");
    expect(link.querySelector(".admin-nav-count")?.getAttribute("aria-label")).toBe("8 to decide");
  });

  it("leaves the nav's count out when the API can't say", async () => {
    await stub("/admin/tags/review", { status: 503 }, { query: { status: "open", page: 0, size: 1 }, status: 503 });
    await stub("/admin/rss/tags", { status: 503 }, { query: { status: "waiting", page: 0, size: 1 }, status: 503 });
    const v = await signedIn(ADMIN);
    expect(text((await v.get("/admin/users")).doc.querySelector("nav.admin-nav a[href='/admin/tags']"))).toBe("Tags");
  });

  it("lists the review queue: each tag's source, first sight, hint, the AI's suggestion, and what can be done", async () => {
    const v = await signedIn(ADMIN);
    const { status, doc } = await v.get("/admin/tags");
    expect(status).toBe(200);
    const [first, second, third] = doc.querySelectorAll("article.tag-review");
    expect(text(first.querySelector("h2"))).toBe("compiler");
    expect(text(first.querySelector(".tag-seen"))).toBe("From a post, first seen 2026-10-08 14:00 UTC");
    expect(text(first.querySelector(".tag-hint"))).toBe("Singular of “compilers”");
    expect(text(first.querySelector(".tag-ai"))).toBe("AI suggests “compilers”: 97% sure (very likely). Singular of compilers. (claude-haiku-4-5)");
    expect(first.querySelector("a.tag-alias")?.getAttribute("href")).toBe(`/admin/tags/review/${E1}/alias`);
    expect(first.querySelector("a.tag-alias")?.classList.contains("auth-button")).toBe(true);
    expect(first.querySelector("a.tag-split")?.getAttribute("href")).toBe(`/admin/tags/review/${E1}/split`);
    const form = first.querySelector("form")!;
    expect(form.getAttribute("action")).toBe(`/admin/tags/review/${E1}/keep`);
    expect(form.querySelectorAll("button").map((b) => [text(b), b.getAttribute("formaction") ?? ""])).toEqual([["Keep", ""], ["Dismiss", `/admin/tags/review/${E1}/dismiss`]]);

    expect(text(second.querySelector(".tag-seen"))).toContain("From a factoid");
    expect(text(second.querySelector(".tag-hint"))).toBe("Two existing tags run together, a comma missing: “java”, “kotlin”");
    expect(text(second.querySelector(".tag-ai"))).toBe("No AI suggestion");

    expect(text(third.querySelector(".tag-seen"))).toContain("From a feed");
    expect(text(third.querySelector(".tag-hint"))).toBe("No rule matched; the AI named “kubernetes”");
    expect(text(third.querySelector(".tag-ai"))).toBe("AI suggests “kubernetes”: 60% sure (possibly). (claude-haiku-4-5)");
    expect(text(third.querySelector(".tag-acted"))).toBe("Kept by ed, 2026-10-08 16:30 UTC");
    expect(third.querySelector("form")).toBeNull();

    // The list's own open count; the waiting feed tags asked for once.
    expect(text(doc.querySelector("nav.admin-tabs a[href='/admin/tags']"))).toBe("Review 3");
    expect(text(doc.querySelector("nav.admin-tabs a[href='/admin/tags/feed']"))).toBe("Feed tags 5");
    expect(text(doc.querySelector("nav.admin-nav a[href='/admin/tags']"))).toBe("Tags 8");
    expect((await sent("GET", "/admin/tags/review")).map((r) => r.query)).toEqual([{ status: "open", page: "0", size: "20" }]);
    expect((await sent("GET", "/admin/tags/review"))[0].headers.authorization).toBe("Bearer access-1");
  });

  it("filters by status, says the page and the totals, and pages by totalPages", async () => {
    await stub("/admin/tags/review", { ...REVIEW, totalCount: 41, totalPages: 3, entries: [] }, { query: { status: "kept", page: 1, size: 20 } });
    const v = await signedIn(ADMIN);
    const first = await v.get("/admin/tags");
    expect(text(first.doc.querySelector(".tag-page"))).toBe("Page 1 of 3 (41 open entries)");
    expect(first.doc.querySelector("a.pagelink[rel=next]")?.getAttribute("href")).toBe("/admin/tags?page=1");
    expect(first.doc.querySelector("a.pagelink[rel=prev]")).toBeNull();
    expect(first.doc.querySelectorAll("nav.tag-filters a").map((a) => text(a))).toEqual(["Open", "Aliased", "Split", "Kept", "Dismissed", "All"]);

    const { doc } = await v.get("/admin/tags?status=kept&page=1");
    expect(doc.querySelector("nav.tag-filters a[aria-current=page]")?.getAttribute("href")).toBe("/admin/tags?status=kept");
    expect(text(doc.querySelector(".tag-page"))).toBe("Page 2 of 3 (41 kept entries)");
    expect(doc.querySelector("a.pagelink[rel=prev]")?.getAttribute("href")).toBe("/admin/tags?status=kept");
    expect(doc.querySelector("a.pagelink[rel=next]")?.getAttribute("href")).toBe("/admin/tags?status=kept&page=2");
    expect(text(doc.querySelector(".tag-empty"))).toBe("No kept entries.");
    // Anything else is the default.
    await v.get("/admin/tags?status=%3Cb%3E");
    expect((await sent("GET", "/admin/tags/review")).filter((r) => r.query.size === "20").map((r) => r.query.status)).toEqual(["open", "kept", "open"]);
  });

  it("lists feed tags: their forms, progress toward promotion, examples, and Map, Create and Ignore", async () => {
    const v = await signedIn(ADMIN);
    const { status, doc } = await v.get("/admin/tags/feed");
    expect(status).toBe(200);
    const [waiting, mapped] = doc.querySelectorAll("article.tag-feed");
    expect(text(waiting.querySelector("h2"))).toBe("quarkus");
    expect(text(waiting.querySelector(".tag-written"))).toBe("Written as Quarkus, quarkus");
    expect(text(waiting.querySelector(".tag-counts"))).toBe("2 of 3 entries, 1 of 2 feeds");
    expect(text(waiting.querySelector(".tag-seen"))).toBe("First seen 2026-10-08 14:00 UTC, last 2026-10-08 15:00 UTC");
    expect(waiting.querySelector(".tag-examples a")?.getAttribute("href")).toBe("https://example.com/q4");
    expect(text(waiting.querySelector(".tag-examples li"))).toBe("Quarkus 4 from A blog");
    const form = waiting.querySelector("form.tag-feed-form")!;
    expect(form.getAttribute("action")).toBe("/admin/tags/feed/map");
    expect(form.querySelector("input[name=name]")?.getAttribute("value")).toBe("quarkus");
    expect(form.querySelector("input[name=tag]")?.getAttribute("list")).toBe("tag-vocabulary");
    expect(form.querySelectorAll("button").map((b) => [text(b), b.getAttribute("formaction") ?? ""])).toEqual([["Map", ""], ["Create", "/admin/tags/feed/create"], ["Ignore", "/admin/tags/feed/ignore"]]);
    // The suggestions: post and factoid tags, not system ones.
    expect(doc.querySelectorAll("#tag-vocabulary option").map((o) => o.getAttribute("value"))).toEqual(["compilers", "java", "kotlin", "kubernetes"]);

    expect(text(mapped.querySelector(".tag-counts"))).toBe("4 entries, 2 feeds");
    expect(text(mapped.querySelector(".tag-acted"))).toBe("Maps to “go”, by ed, 2026-10-08 17:00 UTC");
    expect(mapped.querySelector("form")).toBeNull();
    expect(text(doc.querySelector(".tag-page"))).toBe("Page 1 of 1 (5 waiting feed tags)");
    expect(doc.querySelector("a.pagelink[rel=next]")).toBeNull();
    expect(text(doc.querySelector("nav.admin-nav a[href='/admin/tags']"))).toBe("Tags 8");
  });

  it("lists the aliases, the stoplist and the history", async () => {
    const v = await signedIn(ADMIN);
    const aliases = (await v.get("/admin/tags/aliases")).doc;
    const row = aliases.querySelector("li.tag-alias-row")!;
    expect(text(row.querySelector("p"))).toBe("k8s means kubernetes");
    expect(text(row.querySelector(".byline"))).toBe("Added by ed, 2026-10-07 10:00 UTC");
    expect(row.querySelector("a[data-confirm]")?.getAttribute("href")).toBe("/admin/tags/aliases/remove?alias=k8s");
    expect(aliases.querySelector("form[action='/admin/tags/aliases/new']")?.getAttribute("method")).toBe("get");

    const stops = (await v.get("/admin/tags/stoplist")).doc;
    const stop = stops.querySelector("li.tag-stop-row")!;
    expect(text(stop.querySelector(".as-typed"))).toBe("self hosted");
    expect(stop.querySelector("form")?.getAttribute("action")).toBe("/admin/tags/stoplist/remove");
    expect(stop.querySelector("input[name=term]")?.getAttribute("value")).toBe("self hosted");
    expect(stops.querySelector("form[action='/admin/tags/stoplist'] input[name=term]")).not.toBeNull();

    const history = (await v.get("/admin/tags/history")).doc;
    expect(history.querySelectorAll("li.tag-history-row").map((li) => li.querySelectorAll("p").map((x) => text(x)).join(" "))).toEqual([
      "Aliased compiler (compilers) by ed, 2026-10-08 18:01 UTC",
      "Stoplisted self hosted by ed, 2026-10-07 11:00 UTC",
    ]);
    expect((await sent("GET", "/admin/tags/actions"))[0].query).toEqual({ limit: "50" });
  });

  it("says when a section is empty, or can't be had", async () => {
    await stub("/admin/tags/review", { openCount: 0, totalCount: 0, totalPages: 0, entries: [] }, { query: { status: "open", page: 0, size: 20 } });
    await stub("/admin/tags/stoplist", { status: 503 }, { status: 503 });
    const v = await signedIn(ADMIN);
    expect(text((await v.get("/admin/tags")).doc.querySelector(".tag-empty"))).toBe("Nothing to review: every new tag looked sound.");
    const { doc } = await v.get("/admin/tags/stoplist");
    expect(text(doc.querySelector(".form-error[role=alert]"))).toBe("The tag vocabulary can't be loaded just now. Try again shortly.");
  });
});

describe("the review queue's questions", () => {
  it("asks before aliasing, prefilled from the AI, previewing it with a dry run, and offers Confirm with what was checked", async () => {
    await stub(`/admin/tags/review/${E1}/alias`, { tag: "compiler", now: ["compilers"], posts: 3, factoids: 1 }, { method: "POST", query: { dryRun: "true" } });
    const v = await signedIn(ADMIN);
    const { status, doc } = await v.get(`/admin/tags/review/${E1}/alias`);
    expect(status).toBe(200);
    expect(text(doc.querySelector("h1"))).toBe("Alias “compiler” to another tag?");
    const check = doc.querySelector("form.tag-ask-check")!;
    expect(check.getAttribute("method")).toBe("get");
    expect(check.getAttribute("action")).toBe(`/admin/tags/review/${E1}/alias`);
    expect(check.querySelector("input[name=tag]")?.getAttribute("value")).toBe("compilers");
    expect(check.querySelector("input[name=tag]")?.getAttribute("list")).toBe("tag-vocabulary");
    expect(text(doc.querySelector("#tag-preview"))).toBe("This re-points 3 posts and 1 factoid to “compilers”.");
    const confirm = doc.querySelector("form.tag-ask-confirm")!;
    expect(confirm.hasAttribute("hidden")).toBe(false);
    expect(confirm.getAttribute("method")).toBe("post");
    expect(confirm.querySelector("input[name=tag]")?.getAttribute("value")).toBe("compilers");
    expect(text(confirm.querySelector("button"))).toBe("Alias to “compilers”");
    expect(confirm.querySelector("button")?.hasAttribute("disabled")).toBe(false);
    // Previewing changed nothing: the dry run only.
    expect((await sent("POST", `/admin/tags/review/${E1}/alias`)).map((r) => [r.query, r.body])).toEqual([[{ dryRun: "true" }, { tag: "compilers" }]]);

    // The JSON preview, for script, says the same.
    const json = await fetch(`${inject("appUrl")}/admin/tags/review/${E1}/alias/preview?tag=compilers`, { headers: { Cookie: [...v.cookies].map(([k, c]) => `${k}=${c}`).join("; ") } });
    expect(json.headers.get("cache-control")).toBe("private, no-store");
    expect(await json.json()).toEqual({ ok: true, text: "This re-points 3 posts and 1 factoid to “compilers”.", button: "Alias to “compilers”" });
  });

  it("offers no Confirm when the preview is refused, saying why in the API's words", async () => {
    await stub(`/admin/tags/review/${E1}/alias`, { status: 400, detail: "“nope” isn't a tag." }, { method: "POST", query: { dryRun: "true" }, status: 400 });
    const v = await signedIn(ADMIN);
    const { doc } = await v.get(`/admin/tags/review/${E1}/alias?tag=nope`);
    expect(doc.querySelector("form.tag-ask-check input[name=tag]")?.getAttribute("value")).toBe("nope");
    expect(text(doc.querySelector("#tag-preview"))).toBe("Not possible: “nope” isn't a tag.");
    const confirm = doc.querySelector("form.tag-ask-confirm")!;
    expect(confirm.hasAttribute("hidden")).toBe(true);
    expect(confirm.querySelector("button")?.hasAttribute("disabled")).toBe(true);
    // An empty field isn't asked of the API at all.
    const empty = await v.get(`/admin/tags/review/${E1}/alias?tag=`);
    expect(text(empty.doc.querySelector("#tag-preview"))).toBe("Name the tag to alias it to.");
    expect(empty.doc.querySelector("form.tag-ask-confirm")?.hasAttribute("hidden")).toBe(true);
    expect((await sent("POST", `/admin/tags/review/${E1}/alias`)).length).toBe(1);
  });

  it("asks before splitting, prefilled from the hint's parts, and splits into the checked parts", async () => {
    await stub(`/admin/tags/review/${E2}/split`, { tag: "java kotlin", now: ["java", "kotlin"], posts: 2, factoids: 0 }, { method: "POST" });
    const v = await signedIn(ADMIN);
    const { doc } = await v.get(`/admin/tags/review/${E2}/split?back=status%3Dopen%26page%3D1`);
    expect(doc.querySelector("form.tag-ask-check input[name=parts]")?.getAttribute("value")).toBe("java, kotlin");
    expect(text(doc.querySelector("#tag-preview"))).toBe("This re-points 2 posts and 0 factoids to “java” and “kotlin”.");
    const confirm = doc.querySelector("form.tag-ask-confirm")!;
    expect(text(confirm.querySelector("button"))).toBe("Split into “java” and “kotlin”");
    const fields = confirm.querySelectorAll("input").filter((i) => i.getAttribute("name") !== "csrf").map((i) => [i.getAttribute("name")!, i.getAttribute("value") ?? ""] as [string, string]);
    expect(fields).toEqual([["back", "page=1"], ["parts", "java, kotlin"]]);
    expect(doc.querySelector("a.confirm-cancel")?.getAttribute("href")).toBe("/admin/tags?page=1");

    const split = await v.post(`/admin/tags/review/${E2}/split`, fields);
    expect(split.status).toBe(303);
    expect(split.location).toBe("/admin/tags?page=1&done=split&t=java+kotlin&to=java&to=kotlin&p=2&f=0");
    expect((await sent("POST", `/admin/tags/review/${E2}/split`)).map((r) => [r.query, r.body])).toEqual([
      [{ dryRun: "true" }, { parts: ["java", "kotlin"] }],
      [{}, { parts: ["java", "kotlin"] }],
    ]);
    await stub("/admin/tags/review", REVIEW, { query: { status: "open", page: 1, size: 20 } });
    expect(text((await v.get(split.location!)).doc.querySelector("[role=status]"))).toBe("“java kotlin” is split into “java” and “kotlin”: 2 posts and 0 factoids re-pointed.");
  });

  it("aliases, sending the tag alone, and says what was re-pointed", async () => {
    await stub(`/admin/tags/review/${E1}/alias`, { tag: "compiler", now: ["compilers"], posts: 3, factoids: 1 }, { method: "POST" });
    const v = await signedIn(ADMIN);
    const done = await v.post(`/admin/tags/review/${E1}/alias`, { tag: " compilers " });
    expect(done.location).toBe("/admin/tags?done=aliased&t=compiler&to=compilers&p=3&f=1");
    const [call] = await sent("POST", `/admin/tags/review/${E1}/alias`);
    expect(call.body).toEqual({ tag: "compilers" });
    expect(call.query).toEqual({});
    expect(call.headers.authorization).toBe("Bearer access-1");
    expect(text((await v.get(done.location!)).doc.querySelector("[role=status]"))).toBe("“compiler” is now an alias of “compilers”: 3 posts and 1 factoid re-pointed.");
  });

  it("asks again, with the API's reason, when an alias is refused, and never sends an empty one", async () => {
    await stub(`/admin/tags/review/${E1}/alias`, { status: 400, detail: "That entry is already decided." }, { method: "POST", status: 400 });
    const v = await signedIn(ADMIN);
    const refused = await v.post(`/admin/tags/review/${E1}/alias`, { tag: "compilers" });
    expect(refused.status).toBe(400);
    expect(text(refused.doc.querySelector(".form-error[role=alert]"))).toBe("That entry is already decided.");
    expect(text(refused.doc.querySelector("#tag-preview"))).toBe("Not possible: That entry is already decided.");
    const before = (await sent("POST", `/admin/tags/review/${E1}/alias`)).length;
    const empty = await v.post(`/admin/tags/review/${E1}/alias`, { tag: "  " });
    expect(empty.status).toBe(400);
    expect(text(empty.doc.querySelector(".form-error[role=alert]"))).toBe("Name the tag to alias it to.");
    expect((await sent("POST", `/admin/tags/review/${E1}/alias`)).length).toBe(before);
  });

  it("has no question for a decided or unknown entry", async () => {
    const v = await signedIn(ADMIN);
    expect((await v.get(`/admin/tags/review/${E3}/alias`)).status).toBe(404);
    expect((await v.get("/admin/tags/review/019f0000-0000-7000-8000-0000000c0009/alias")).status).toBe(404);
    expect((await v.get(`/admin/tags/review/${E1}/keep`)).status).toBe(404);
    expect((await v.get("/admin/tags/review/nonsense/alias")).status).toBe(404);
  });

  it("keeps and dismisses at once, with no body, back to the list it came from", async () => {
    await stub(`/admin/tags/review/${E1}/keep`, { tag: "compiler", now: ["compiler"], posts: 0, factoids: 0 }, { method: "POST" });
    await stub(`/admin/tags/review/${E1}/dismiss`, { tag: "compiler", now: ["compiler"], posts: 0, factoids: 0 }, { method: "POST" });
    const v = await signedIn(ADMIN);
    const kept = await v.post(`/admin/tags/review/${E1}/keep`, { back: "page=2" });
    expect(kept.location).toBe("/admin/tags?page=2&done=kept&t=compiler");
    expect((await sent("POST", `/admin/tags/review/${E1}/keep`))[0].body).toBeFalsy();
    await stub("/admin/tags/review", REVIEW, { query: { status: "open", page: 2, size: 20 } });
    expect(text((await v.get(kept.location!)).doc.querySelector("[role=status]"))).toBe("“compiler” is kept as a tag.");

    const dismissed = await v.post(`/admin/tags/review/${E1}/dismiss`, { back: "status=all" });
    expect(dismissed.location).toBe("/admin/tags?status=all&done=dismissed&t=compiler");
    expect(text((await v.get("/admin/tags?done=dismissed&t=compiler")).doc.querySelector("[role=status]"))).toBe("“compiler” is dismissed, left as it is.");
  });

  it("draws the list again with the API's reason when keeping is refused", async () => {
    await stub(`/admin/tags/review/${E1}/keep`, { status: 400, detail: "That entry is already decided." }, { method: "POST", status: 400 });
    const v = await signedIn(ADMIN);
    const refused = await v.post(`/admin/tags/review/${E1}/keep`, {});
    expect(refused.status).toBe(400);
    expect(text(refused.doc.querySelector(".form-error[role=alert]"))).toBe("That entry is already decided.");
    expect(refused.doc.querySelectorAll("article.tag-review").length).toBe(3);
  });
});

describe("the feed tags' decisions", () => {
  it("maps, creates and ignores at once, sending exactly the name (and the tag), and says what the API did", async () => {
    await stub("/admin/rss/tags/map", feedTag({ status: "MAPPED", tag: "java" }), { method: "POST" });
    await stub("/admin/rss/tags/create", feedTag({ status: "CREATED", tag: "quarkus" }), { method: "POST" });
    await stub("/admin/rss/tags/ignore", feedTag({ status: "IGNORED" }), { method: "POST" });
    const v = await signedIn(ADMIN);

    const mapped = await v.post("/admin/tags/feed/map", { name: "quarkus", tag: " java ", back: "" });
    expect(mapped.location).toBe("/admin/tags/feed?done=mapped&t=quarkus&to=java");
    expect((await sent("POST", "/admin/rss/tags/map"))[0].body).toEqual({ name: "quarkus", tag: "java" });
    expect(text((await v.get(mapped.location!)).doc.querySelector("[role=status]"))).toBe("Feed tag “quarkus” now maps to “java”.");

    const created = await v.post("/admin/tags/feed/create", { name: "quarkus", tag: "" });
    expect(created.location).toBe("/admin/tags/feed?done=created&t=quarkus&to=quarkus");
    expect((await sent("POST", "/admin/rss/tags/create"))[0].body).toEqual({ name: "quarkus" });
    expect(text((await v.get(created.location!)).doc.querySelector("[role=status]"))).toBe("Feed tag “quarkus” is now the tag “quarkus”.");

    const ignored = await v.post("/admin/tags/feed/ignore", { name: "quarkus", back: "status=all" });
    expect(ignored.location).toBe("/admin/tags/feed?status=all&done=ignored&t=quarkus");
    expect((await sent("POST", "/admin/rss/tags/ignore"))[0].body).toEqual({ name: "quarkus" });
    expect(text((await v.get("/admin/tags/feed?done=ignored&t=quarkus")).doc.querySelector("[role=status]"))).toBe("Feed tag “quarkus” is ignored: it's on the stoplist.");
  });

  it("asks for a tag before mapping, and says what the API says when it won't", async () => {
    await stub("/admin/rss/tags/map", { status: 400, detail: "“nope” isn't a tag." }, { method: "POST", status: 400 });
    const v = await signedIn(ADMIN);
    const empty = await v.post("/admin/tags/feed/map", { name: "quarkus", tag: "" });
    expect(empty.status).toBe(400);
    expect(text(empty.doc.querySelector(".form-error[role=alert]"))).toBe("Name the tag to map “quarkus” to.");
    expect(await sent("POST", "/admin/rss/tags/map")).toEqual([]);
    const refused = await v.post("/admin/tags/feed/map", { name: "quarkus", tag: "nope" });
    expect(refused.status).toBe(400);
    expect(text(refused.doc.querySelector(".form-error[role=alert]"))).toBe("“nope” isn't a tag.");
  });
});

describe("aliases and the stoplist", () => {
  it("asks before adding an alias, previewing it, and adds the checked one", async () => {
    await stub("/admin/tags/aliases", { tag: "kube", now: ["kubernetes"], posts: 1, factoids: 2 }, { method: "POST" });
    const v = await signedIn(ADMIN);
    const blank = await v.get("/admin/tags/aliases/new");
    expect(text(blank.doc.querySelector("#tag-preview"))).toBe("");
    expect(blank.doc.querySelector("form.tag-ask-confirm")?.hasAttribute("hidden")).toBe(true);
    expect(await sent("POST", "/admin/tags/aliases")).toEqual([]);

    const { doc } = await v.get("/admin/tags/aliases/new?alias=kube&tag=kubernetes");
    expect(text(doc.querySelector("#tag-preview"))).toBe("This re-points 1 post and 2 factoids to “kubernetes”.");
    const confirm = doc.querySelector("form.tag-ask-confirm")!;
    expect(confirm.getAttribute("action")).toBe("/admin/tags/aliases");
    expect(text(confirm.querySelector("button"))).toBe("Make “kube” an alias of “kubernetes”");
    const fields = confirm.querySelectorAll("input").filter((i) => i.getAttribute("name") !== "csrf").map((i) => [i.getAttribute("name")!, i.getAttribute("value") ?? ""] as [string, string]);
    expect(fields).toEqual([["alias", "kube"], ["tag", "kubernetes"]]);

    const added = await v.post("/admin/tags/aliases", fields);
    expect(added.location).toBe("/admin/tags/aliases?done=aliased&t=kube&to=kubernetes&p=1&f=2");
    expect((await sent("POST", "/admin/tags/aliases")).map((r) => [r.query, r.body])).toEqual([
      [{ dryRun: "true" }, { alias: "kube", tag: "kubernetes" }],
      [{}, { alias: "kube", tag: "kubernetes" }],
    ]);
    expect(text((await v.get(added.location!)).doc.querySelector("[role=status]"))).toBe("“kube” is now an alias of “kubernetes”: 1 post and 2 factoids re-pointed.");
  });

  it("refuses an alias preview in the API's words, without Confirm", async () => {
    await stub("/admin/tags/aliases", { status: 400, detail: "“java” is already a tag." }, { method: "POST", status: 400 });
    const v = await signedIn(ADMIN);
    const { doc } = await v.get("/admin/tags/aliases/new?alias=java&tag=kotlin");
    expect(text(doc.querySelector("#tag-preview"))).toBe("Not possible: “java” is already a tag.");
    expect(doc.querySelector("form.tag-ask-confirm")?.hasAttribute("hidden")).toBe(true);
    const json = await fetch(`${inject("appUrl")}/admin/tags/aliases/preview?alias=java&tag=kotlin`, { headers: { Cookie: [...v.cookies].map(([k, c]) => `${k}=${c}`).join("; ") } });
    expect((await json.json()).ok).toBe(false);
  });

  it("asks before removing an alias, then removes it by the query the API takes", async () => {
    await stub("/admin/tags/aliases", { alias: "k8s", tag: "kubernetes", createdBy: "ed", createdAt: "2026-10-07T10:00:00Z" }, { method: "DELETE" });
    const v = await signedIn(ADMIN);
    const asked = await v.get("/admin/tags/aliases/remove?alias=k8s");
    expect(text(asked.doc.querySelector("h1"))).toBe("Remove the alias “k8s”?");
    expect(text(asked.doc.querySelector(".confirm-body"))).toContain("“k8s” no longer means “kubernetes”");
    expect(asked.doc.querySelector(".confirm-page input[name=alias]")?.getAttribute("value")).toBe("k8s");
    expect((await v.get("/admin/tags/aliases/remove?alias=nothing")).status).toBe(404);

    const removed = await v.post("/admin/tags/aliases/remove", { alias: "k8s" });
    expect(removed.location).toBe("/admin/tags/aliases?done=unaliased&t=k8s&to=kubernetes");
    expect((await sent("DELETE", "/admin/tags/aliases"))[0].query).toEqual({ alias: "k8s" });
    expect(text((await v.get(removed.location!)).doc.querySelector("[role=status]"))).toBe("“k8s” is no longer an alias of “kubernetes”.");
  });

  it("stoplists a term and takes one off, at once", async () => {
    await stub("/admin/tags/stoplist", { term: "rumour", createdBy: "ed", createdAt: "2026-10-08T10:00:00Z" }, { method: "POST" });
    await stub("/admin/tags/stoplist", { term: "self hosted", createdBy: "ed", createdAt: "2026-10-07T11:00:00Z" }, { method: "DELETE" });
    const v = await signedIn(ADMIN);
    const added = await v.post("/admin/tags/stoplist", { term: " rumour " });
    expect(added.location).toBe("/admin/tags/stoplist?done=stopped&t=rumour");
    expect((await sent("POST", "/admin/tags/stoplist"))[0].body).toEqual({ term: "rumour" });
    expect(text((await v.get(added.location!)).doc.querySelector("[role=status]"))).toBe("“rumour” is on the stoplist: it's dropped from tags written from now on.");

    const removed = await v.post("/admin/tags/stoplist/remove", { term: "self hosted" });
    expect(removed.location).toBe("/admin/tags/stoplist?done=unstopped&t=self+hosted");
    expect((await sent("DELETE", "/admin/tags/stoplist"))[0].query).toEqual({ term: "self hosted" });
    expect(text((await v.get(removed.location!)).doc.querySelector("[role=status]"))).toBe("“self hosted” is off the stoplist.");
  });

  it("draws the stoplist again with the API's reason, the term kept", async () => {
    await stub("/admin/tags/stoplist", { status: 400, detail: "That's a system tag." }, { method: "POST", status: 400 });
    const v = await signedIn(ADMIN);
    const refused = await v.post("/admin/tags/stoplist", { term: "_sidebar" });
    expect(refused.status).toBe(400);
    expect(text(refused.doc.querySelector(".form-error[role=alert]"))).toBe("That's a system tag.");
    expect(refused.doc.querySelector("#new-stop")?.getAttribute("value")).toBe("_sidebar");
  });
});

describe("the notices and the forms' tokens", () => {
  it("say only fixed words about the names they're given, and nothing for an unknown code", async () => {
    const v = await signedIn(ADMIN);
    expect((await v.get("/admin/tags?done=pwned&t=x")).doc.querySelector("[role=status]")).toBeNull();
    expect(text((await v.get("/admin/tags?done=kept&t=%07bad")).doc.querySelector("[role=status]"))).toBe("The tag is kept as a tag.");
    expect(text((await v.get("/admin/tags?done=aliased&t=a&to=b&p=x&f=1")).doc.querySelector("[role=status]"))).toBe("“a” is now an alias of “b”.");
  });

  it("refuses every step without the page's anti-forgery token", async () => {
    const v = await signedIn(ADMIN);
    const posts: [string, Record<string, string>][] = [
      [`/admin/tags/review/${E1}/alias`, { tag: "compilers" }], [`/admin/tags/review/${E1}/split`, { parts: "a, b" }],
      [`/admin/tags/review/${E1}/keep`, {}], [`/admin/tags/review/${E1}/dismiss`, {}],
      ["/admin/tags/feed/map", { name: "quarkus", tag: "java" }], ["/admin/tags/feed/create", { name: "quarkus" }], ["/admin/tags/feed/ignore", { name: "quarkus" }],
      ["/admin/tags/aliases", { alias: "a", tag: "b" }], ["/admin/tags/aliases/remove", { alias: "k8s" }],
      ["/admin/tags/stoplist", { term: "x" }], ["/admin/tags/stoplist/remove", { term: "x" }],
    ];
    for (const [path, form] of posts) expect((await v.post(path, form, { csrf: false })).status, path).toBe(403);
    expect((await adminCalls()).filter((r) => r.method !== "GET")).toEqual([]);
  });
});
