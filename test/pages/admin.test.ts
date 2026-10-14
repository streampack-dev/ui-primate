import { beforeEach, describe, expect, inject, it } from "vitest";
import { text } from "../support/page.ts";
import { ADMIN, signedIn } from "../support/readers.ts";
import { list, post, requests, resetStubs, stub, stubSite } from "../support/stub.ts";
import { Visitor } from "../support/visitor.ts";

const user = (username: string, role = "USER") => ({ id: `019f0000-0000-7000-8000-${username.padStart(12, "0").slice(-12)}`, username, displayName: username.toUpperCase(), role });

beforeEach(async () => {
  await resetStubs();
  await stubSite();
  await stub("/admin/posts/pending", { posts: [post()], page: 0, totalPages: 4, totalCount: 4 }, { query: { page: 0, size: 1, deleted: "false" } });
  await stub("/admin/posts/scheduled", { posts: [post()], page: 0, totalPages: 2, totalCount: 2 }, { query: { page: 0, size: 1 } });
  await stub("/posts", { posts: [post()], page: 0, totalPages: 120, totalCount: 120 }, { query: { page: 0, size: 1 } });
  await stub("/admin/users", [user("ada"), user("ed", "ADMIN"), user("grace")], { query: { status: "ACTIVE" } });
  await stub("/admin/users", [user("mallory")], { query: { status: "SUSPENDED" } });
  await stub("/categories", [
    { id: "019f0000-0000-7000-8000-0000000c0001", name: "Guides", slug: "guides", parentName: null },
    { id: "019f0000-0000-7000-8000-0000000c0003", name: "JVM", slug: "jvm", parentName: "Guides" },
  ]);
  await stub("/taxonomy", { tags: { jvm: 12, kotlin: 30, tools: 2 }, categories: { guides: 7, jvm: 3 } });
});

describe("the admin pages", () => {
  it("are for admins: anyone else finds nothing there", async () => {
    for (const path of ["/admin", "/admin/pending", "/admin/scheduled", "/admin/users", "/admin/categories"]) {
      expect((await new Visitor().get(path)).status, path).toBe(404);
      expect((await (await signedIn()).get(path)).status, path).toBe(404);
    }
  });

  it("share a heading and a way between them, the current one marked, and are private", async () => {
    const v = await signedIn(ADMIN);
    const { doc } = await v.get("/admin/users");
    const nav = doc.querySelector("nav.admin-nav")!;

    expect(text(doc.querySelector("main h1"))).toBe("Site Management");
    expect(nav.querySelectorAll("a").map((a) => a.getAttribute("href"))).toEqual(["/admin", "/admin/pending", "/admin/scheduled", "/admin/users", "/admin/categories", "/admin/moderation", "/admin/tags"]);
    expect(nav.querySelector("a[aria-current=page]")?.getAttribute("href")).toBe("/admin/users");
    const response = await fetch(`${inject("appUrl")}/admin`, { headers: { Cookie: `session_id=${v.cookies.get("session_id")}` } });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
});

describe("the admin dashboard", () => {
  it("counts drafts waiting, posts scheduled and published, and active and suspended readers, each a way in", async () => {
    const v = await signedIn(ADMIN);
    const { doc } = await v.get("/admin");
    const stats = Object.fromEntries(doc.querySelectorAll(".admin-stat").map((s) => [text(s.querySelector(".admin-stat-label")), text(s.querySelector(".admin-stat-value"))]));

    expect(stats).toEqual({ "Pending Drafts": "4", Scheduled: "2", Published: "120", "Active Users": "3", Suspended: "1" });
    expect(doc.querySelector(".admin-stat a[href='/admin/pending']")).not.toBeNull();
    expect(doc.querySelector(".admin-stat a[href='/admin/scheduled']")).not.toBeNull();
    const pending = (await requests()).find((r) => r.path === "/admin/posts/pending")!;
    expect(pending.headers.authorization).toBe("Bearer access-1");
  });

  it("lists the categories with their posts, and the most used tags, most first", async () => {
    const v = await signedIn(ADMIN);
    const { doc } = await v.get("/admin");

    expect(doc.querySelectorAll(".admin-categories li").map((li) => text(li))).toEqual(["Guides 7 posts", "JVM in Guides 3 posts"]);
    expect(doc.querySelectorAll(".admin-tags a").map((a) => text(a))).toEqual(["kotlin (30)", "jvm (12)", "tools (2)"]);
    expect(doc.querySelector(".admin-tags a")?.getAttribute("href")).toBe("/tags/kotlin");
  });

  it("shows what it can when the API can't say", async () => {
    await stub("/admin/users", { detail: "down" }, { query: { status: "SUSPENDED" }, status: 503 });
    const v = await signedIn(ADMIN);
    const { status, doc } = await v.get("/admin");
    const stats = Object.fromEntries(doc.querySelectorAll(".admin-stat").map((s) => [text(s.querySelector(".admin-stat-label")), text(s.querySelector(".admin-stat-value"))]));

    expect(status).toBe(200);
    expect(stats.Suspended).toBe("--");
    expect(stats.Published).toBe("120");
  });
});

describe("the RSS feeds as OPML", () => {
  it("download as the admin", async () => {
    await fetch(`${inject("stubApi")}/__stub`, {
      method: "POST",
      body: JSON.stringify({ path: "/admin/rss/opml", query: {}, answer: { raw: '<?xml version="1.0"?><opml version="2.0"/>', headers: { "Content-Type": "text/x-opml" } } }),
    });
    const v = await signedIn(ADMIN);
    const response = await fetch(`${inject("appUrl")}/admin/rss/opml`, { headers: { Cookie: `session_id=${v.cookies.get("session_id")}` } });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="feeds.opml"');
    expect(await response.text()).toContain("<opml");
    expect((await requests()).find((r) => r.path === "/admin/rss/opml")!.headers.authorization).toBe("Bearer access-1");
  });

  it("import from what's pasted, as OPML or as a list of addresses, and say how it went", async () => {
    await stub("/admin/rss/opml/import", { message: "Imported 2 feeds." }, { method: "POST" });
    const v = await signedIn(ADMIN);
    const done = await v.post("/admin/rss/opml/import", { payload: " https://inside.java/feed.xml\nhttps://example.org/rss \n" });
    // The API's own word, shown on the dashboard there and then (it can't be carried in an address
    // without letting anyone put words in its mouth).
    expect(done.status).toBe(200);
    expect(text(done.doc.querySelector("#opml [role=status]"))).toBe("Imported 2 feeds.");

    await v.post("/admin/rss/opml/import", { payload: '<?xml version="1.0"?><opml/>' });
    const imports = (await requests()).filter((r) => r.path === "/admin/rss/opml/import");
    expect(imports.map((r) => r.headers["content-type"])).toEqual(["text/plain", "application/xml"]);
    expect(imports[0].body).toBe("https://inside.java/feed.xml\nhttps://example.org/rss");
    expect(imports[0].headers.authorization).toBe("Bearer access-1");
  });

  it("want something pasted before importing", async () => {
    const v = await signedIn(ADMIN);
    const { status, doc } = await v.post("/admin/rss/opml/import", { payload: "  " });
    expect(status).toBe(400);
    expect(text(doc.querySelector("#opml-error"))).toBe("Paste OPML or feed addresses before importing.");
    expect((await requests()).some((r) => r.path === "/admin/rss/opml/import")).toBe(false);
  });

  it("say what the API says when it won't import, keeping what was pasted", async () => {
    await stub("/admin/rss/opml/import", { status: 400, detail: "That isn't OPML." }, { method: "POST", status: 400 });
    const v = await signedIn(ADMIN);
    const { status, doc } = await v.post("/admin/rss/opml/import", { payload: "<nope>" });
    expect(status).toBe(400);
    expect(text(doc.querySelector("#opml-error"))).toBe("That isn't OPML.");
    expect(doc.querySelector("textarea[name=payload]")?.textContent).toBe("<nope>");
  });
});
