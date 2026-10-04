import { beforeEach, describe, expect, inject, it } from "vitest";
import { text } from "../support/page.ts";
import { ADMIN, signedIn } from "../support/readers.ts";
import { requests, resetStubs, stub, stubSite } from "../support/stub.ts";
import { Visitor } from "../support/visitor.ts";

const ID = "019f0000-0000-7000-8000-0000000a0001";
const GUIDES = "019f0000-0000-7000-8000-0000000c0001";
const SIDEBAR = "019f0000-0000-7000-8000-0000000c0002";
const EDIT = `/edit/${ID}`;

function post(fields: Record<string, unknown> = {}) {
  return {
    id: ID, title: "Midden", slug: "2026/09/midden", markdownSource: "Midden reads **heap dumps**.", excerpt: "Reads heap dumps.",
    renderedHtml: "<p>Midden reads <strong>heap dumps</strong>.</p>", authorDisplayName: "dreamreal", status: "APPROVED",
    publishedAt: "2026-09-21T15:00:00Z", sortOrder: 0, tags: ["jvm", "tools"], categories: ["Guides"], ...fields,
  };
}

/** The editor's fields as the page fills them, with [fields] changed. */
async function fields(v: Visitor, changes: Record<string, string> = {}) {
  const { doc } = await v.get(EDIT);
  const form = doc.querySelector("form#editor")!;
  const values: Record<string, string> = {};
  for (const input of form.querySelectorAll("input[name], textarea[name]")) {
    const name = input.getAttribute("name")!;
    if (name === "categoryIds") {
      if (input.hasAttribute("checked")) values.categoryIds = input.getAttribute("value")!;
      continue;
    }
    values[name] = input.tagName === "TEXTAREA" ? input.textContent : input.getAttribute("value") || "";
  }
  delete values.csrf;
  return { ...values, ...changes };
}

const sent = async (method: string, path: string) => (await requests()).filter((r) => r.method === method && r.path === path);

beforeEach(async () => {
  await resetStubs();
  await stubSite();
  await stub(`/posts/${ID}`, post());
  await stub("/categories", [{ id: GUIDES, name: "Guides", slug: "guides" }, { id: SIDEBAR, name: "_sidebar", slug: "_sidebar" }]);
});

describe("the editor", () => {
  it("is for admins: anyone else finds nothing there", async () => {
    expect((await new Visitor().get(EDIT)).status).toBe(404);
    expect((await (await signedIn()).get(EDIT)).status).toBe(404);
    expect((await (await signedIn()).post(EDIT, { title: "x" })).status).toBe(404);
  });

  it("opens the post as the admin, every field filled, the publish date in UTC", async () => {
    const v = await signedIn(ADMIN);
    const { status, doc } = await v.get(EDIT);
    const form = doc.querySelector("form#editor")!;

    expect(status).toBe(200);
    expect(form.getAttribute("action")).toBe(EDIT);
    expect(form.querySelector("input[name=title]")?.getAttribute("value")).toBe("Midden");
    expect(form.querySelector("input[name=slug]")?.getAttribute("value")).toBe("2026/09/midden");
    expect(form.querySelector("textarea[name=markdownSource]")?.textContent).toBe("Midden reads **heap dumps**.");
    expect(form.querySelector("textarea[name=summary]")?.textContent).toBe("Reads heap dumps.");
    expect(form.querySelector("input[name=tags]")?.getAttribute("value")).toBe("jvm, tools");
    expect(form.querySelectorAll("input[name=categoryIds][checked]").map((c) => c.getAttribute("value"))).toEqual([GUIDES]);
    // The site's own categories too: admins file pages under them.
    expect(form.querySelector(`input[name=categoryIds][value='${SIDEBAR}']`)).not.toBeNull();
    expect(form.querySelector("input[name=publishedAt]")?.getAttribute("value")).toBe("2026-09-21T15:00");
    expect(form.querySelector("input[name=sortOrder]")?.getAttribute("value")).toBe("0");
    expect(doc.querySelector(".editor-preview strong")?.textContent).toBe("heap dumps");
    expect((await requests()).find((r) => r.path === `/posts/${ID}`)!.headers.authorization).toBe("Bearer access-1");
  });

  it("sets the title in monospace, as the submission form does", async () => {
    const v = await signedIn(ADMIN);
    expect((await v.get(EDIT)).doc.querySelector("input[name=title]")?.classList.contains("form-mono")).toBe(true);
  });

  it("is private, and titled for the post", async () => {
    const v = await signedIn(ADMIN);
    const response = await fetch(`${inject("appUrl")}${EDIT}`, { headers: { Cookie: `session_id=${v.cookies.get("session_id")}` } });
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(text((await v.get(EDIT)).doc.querySelector("title"))).toBe("Edit: Midden | ByteCode.News");
  });

  it("isn't found for a post the API hasn't got, or an id that isn't one", async () => {
    const v = await signedIn(ADMIN);
    expect((await v.get("/edit/019f0000-0000-7000-8000-0000000a0099")).status).toBe(404);
    expect((await v.get("/edit/nope")).status).toBe(404);
  });
});

describe("saving an edit", () => {
  it("sends every field to the admin endpoint, as the admin, and says so", async () => {
    await stub(`/admin/posts/${ID}`, post({ title: "Midden 2" }), { method: "PUT" });
    const v = await signedIn(ADMIN);
    const done = await v.post(EDIT, await fields(v, { title: " Midden 2 ", tags: "jvm, Tools, tools, heap", sortOrder: "3", publishedAt: "2026-09-22T08:30" }));

    expect(done.status).toBe(303);
    expect(done.location).toBe(`${EDIT}?saved`);
    const [put] = await sent("PUT", `/admin/posts/${ID}`);
    expect(put.headers.authorization).toBe("Bearer access-1");
    expect(put.body).toEqual({
      title: "Midden 2",
      markdownSource: "Midden reads **heap dumps**.",
      slug: "2026/09/midden",
      tags: ["jvm", "Tools", "heap"],
      categoryIds: [GUIDES],
      summary: "Reads heap dumps.",
      publishedAt: "2026-09-22T08:30:00.000Z",
      sortOrder: 3,
    });
    expect(text((await v.get(done.location!)).doc.querySelector("[role=status]"))).toBe("Saved.");
  });

  it("keeps every category checked", async () => {
    await stub(`/admin/posts/${ID}`, post(), { method: "PUT" });
    const v = await signedIn(ADMIN);
    const { categoryIds: _, ...rest } = await fields(v);
    await v.post(EDIT, [...Object.entries(rest), ["categoryIds", GUIDES], ["categoryIds", SIDEBAR]]);
    const [put] = await sent("PUT", `/admin/posts/${ID}`);
    expect((put.body as { categoryIds: string[] }).categoryIds).toEqual([GUIDES, SIDEBAR]);
  });

  it("sends an empty summary, date or sort order as none", async () => {
    await stub(`/admin/posts/${ID}`, post(), { method: "PUT" });
    const v = await signedIn(ADMIN);
    await v.post(EDIT, await fields(v, { summary: " ", publishedAt: "", sortOrder: "" }));
    const [put] = await sent("PUT", `/admin/posts/${ID}`);
    expect(put.body).toMatchObject({ summary: null, publishedAt: null, sortOrder: null });
  });

  it("wants a title, a post and an address, a date that is one and a whole number, keeping what was typed", async () => {
    const v = await signedIn(ADMIN);
    const { status, doc } = await v.post(EDIT, await fields(v, { title: "", markdownSource: " ", slug: "", publishedAt: "soon", sortOrder: "1.5" }));

    expect(status).toBe(400);
    expect(text(doc.querySelector("#edit-title-error"))).toBe("Give the post a title.");
    expect(text(doc.querySelector("#edit-body-error"))).toBe("Write the post.");
    expect(text(doc.querySelector("#edit-slug-error"))).toBe("Give the post an address.");
    expect(text(doc.querySelector("#edit-published-error"))).toBe("Give a date and time, or leave it empty.");
    expect(text(doc.querySelector("#edit-sort-error"))).toBe("A whole number, or leave it empty.");
    expect(doc.querySelector("input[name=sortOrder]")?.getAttribute("value")).toBe("1.5");
    expect(await sent("PUT", `/admin/posts/${ID}`)).toEqual([]);
  });

  it("says what the API says when it won't take the edit, keeping it", async () => {
    await stub(`/admin/posts/${ID}`, { status: 409, detail: "That address is taken." }, { method: "PUT", status: 409 });
    const v = await signedIn(ADMIN);
    const { status, doc } = await v.post(EDIT, await fields(v, { slug: "2026/09/taken" }));

    expect(status).toBe(400);
    expect(text(doc.querySelector(".form-error[role=alert]"))).toBe("That address is taken.");
    expect(doc.querySelector("input[name=slug]")?.getAttribute("value")).toBe("2026/09/taken");
  });

  it("refuses a form posted without the admin's anti-forgery token", async () => {
    const v = await signedIn(ADMIN);
    expect((await v.post(EDIT, await fields(v), { csrf: false })).status).toBe(403);
    expect(await sent("PUT", `/admin/posts/${ID}`)).toEqual([]);
  });
});

describe("the editor's preview and helpers", () => {
  it("previews what was typed, without saving it", async () => {
    const v = await signedIn(ADMIN);
    const { status, doc } = await v.post(EDIT, await fields(v, { helper: "preview", markdownSource: "Now *new*. <script>x</script>" }));

    expect(status).toBe(200);
    expect(doc.querySelector(".editor-preview em")?.textContent).toBe("new");
    expect(doc.querySelector(".editor-preview script")).toBeNull();
    expect(doc.querySelector("textarea[name=markdownSource]")?.textContent).toBe("Now *new*. <script>x</script>");
    expect(await sent("PUT", `/admin/posts/${ID}`)).toEqual([]);
  });

  it("previews as the admin types, when there's script, for admins alone", async () => {
    const v = await signedIn(ADMIN);
    const live = await v.post(`${EDIT}/preview`, { markdownSource: "**live**" });
    expect(live.status).toBe(200);
    expect(live.html.trim()).toBe("<p><strong>live</strong></p>");

    const reader = await signedIn();
    expect((await reader.post(`${EDIT}/preview`, { markdownSource: "x" })).status).toBe(404);
  });

  it("add suggested tags, AI tags for the post itself, and a derived summary", async () => {
    await stub("/posts/derive-tags", { tags: ["heap"] }, { method: "POST" });
    await stub(`/admin/posts/${ID}/derive-tags`, { tags: ["memory"] }, { method: "POST" });
    await stub("/posts/derive-summary", { summary: "A heap-dump reader." }, { method: "POST" });
    const v = await signedIn(ADMIN);

    const suggested = (await v.post(EDIT, await fields(v, { helper: "suggest-tags" }))).doc;
    expect(suggested.querySelector("input[name=tags]")?.getAttribute("value")).toBe("jvm, tools, heap");
    const ai = (await v.post(EDIT, await fields(v, { helper: "ai-tags" }))).doc;
    expect(ai.querySelector("input[name=tags]")?.getAttribute("value")).toBe("jvm, tools, memory");
    const summary = (await v.post(EDIT, await fields(v, { helper: "derive-summary" }))).doc;
    expect(summary.querySelector("textarea[name=summary]")?.textContent).toBe("A heap-dump reader.");
    expect(text(summary.querySelector("#helper-summary"))).toContain("Summary derived.");
    expect(await sent("PUT", `/admin/posts/${ID}`)).toEqual([]);
  });
});

describe("approving a draft", () => {
  beforeEach(async () => {
    await stub(`/posts/${ID}`, post({ status: "DRAFT", publishedAt: null }));
  });

  it("is offered for a draft, asked first with when to publish it, now by default", async () => {
    const v = await signedIn(ADMIN);
    const link = (await v.get(EDIT)).doc.querySelector(`a[href='${EDIT}/approve']`);
    expect(link).not.toBeNull();

    const { status, doc } = await v.get(`${EDIT}/approve`);
    const at = doc.querySelector(`form[action='${EDIT}/approve'] input[name=publishedAt]`)?.getAttribute("value") || "";
    expect(status).toBe(200);
    expect(Math.abs(Date.parse(`${at}:00Z`) - Date.now())).toBeLessThan(5 * 60_000);
  });

  it("publishes it as the admin, on the date given, and says so", async () => {
    await stub(`/admin/posts/${ID}/approve`, post(), { method: "PUT" });
    const v = await signedIn(ADMIN);
    const done = await v.post(`${EDIT}/approve`, { publishedAt: "2026-10-02T09:00" });

    expect(done.location).toBe(`${EDIT}?approved`);
    const [put] = await sent("PUT", `/admin/posts/${ID}/approve`);
    expect(put.headers.authorization).toBe("Bearer access-1");
    expect(put.body).toEqual({ publishedAt: "2026-10-02T09:00:00.000Z" });
  });

  it("is offered at the foot of the editor, beside Save, not at the top", async () => {
    const v = await signedIn(ADMIN);
    const { doc } = await v.get(EDIT);
    const foot = doc.querySelector(".editor-actions")!;

    expect(foot.querySelector("button[type=submit]")?.textContent).toBe("Save");
    expect(foot.querySelector(`a[href='${EDIT}/approve']`)).not.toBeNull();
    expect(foot.querySelector(`a[href='${EDIT}/delete']`)).not.toBeNull();
    expect(doc.querySelector(`main header a[href='${EDIT}/approve']`)).toBeNull();
  });

  it("isn't offered for a post already published", async () => {
    await stub(`/posts/${ID}`, post());
    const v = await signedIn(ADMIN);
    expect((await v.get(EDIT)).doc.querySelector(`a[href='${EDIT}/approve']`)).toBeNull();
  });
});

describe("deleting a post", () => {
  it("is asked first, and for good asked again", async () => {
    const v = await signedIn(ADMIN);
    const editor = (await v.get(EDIT)).doc;
    expect(editor.querySelector(`a[href='${EDIT}/delete']`)).not.toBeNull();

    const soft = (await v.get(`${EDIT}/delete`)).doc;
    expect(soft.querySelector(`form[action='${EDIT}/delete']`)).not.toBeNull();
    expect(soft.querySelector(`a[href='${EDIT}/delete?hard=true']`)).not.toBeNull();
    const hard = (await v.get(`${EDIT}/delete?hard=true`)).doc;
    expect(text(hard.querySelector("main"))).toContain("cannot be undone");
    expect(hard.querySelector("input[name=hard]")?.getAttribute("value")).toBe("true");
  });

  it("deletes it as the admin, softly or for good, and goes to the drafts", async () => {
    await stub(`/admin/posts/${ID}`, { message: "Deleted." }, { method: "DELETE" });
    const v = await signedIn(ADMIN);
    const soft = await v.post(`${EDIT}/delete`, {});
    await v.post(`${EDIT}/delete`, { hard: "true" });

    expect(soft.location).toBe("/admin/pending?done=deleted");
    const deletes = await sent("DELETE", `/admin/posts/${ID}`);
    expect(deletes.map((d) => d.query.hard)).toEqual([undefined, "true"]);
    expect(deletes[0].headers.authorization).toBe("Bearer access-1");
  });
});

describe("a post, for an admin", () => {
  it("links to its editor; for anyone else, it doesn't", async () => {
    await stub("/posts/2026/09/midden", post());
    await stub("/posts/2026/09/midden/comments", { comments: [], totalActiveCount: 0 });
    const admin = await signedIn(ADMIN);
    expect((await admin.get("/posts/2026/09/midden")).doc.querySelector(`article a[href='${EDIT}']`)).not.toBeNull();
    expect((await (await signedIn()).get("/posts/2026/09/midden")).doc.querySelector(`a[href='${EDIT}']`)).toBeNull();
  });
});
