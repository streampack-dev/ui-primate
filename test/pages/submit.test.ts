import { beforeEach, describe, expect, it } from "vitest";
import { text } from "../support/page.ts";
import { ADMIN, signedIn } from "../support/readers.ts";
import { requests, resetStubs, stub, stubSite } from "../support/stub.ts";
import { Visitor } from "../support/visitor.ts";

const GUIDES = "019f0000-0000-7000-8000-0000000c0001";
const UNSAVED = "00000000-0000-0000-0000-000000000000";

beforeEach(async () => {
  await resetStubs();
  await stubSite();
  await stub("/categories", [
    { id: GUIDES, name: "Guides", slug: "guides" },
    { id: "019f0000-0000-7000-8000-0000000c0002", name: "_sidebar", slug: "_sidebar" },
  ]);
});

/** What the API answers a post it takes. */
function created(fields: Record<string, unknown> = {}) {
  return { id: "019f0000-0000-7000-8000-0000000d0001", title: "Midden", slug: "2026/10/midden", status: "DRAFT", ...fields };
}

/** The form's fields as a reader fills them, with the time the form was shown. */
async function filled(v: Visitor, fields: Record<string, string> = {}) {
  const { doc } = await v.get("/submit");
  const loaded = doc.querySelector("input[name=formLoadedAt]")?.getAttribute("value") || "";
  return { formLoadedAt: loaded, title: " Midden ", markdownSource: "Midden reads **heap dumps**.", tags: "jvm, tools", categoryId: GUIDES, ...fields };
}

const sentPosts = async () => (await requests()).filter((r) => r.method === "POST" && r.path === "/posts");

describe("the submission form", () => {
  it("works without script: a plain form, with the time it was shown and a trap for bots", async () => {
    const { status, doc } = await new Visitor().get("/submit");
    const form = doc.querySelector("form[action='/submit']")!;

    expect(status).toBe(200);
    expect(form.getAttribute("method")).toBe("post");
    expect(form.querySelector("input[name=csrf]")?.getAttribute("value")).toMatch(/.{20,}/);
    expect(Number(form.querySelector("input[name=formLoadedAt]")?.getAttribute("value"))).toBeGreaterThan(Date.now() - 60_000);
    expect(form.querySelector("input[name=title]")).not.toBeNull();
    expect(form.querySelector("textarea[name=markdownSource]")).not.toBeNull();
    expect(form.querySelector("input[name=tags]")).not.toBeNull();
    expect(form.querySelector("[aria-hidden=true] input[name=website]")).not.toBeNull();
  });

  it("is framed as every page is, and titled, when shown and when shown again", async () => {
    const v = new Visitor();
    for (const { doc } of [await v.get("/submit"), await v.post("/submit", await filled(v, { title: "" }))]) {
      expect(doc.querySelector("header form[action='/search']")).not.toBeNull();
      expect(doc.querySelector("footer")).not.toBeNull();
      expect(text(doc.querySelector("title"))).toBe("Submit a post | ByteCode.News");
    }
  });

  it("sets the title in monospace, as the post's text is (and ui-pudl's is)", async () => {
    const { doc } = await new Visitor().get("/submit");
    expect(doc.querySelector("input[name=title]")?.classList.contains("form-mono")).toBe(true);
    expect(doc.querySelector("textarea[name=markdownSource]")?.classList.contains("form-mono")).toBe(true);
  });

  it("is never kept by a cache, since it carries the time it was shown", async () => {
    const response = await fetch(`${(await import("vitest")).inject("appUrl")}/submit`);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("submits on Enter: the first button in the form is Submit, not a helper", async () => {
    const { doc } = await new Visitor().get("/submit");
    const first = doc.querySelector("form[action='/submit'] button[type=submit]")!;
    expect(first.hasAttribute("name")).toBe(false);
  });

  it("offers the categories a post may be filed under, not the site's own", async () => {
    const { doc } = await new Visitor().get("/submit");
    const options = doc.querySelectorAll("select[name=categoryId] option").map((o) => text(o));
    expect(options).toEqual(["None", "Guides"]);
  });

  it("sends a reader who isn't signed in to sign in first, when the site takes no anonymous posts", async () => {
    await stubSite({ anonymousSubmission: false });
    const { status, location } = await new Visitor().get("/submit");

    expect(status).toBe(303);
    expect(location).toBe("/login?return=%2Fsubmit");
  });

  it("offers the helpers each reader may use", async () => {
    const helpers = async (v: Visitor) => (await v.get("/submit")).doc.querySelectorAll("button[name=action]").map((b) => b.getAttribute("value"));

    expect(await helpers(new Visitor())).toEqual(["suggest-tags"]);
    expect(await helpers(await signedIn())).toEqual(["suggest-tags", "derive-summary"]);
    expect(await helpers(await signedIn(ADMIN))).toEqual(["suggest-tags", "ai-tags", "derive-summary"]);
  });
});

describe("submitting a post", () => {
  it("sends it anonymously for a reader who isn't signed in, then thanks them", async () => {
    await stub("/posts", created(), { method: "POST", status: 201 });
    const v = new Visitor();
    const fields = await filled(v, { summary: "ignored" });
    const done = await v.post("/submit", fields);

    expect(done.status).toBe(303);
    expect(done.location).toBe("/submit/thanks");
    const [sent] = await sentPosts();
    expect(sent.headers.authorization).toBeUndefined();
    expect(sent.body).toEqual({
      title: "Midden",
      markdownSource: "Midden reads **heap dumps**.",
      formLoadedAt: Number(fields.formLoadedAt),
      tags: ["jvm", "tools"],
      categoryIds: [GUIDES],
    });
    expect(text((await v.get("/submit/thanks")).doc.querySelector("main"))).toContain("awaiting approval");
  });

  it("sends it as the signed-in reader, with their summary", async () => {
    await stub("/posts", created(), { method: "POST", status: 201 });
    const v = await signedIn();
    await v.post("/submit", await filled(v, { summary: " Heap dumps, read. " }));
    const [sent] = await sentPosts();

    expect(sent.headers.authorization).toBe("Bearer access-1");
    expect((sent.body as { summary: string }).summary).toBe("Heap dumps, read.");
  });

  it("wants a title and a post before sending anything, keeping what was written", async () => {
    const v = new Visitor();
    const { status, doc } = await v.post("/submit", await filled(v, { title: " ", markdownSource: "", tags: "kept" }));

    expect(status).toBe(400);
    expect(text(doc.querySelector("#submit-title-error"))).toBe("Give the post a title.");
    expect(text(doc.querySelector("#submit-body-error"))).toBe("Write the post.");
    expect(doc.querySelector("input[name=tags]")?.getAttribute("value")).toBe("kept");
    expect(await sentPosts()).toEqual([]);
  });

  it("says what the API says when it won't take the post, keeping what was written", async () => {
    await stub("/posts", { status: 400, detail: "Raw HTML isn't allowed." }, { method: "POST", status: 400 });
    const v = new Visitor();
    const { status, doc } = await v.post("/submit", await filled(v, { markdownSource: "<b>x</b>" }));

    expect(status).toBe(400);
    expect(text(doc.querySelector(".form-error[role=alert]"))).toBe("Raw HTML isn't allowed.");
    expect(doc.querySelector("textarea[name=markdownSource]")?.textContent).toBe("<b>x</b>");
  });

  it("says so when the API is down, keeping what was written", async () => {
    await stub("/posts", { detail: "down" }, { method: "POST", status: 503 });
    const v = new Visitor();
    const { status, doc } = await v.post("/submit", await filled(v));

    expect(status).toBe(503);
    expect(text(doc.querySelector(".form-error[role=alert]"))).toContain("couldn't be sent just now");
    expect(doc.querySelector("input[name=title]")?.getAttribute("value")).toBe(" Midden ");
  });

  it("thanks a bot that fills the trap, and sends nothing", async () => {
    const v = new Visitor();
    const done = await v.post("/submit", await filled(v, { website: "https://spam.example" }));

    expect(done.location).toBe("/submit/thanks");
    expect(await sentPosts()).toEqual([]);
  });

  it("refuses a form posted without the reader's anti-forgery token", async () => {
    const v = new Visitor();
    const { status } = await v.post("/submit", await filled(v), { csrf: false });

    expect(status).toBe(403);
    expect(await sentPosts()).toEqual([]);
  });
});

describe("the form's helpers", () => {
  it("add suggested tags to the reader's own, saying so beside the button, and submit nothing", async () => {
    await stub("/posts/derive-tags", { tags: ["Tools", "heap"] }, { method: "POST" });
    const v = new Visitor();
    const { status, doc } = await v.post("/submit", await filled(v, { action: "suggest-tags" }));

    expect(status).toBe(200);
    expect(doc.querySelector("input[name=tags]")?.getAttribute("value")).toBe("jvm, tools, heap");
    expect((await requests()).find((r) => r.path === "/posts/derive-tags")!.body).toEqual({
      title: " Midden ", markdownSource: "Midden reads **heap dumps**.", existingTags: ["jvm", "tools"],
    });
    expect(text(doc.querySelector("#helper-tags"))).toContain("Suggested tags added.");
    expect(await sentPosts()).toEqual([]);
  });

  it("derive a summary for a signed-in reader", async () => {
    await stub("/posts/derive-summary", { summary: "Midden reads heap dumps." }, { method: "POST" });
    const v = await signedIn();
    const { doc } = await v.post("/submit", await filled(v, { action: "derive-summary" }));

    expect(doc.querySelector("textarea[name=summary]")?.textContent).toBe("Midden reads heap dumps.");
    expect((await requests()).find((r) => r.path === "/posts/derive-summary")!.headers.authorization).toBe("Bearer access-1");
  });

  it("add AI tags for an admin", async () => {
    await stub(`/admin/posts/${UNSAVED}/derive-tags`, { tags: ["memory"] }, { method: "POST" });
    const v = await signedIn(ADMIN);
    const { doc } = await v.post("/submit", await filled(v, { action: "ai-tags" }));

    expect(doc.querySelector("input[name=tags]")?.getAttribute("value")).toBe("jvm, tools, memory");
    expect((await requests()).find((r) => r.path.endsWith("/derive-tags"))!.headers.authorization).toBe("Bearer access-1");
  });

  it("aren't run for a reader not allowed them: the form is just shown again", async () => {
    const anonymous = new Visitor();
    const summary = await anonymous.post("/submit", await filled(anonymous, { action: "derive-summary" }));
    const reader = await signedIn();
    const ai = await reader.post("/submit", await filled(reader, { action: "ai-tags" }));

    expect([summary.status, ai.status]).toEqual([200, 200]);
    expect(ai.doc.querySelector("input[name=tags]")?.getAttribute("value")).toBe("jvm, tools");
    expect((await requests()).filter((r) => r.path.startsWith("/posts/") || r.path.startsWith("/admin/"))).toEqual([]);
  });
});

describe("a signed-in reader whose token has expired", () => {
  async function expiring() {
    await stub("/posts", { detail: "expired" }, { method: "POST", status: 401, when: { authorization: "Bearer access-1" } });
    await stub("/posts", created(), { method: "POST", status: 201, when: { authorization: "Bearer access-2" } });
  }

  it("is renewed once, quietly, and the post goes through", async () => {
    await expiring();
    await stub("/auth/refresh", { token: "access-2" }, {
      method: "POST",
      headers: { "Set-Cookie": "refresh_token=refresh-2; Path=/auth; HttpOnly; SameSite=Lax" },
    });
    const v = await signedIn();
    const first = await v.post("/submit", await filled(v));
    const second = await v.post("/submit", await filled(v));

    expect(first.location).toBe("/submit/thanks");
    expect(second.location).toBe("/submit/thanks");
    const refreshes = (await requests()).filter((r) => r.path === "/auth/refresh");
    expect(refreshes.map((r) => r.headers.cookie)).toEqual(["refresh_token=refresh-1"]);
    expect((await sentPosts()).map((r) => r.headers.authorization)).toEqual(["Bearer access-1", "Bearer access-2", "Bearer access-2"]);
  });

  it("is renewed once when two submissions find it expired at once", async () => {
    await expiring();
    await stub("/auth/refresh", { token: "access-2" }, {
      method: "POST",
      delayMs: 200,
      headers: { "Set-Cookie": "refresh_token=refresh-2; Path=/auth; HttpOnly; SameSite=Lax" },
    });
    const v = await signedIn();
    const forms = [await filled(v), await filled(v)];
    const done = await Promise.all(forms.map((f) => v.post("/submit", f)));

    expect(done.map((d) => d.location)).toEqual(["/submit/thanks", "/submit/thanks"]);
    expect((await requests()).filter((r) => r.path === "/auth/refresh")).toHaveLength(1);
  });

  it("is signed out and sent to sign in again when the API won't renew it", async () => {
    await expiring();
    await stub("/auth/refresh", { detail: "Refresh token expired." }, { method: "POST", status: 401 });
    const v = await signedIn();
    const done = await v.post("/submit", await filled(v));

    expect(done.status).toBe(303);
    expect(done.location).toBe("/login?return=%2Fsubmit");
    expect(text((await v.get("/")).doc.querySelector("header"))).toContain("Log in");
  });
});
