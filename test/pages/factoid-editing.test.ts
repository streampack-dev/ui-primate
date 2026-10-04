import { beforeEach, describe, expect, inject, it } from "vitest";
import { text } from "../support/page.ts";
import { ADMIN, signedIn } from "../support/readers.ts";
import { requests, resetStubs, stub, stubSite } from "../support/stub.ts";
import { Visitor } from "../support/visitor.ts";

/* Changing the knowledge base (#170): teaching, editing, forgetting and locking factoids. */
const BOOT = "/factoids/spring%20boot";

function detail(fields: Record<string, unknown> = {}) {
  return {
    selector: "spring boot", locked: false, updatedBy: "ada", updatedAt: "2026-10-01T02:30:00Z", lastAccessedAt: null, accessCount: 42,
    attributes: [
      { type: "text", value: "an opinionated layer on Spring.", rendered: "spring boot is an opinionated layer on Spring." },
      { type: "urls", value: "https://spring.io", rendered: "URL: https://spring.io" },
      { type: "tags", value: "java,framework, web", rendered: "Tags: java, framework and web" },
    ],
    ...fields,
  };
}

/** The changes the app sent the API's knowledge base. */
const writes = async () => (await requests()).filter((r) => r.method !== "GET" && r.path.startsWith("/factoids")).map((r) => ({ method: r.method, path: r.path, query: r.query, body: r.body, auth: r.headers.authorization }));

/** A form's fields as the page gives them, with [values] filled in. */
function fieldsOf(form: import("node-html-parser").HTMLElement, values: Record<string, string> = {}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const input of form.querySelectorAll("input[name]")) out[input.getAttribute("name")!] = input.getAttribute("value") ?? "";
  for (const area of form.querySelectorAll("textarea[name]")) out[area.getAttribute("name")!] = area.textContent;
  return { ...out, ...values };
}

beforeEach(async () => {
  await resetStubs();
  await stubSite();
  await stub(BOOT, detail());
  await stub("/factoids", { factoids: [], page: 0, totalPages: 0, totalCount: 0 }, { query: { page: 0, size: 20 } });
  await stub(BOOT, detail(), { method: "PUT" });
  await stub(BOOT, {}, { method: "DELETE", status: 204 });
  await stub(`${BOOT}/lock`, {}, { method: "PUT", status: 204 });
  await stub("/factoids/nothing", { detail: "No such factoid" }, { status: 404 });
  await stub("/factoids/nothing", detail({ selector: "nothing" }), { method: "PUT", status: 201 });
});

describe("a factoid's page", () => {
  it("offers signing in, signed out, rather than its forms", async () => {
    const { doc } = await new Visitor().get(BOOT);

    expect(doc.querySelector("details.factoid-edit")).toBeNull();
    expect(doc.querySelector(".factoid-sign-in a")!.getAttribute("href")).toBe(`/login?return=${encodeURIComponent(BOOT)}`);
  });

  it("holds its values in the editor, signed in, and only an admin may lock it", async () => {
    const v = await signedIn();
    const { doc } = await v.get(BOOT);
    const form = doc.querySelector("details.factoid-edit form")!;

    expect(form.getAttribute("action")).toBe(BOOT);
    expect(text(form.querySelector("textarea[name=text]"))).toBe("an opinionated layer on Spring.");
    expect(form.querySelector("input[name=urls]")!.getAttribute("value")).toBe("https://spring.io");
    expect(form.querySelector("input[name=languages]")!.getAttribute("value")).toBe("");
    expect(form.querySelector("input[name='was.tags']")!.getAttribute("value")).toBe("java,framework, web");
    expect(form.querySelector("input[name=csrf]")).not.toBeNull();
    expect(doc.querySelector("a.factoid-forget")!.getAttribute("href")).toBe(`${BOOT}?forget`);
    expect(doc.querySelector("form.factoid-lock")).toBeNull();
  });

  it("is never kept by a shared cache when it carries a reader's forms", async () => {
    const v = await signedIn();
    const response = await fetch(`${inject("appUrl")}${BOOT}`, { headers: { Cookie: [...v.cookies].map(([k, val]) => `${k}=${val}`).join("; ") } });

    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});

describe("saving a factoid", () => {
  it("sends only what changed, as the reader, and an emptied field forgets that attribute", async () => {
    const v = await signedIn();
    const form = (await v.get(BOOT)).doc.querySelector("details.factoid-edit form")!;

    const { status, location } = await v.post(BOOT, fieldsOf(form, { text: "Spring, opinionated.", tags: "", urls: " https://spring.io " }));

    expect(status).toBe(303);
    expect(location).toBe(BOOT);
    expect(await writes()).toEqual([
      { method: "PUT", path: BOOT, query: {}, body: { value: "Spring, opinionated.", attribute: "text" }, auth: "Bearer access-1" },
      { method: "DELETE", path: BOOT, query: { attribute: "tags" }, body: undefined, auth: "Bearer access-1" },
    ]);
  });

  it("shows the API's refusal beside the draft, the editor open", async () => {
    await stub(BOOT, { status: 403, detail: "Factoid changes aren't enabled for the web." }, { method: "PUT", status: 403 });
    const v = await signedIn();
    const form = (await v.get(BOOT)).doc.querySelector("details.factoid-edit form")!;

    const { status, doc } = await v.post(BOOT, fieldsOf(form, { text: "my draft" }));

    expect(status).toBe(400);
    expect(text(doc.querySelector(".factoid-error"))).toBe("Factoid changes aren't enabled for the web.");
    expect(doc.querySelector("details.factoid-edit")!.hasAttribute("open")).toBe(true);
    expect(text(doc.querySelector("textarea[name=text]"))).toBe("my draft");
  });

  it("sends a reader who isn't signed in to sign in", async () => {
    const v = new Visitor();
    const { status, location } = await v.post(BOOT, { text: "x" });

    expect(status).toBe(303);
    expect(location).toBe(`/login?return=${encodeURIComponent(BOOT)}`);
    expect(await writes()).toEqual([]);
  });
});

describe("teaching a factoid", () => {
  it("from its missing page, which offers it", async () => {
    const v = await signedIn();
    const { status, doc } = await v.get("/factoids/nothing");
    const form = doc.querySelector("form.factoid-teach")!;
    expect(status).toBe(404);
    expect(form.getAttribute("action")).toBe("/factoids/nothing");

    const done = await v.post("/factoids/nothing", fieldsOf(form, { text: "now something" }));

    expect(done.location).toBe("/factoids/nothing");
    expect(await writes()).toEqual([{ method: "PUT", path: "/factoids/nothing", query: {}, body: { value: "now something", attribute: "text" }, auth: "Bearer access-1" }]);
  });

  it("from the knowledge base, then opening it", async () => {
    const v = await signedIn();
    const form = (await v.get("/factoids")).doc.querySelector("details.factoid-teach form")!;

    const { status, location } = await v.post("/factoids", fieldsOf(form, { selector: "nothing", text: "now something" }));

    expect(status).toBe(303);
    expect(location).toBe("/factoids/nothing");
  });

  it("without text, refused before the API is asked", async () => {
    const v = await signedIn();
    const form = (await v.get("/factoids")).doc.querySelector("details.factoid-teach form")!;

    const { status, doc } = await v.post("/factoids", fieldsOf(form, { selector: "nothing", text: " " }));

    expect(status).toBe(400);
    expect(text(doc.querySelector("details.factoid-teach [role=alert]"))).toBe("A new factoid needs its text.");
    expect(doc.querySelector("details.factoid-teach")!.hasAttribute("open")).toBe(true);
    expect(doc.querySelector("input[name=selector]")!.getAttribute("value")).toBe("nothing");
    expect(await writes()).toEqual([]);
  });
});

describe("forgetting a factoid", () => {
  it("is asked first, on a page of its own, then goes to the knowledge base", async () => {
    const v = await signedIn();
    const { doc } = await v.get(`${BOOT}?forget`);

    expect(text(doc.querySelector(".confirm-title"))).toBe("Forget “spring boot”?");
    const form = doc.querySelector(".confirm-page form")!;
    const { location } = await v.post(form.getAttribute("action")!, fieldsOf(form));

    expect(location).toBe("/factoids");
    expect(await writes()).toEqual([{ method: "DELETE", path: BOOT, query: {}, body: undefined, auth: "Bearer access-1" }]);
  });
});

describe("locking a factoid", () => {
  it("is an admin's: Lock, and a locked factoid offers no editor, only Unlock", async () => {
    const admin = await signedIn(ADMIN);
    const lock = (await admin.get(BOOT)).doc.querySelector("form.factoid-lock")!;
    expect(text(lock.querySelector("button"))).toBe("Lock");

    await admin.post(BOOT, fieldsOf(lock));
    expect((await writes()).at(-1)).toMatchObject({ method: "PUT", path: `${BOOT}/lock` });

    await stub(BOOT, detail({ locked: true }));
    const { doc } = await admin.get(BOOT);
    expect(doc.querySelector("details.factoid-edit")).toBeNull();
    expect(doc.querySelector(".factoid-locked-note")).not.toBeNull();
    expect(text(doc.querySelector("form.factoid-lock button"))).toBe("Unlock");
    expect(doc.querySelector("form.factoid-lock input[name=do]")!.getAttribute("value")).toBe("unlock");
  });

  it("isn't anyone else's", async () => {
    const v = await signedIn();
    const { status } = await v.post(BOOT, { do: "lock" });

    expect(status).toBe(404);
    expect(await writes()).toEqual([]);
  });
});
