import { beforeEach, describe, expect, inject, it } from "vitest";
import { text } from "../support/page.ts";
import { ADMIN, signedIn } from "../support/readers.ts";
import { post, requests, resetStubs, stub, stubSite } from "../support/stub.ts";

const sent = async (method: string, path: string) => (await requests()).filter((r) => r.method === method && r.path === path);
const user = (username: string, role = "USER") => ({ id: `019f0000-0000-7000-8000-${username.padStart(12, "0").slice(-12)}`, username, displayName: username.toUpperCase(), role });

beforeEach(async () => {
  await resetStubs();
  await stubSite();
});

describe("the scheduled posts (#35)", () => {
  const SOON = "019f0000-0000-7000-8000-0000000a0035";

  it("list what's to go out, read as the admin, soonest first, each a way to its editor with when it goes out", async () => {
    await stub("/admin/posts/scheduled", { posts: [
      post({ id: SOON, title: "Tomorrow", excerpt: "Out tomorrow.", authorDisplayName: "ada", publishedAt: "2026-10-20T09:00:00Z", versionKinds: ["audio"] }),
      post({ id: "019f0000-0000-7000-8000-0000000a0036", title: "Next week", authorDisplayName: "grace", publishedAt: "2026-10-27T15:30:00Z", versionKinds: [] }),
    ], page: 0, totalPages: 2, totalCount: 21 }, { query: { page: 0, size: 20 } });
    const v = await signedIn(ADMIN);
    const { status, doc } = await v.get("/admin/scheduled");
    const [first, second] = doc.querySelectorAll("article.admin-scheduled");

    expect(status).toBe(200);
    expect(text(doc.querySelector("title"))).toContain("Scheduled posts");
    expect(doc.querySelector("nav.admin-nav a[aria-current=page]")?.getAttribute("href")).toBe("/admin/scheduled");
    expect(text(first.querySelector("h2"))).toBe("Tomorrow");
    expect(first.querySelector("h2 a")?.getAttribute("href")).toBe(`/edit/${SOON}`);
    expect(text(first)).toContain("Out tomorrow.");
    expect(text(first)).toContain("By ada");
    expect(text(first.querySelector("time"))).toBe("October 20, 2026, 9:00 AM UTC");
    expect(first.querySelector("time")?.getAttribute("datetime")).toBe("2026-10-20T09:00:00Z");
    expect(first.querySelector(".audio-mark")).not.toBeNull();
    expect(text(second.querySelector("time"))).toBe("October 27, 2026, 3:30 PM UTC");
    expect(second.querySelector(".audio-mark")).toBeNull();
    expect(doc.querySelector("a.pagelink[rel=prev]")).toBeNull();
    expect(doc.querySelector("a.pagelink[rel=next]")?.getAttribute("href")).toBe("/admin/scheduled?page=1");
    expect((await requests()).find((r) => r.path === "/admin/posts/scheduled")!.headers.authorization).toBe("Bearer access-1");
  });

  it("page on, and back", async () => {
    await stub("/admin/posts/scheduled", { posts: [post({ title: "Later" })], page: 1, totalPages: 2, totalCount: 21 }, { query: { page: 1, size: 20 } });
    const { doc } = await (await signedIn(ADMIN)).get("/admin/scheduled?page=1");

    expect(text(doc.querySelector("article.admin-scheduled h2"))).toBe("Later");
    expect(doc.querySelector("a.pagelink[rel=prev]")?.getAttribute("href")).toBe("/admin/scheduled");
    expect(doc.querySelector("a.pagelink[rel=next]")).toBeNull();
  });

  it("say so when there are none", async () => {
    await stub("/admin/posts/scheduled", { posts: [], page: 0, totalPages: 0, totalCount: 0 }, { query: { page: 0, size: 20 } });
    const { doc } = await (await signedIn(ADMIN)).get("/admin/scheduled");

    expect(doc.querySelector("article.admin-scheduled")).toBeNull();
    expect(text(doc.querySelector("main"))).toContain("No scheduled posts");
  });

  it("say so when the API can't", async () => {
    await stub("/admin/posts/scheduled", { detail: "down" }, { query: { page: 0, size: 20 }, status: 503 });
    const { status, doc } = await (await signedIn(ADMIN)).get("/admin/scheduled");

    expect(status).toBe(200);
    expect(text(doc.querySelector("[role=alert]"))).toBe("The scheduled posts can't be loaded just now. Try again shortly.");
  });
});

describe("the pending drafts", () => {
  const DRAFT = "019f0000-0000-7000-8000-0000000a0001";

  beforeEach(async () => {
    await stub("/admin/posts/pending", { posts: [post({ id: DRAFT, title: "Midden", excerpt: "Reads heap dumps.", authorDisplayName: "ada", categories: ["Guides"] })], page: 0, totalPages: 2, totalCount: 21 },
      { query: { page: 0, size: 20, deleted: "false" } });
    await stub("/admin/posts/pending", { posts: [], page: 0, totalPages: 0, totalCount: 0 }, { query: { page: 0, size: 20, deleted: "true" } });
  });

  it("list what's waiting, read as the admin, each with its way to the editor, approval and deletion", async () => {
    const v = await signedIn(ADMIN);
    const { doc } = await v.get("/admin/pending");
    const draft = doc.querySelector("article.admin-draft")!;

    expect(text(draft.querySelector("h2"))).toBe("Midden");
    expect(text(draft)).toContain("Reads heap dumps.");
    expect(text(draft)).toContain("By ada");
    expect(draft.querySelectorAll("a").map((a) => a.getAttribute("href"))).toEqual(expect.arrayContaining([
      `/edit/${DRAFT}`, `/edit/${DRAFT}/approve?return=%2Fadmin%2Fpending`, `/edit/${DRAFT}/delete`,
    ]));
    expect(doc.querySelector("a.pagelink[rel=next]")?.getAttribute("href")).toBe("/admin/pending?page=1");
    expect((await requests()).find((r) => r.path === "/admin/posts/pending")!.headers.authorization).toBe("Bearer access-1");
  });

  it("have a tab for the deleted ones, which say so when there are none", async () => {
    const v = await signedIn(ADMIN);
    const { doc } = await v.get("/admin/pending?deleted");
    expect(doc.querySelector("nav.admin-tabs a[aria-current=page]")?.getAttribute("href")).toBe("/admin/pending?deleted");
    expect(text(doc.querySelector("main"))).toContain("No deleted drafts");
  });

  it("come back from an approval asked from the list, saying so", async () => {
    await stub(`/posts/${DRAFT}`, { id: DRAFT, title: "Midden", slug: "2026/09/midden", status: "DRAFT", markdownSource: "x", tags: [], categories: [] });
    await stub(`/admin/posts/${DRAFT}/approve`, {}, { method: "PUT" });
    const v = await signedIn(ADMIN);
    const ask = (await v.get(`/edit/${DRAFT}/approve?return=%2Fadmin%2Fpending`)).doc;
    expect(ask.querySelector("input[name=return]")?.getAttribute("value")).toBe("/admin/pending");

    const done = await v.post(`/edit/${DRAFT}/approve`, { publishedAt: "2026-10-02T09:00", return: "/admin/pending" });
    expect(done.location).toBe("/admin/pending?done=approved");
    expect(text((await v.get(done.location!)).doc.querySelector("[role=status]"))).toBe("Approved and published.");
  });

  it("come back from a deletion, saying so", async () => {
    const v = await signedIn(ADMIN);
    expect(text((await v.get("/admin/pending?done=deleted")).doc.querySelector("[role=status]"))).toBe("Deleted. It's in the Deleted list.");
    expect(text((await v.get("/admin/pending?done=purged")).doc.querySelector("[role=status]"))).toBe("Deleted for good.");
    // Only the words the app has: nothing else is said.
    expect((await v.get("/admin/pending?done=%3Cb%3Ehi")).doc.querySelector("[role=status]")).toBeNull();
  });
});

describe("the users", () => {
  beforeEach(async () => {
    await stub("/admin/users", [user("ada"), user("ed", "ADMIN")], { query: { status: "ACTIVE" } });
    await stub("/admin/users", [user("mallory")], { query: { status: "SUSPENDED" } });
    await stub("/admin/users", [user("gone")], { query: { status: "ERASED" } });
  });

  it("list the active ones, read as the admin, with what may be done to each", async () => {
    const v = await signedIn(ADMIN);
    const { doc } = await v.get("/admin/users");
    const ada = doc.querySelector("#user-ada")!;

    expect(doc.querySelectorAll(".admin-user h3").map((h) => text(h))).toEqual(["ADA", "ED"]);
    expect(text(ada)).toContain("ada");
    expect(text(ada)).toContain("USER");
    const role = ada.querySelector("form[action='/admin/users/ada/role']")!;
    expect(role.querySelectorAll("select[name=newRole] option").map((o) => o.getAttribute("value"))).toEqual(["USER", "ADMIN", "SUPER_ADMIN"]);
    expect(role.querySelector("option[selected]")?.getAttribute("value")).toBe("USER");
    expect(ada.querySelector("a[href='/admin/users/ada/suspend']")).not.toBeNull();
    expect(ada.querySelector("a[href='/admin/users/ada/erase']")).not.toBeNull();
    expect(ada.querySelector("a[href='/admin/users/ada/export']")).not.toBeNull();
    expect((await requests()).find((r) => r.path === "/admin/users")!.headers.authorization).toBe("Bearer access-1");
  });

  it("change a role as the admin, and say so", async () => {
    await stub("/admin/users/ada/role", user("ada", "ADMIN"), { method: "PUT" });
    const v = await signedIn(ADMIN);
    const done = await v.post("/admin/users/ada/role", { newRole: "ADMIN" });

    expect(done.location).toBe("/admin/users?done=role&who=ada");
    const [put] = await sent("PUT", "/admin/users/ada/role");
    expect(put.body).toEqual({ newRole: "ADMIN" });
    expect(put.headers.authorization).toBe("Bearer access-1");
    expect(text((await v.get(done.location!)).doc.querySelector("[role=status]"))).toBe("Changed ada's role.");
  });

  it("suspend, asked first; unsuspend; erase, asked first", async () => {
    await stub("/admin/users/ada/suspend", { message: "ok" }, { method: "PUT" });
    await stub("/admin/users/mallory/unsuspend", { message: "ok" }, { method: "PUT" });
    await stub("/admin/users/ada", { message: "ok" }, { method: "DELETE" });
    const v = await signedIn(ADMIN);

    expect(text((await v.get("/admin/users/ada/suspend")).doc.querySelector("main h1"))).toBe("Suspend ada?");
    expect((await v.post("/admin/users/ada/suspend", {})).location).toBe("/admin/users?done=suspended&who=ada");
    expect((await v.post("/admin/users/mallory/unsuspend", {})).location).toBe("/admin/users?status=SUSPENDED&done=unsuspended&who=mallory");
    expect(text((await v.get("/admin/users/ada/erase")).doc.querySelector("main"))).toContain("Erase ada?");
    expect((await v.post("/admin/users/ada/erase", {})).location).toBe("/admin/users?done=erased&who=ada");

    expect((await sent("PUT", "/admin/users/ada/suspend")).length).toBe(1);
    expect((await sent("PUT", "/admin/users/mallory/unsuspend")).length).toBe(1);
    expect((await sent("DELETE", "/admin/users/ada")).length).toBe(1);
  });

  it("show the suspended ones with a way back, and the erased ones with their content to purge", async () => {
    await stub("/admin/users/gone/purge", { message: "ok" }, { method: "DELETE" });
    const v = await signedIn(ADMIN);
    const suspended = (await v.get("/admin/users?status=SUSPENDED")).doc;
    expect(suspended.querySelector("#user-mallory form[action='/admin/users/mallory/unsuspend']")).not.toBeNull();
    expect(suspended.querySelector("#user-mallory form[action$='/role']")).toBeNull();

    const erased = (await v.get("/admin/users?status=ERASED")).doc;
    expect(erased.querySelector("#user-gone a[href='/admin/users/gone/purge']")).not.toBeNull();
    expect(text((await v.get("/admin/users/gone/purge")).doc.querySelector("main"))).toContain("cannot be undone");
    expect((await v.post("/admin/users/gone/purge", {})).location).toBe("/admin/users?status=ERASED&done=purged&who=gone");
    expect((await sent("DELETE", "/admin/users/gone/purge")).length).toBe(1);
  });

  it("say what the API says when it won't", async () => {
    await stub("/admin/users/ed/role", { status: 403, detail: "Only a super admin may do that." }, { method: "PUT", status: 403 });
    const v = await signedIn(ADMIN);
    const { status, doc } = await v.post("/admin/users/ed/role", { newRole: "SUPER_ADMIN" });
    expect(status).toBe(400);
    expect(text(doc.querySelector(".form-error[role=alert]"))).toBe("Only a super admin may do that.");
  });

  it("export a user's data for review, as a download", async () => {
    await stub("/admin/users/ada/export", { user: { username: "ada" } });
    const v = await signedIn(ADMIN);
    const response = await fetch(`${inject("appUrl")}/admin/users/ada/export`, { headers: { Cookie: `session_id=${v.cookies.get("session_id")}` } });
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="bytecode-news-ada.json"');
    expect(await response.json()).toEqual({ user: { username: "ada" } });
  });

  it("take only names that are names", async () => {
    const v = await signedIn(ADMIN);
    expect((await v.post("/admin/users/a%2Fb/suspend", {})).status).toBe(404);
    expect((await v.post("/admin/users/ada/role", { newRole: "OVERLORD" })).status).toBe(400);
    expect(await sent("PUT", "/admin/users/ada/role")).toEqual([]);
  });

  it("refuse a form posted without the admin's anti-forgery token", async () => {
    const v = await signedIn(ADMIN);
    expect((await v.post("/admin/users/ada/suspend", {}, { csrf: false })).status).toBe(403);
    expect(await sent("PUT", "/admin/users/ada/suspend")).toEqual([]);
  });
});

describe("the categories", () => {
  const GUIDES = "019f0000-0000-7000-8000-0000000c0001";
  const JVM = "019f0000-0000-7000-8000-0000000c0003";

  beforeEach(async () => {
    await stub("/categories", [
      { id: GUIDES, name: "Guides", slug: "guides", parentName: null },
      { id: JVM, name: "JVM", slug: "jvm", parentName: "Guides" },
      { id: "019f0000-0000-7000-8000-0000000c0002", name: "_sidebar", slug: "_sidebar", parentName: null },
    ]);
  });

  it("list each with its subcategories under it, and a form for a new one", async () => {
    const v = await signedIn(ADMIN);
    const { doc } = await v.get("/admin/categories");

    expect(doc.querySelectorAll(".admin-category > h3").map((h) => text(h))).toEqual(["Guides", "_sidebar"]);
    expect(text(doc.querySelector(`#category-${GUIDES} .admin-subcategories`))).toContain("JVM");
    const form = doc.querySelector("form[action='/admin/categories']")!;
    expect(form.querySelectorAll("select[name=parentId] option").map((o) => text(o))).toEqual(["(top-level)", "Guides", "_sidebar"]);
    expect(doc.querySelector(`a[href='/admin/categories/${JVM}/delete']`)).not.toBeNull();
  });

  it("create one as the admin, under a parent or not", async () => {
    await stub("/admin/categories", { id: "x", name: "Kotlin" }, { method: "POST", status: 201 });
    const v = await signedIn(ADMIN);
    const done = await v.post("/admin/categories", { name: " Kotlin ", parentId: GUIDES });
    await v.post("/admin/categories", { name: "News", parentId: "" });

    expect(done.location).toBe("/admin/categories?done=created");
    const posts = await sent("POST", "/admin/categories");
    expect(posts.map((p) => p.body)).toEqual([{ name: "Kotlin", parentId: GUIDES }, { name: "News", parentId: null }]);
    expect(posts[0].headers.authorization).toBe("Bearer access-1");
  });

  it("want a name, and say what the API says when it won't", async () => {
    await stub("/admin/categories", { status: 409, detail: "There's a Guides already." }, { method: "POST", status: 409 });
    const v = await signedIn(ADMIN);
    const blank = await v.post("/admin/categories", { name: " " });
    expect(blank.status).toBe(400);
    expect(text(blank.doc.querySelector("#category-name-error"))).toBe("Give the category a name.");

    const refused = await v.post("/admin/categories", { name: "Guides" });
    expect(text(refused.doc.querySelector("#category-name-error"))).toBe("There's a Guides already.");
    expect(refused.doc.querySelector("input[name=name]")?.getAttribute("value")).toBe("Guides");
  });

  it("delete one, asked first", async () => {
    await stub(`/admin/categories/${JVM}`, { message: "ok" }, { method: "DELETE" });
    const v = await signedIn(ADMIN);
    expect(text((await v.get(`/admin/categories/${JVM}/delete`)).doc.querySelector("main h1"))).toBe("Delete the “JVM” category?");
    expect((await v.post(`/admin/categories/${JVM}/delete`, {})).location).toBe("/admin/categories?done=deleted");
    expect((await sent("DELETE", `/admin/categories/${JVM}`))[0].headers.authorization).toBe("Bearer access-1");
  });
});
