import { beforeEach, describe, expect, inject, it } from "vitest";
import { text } from "../support/page.ts";
import { ADMIN, signedIn } from "../support/readers.ts";
import { requests, resetStubs, stub, stubSite } from "../support/stub.ts";
import { Visitor } from "../support/visitor.ts";

const SLUG = "2026/09/midden";
const PAGE = `/posts/${SLUG}`;
const MINE = "019f0000-0000-7000-8000-0000000e0001";
const THEIRS = "019f0000-0000-7000-8000-0000000e0002";
const NEW = "019f0000-0000-7000-8000-0000000e0003";

function comment(fields: Record<string, unknown> = {}) {
  return { id: THEIRS, authorDisplayName: "alice", renderedHtml: "<p>Nice.</p>", markdownSource: null, createdAt: "2026-10-01T12:00:00Z", deleted: false, editable: false, children: [], ...fields };
}

beforeEach(async () => {
  await resetStubs();
  await stubSite();
  await stub(`/posts/${SLUG}`, {
    id: "019f0000-0000-7000-8000-000000000001", title: "Midden", slug: SLUG, excerpt: "Midden reads heap dumps.",
    renderedHtml: "<p>Midden.</p>", authorDisplayName: "dreamreal", publishedAt: "2026-10-01T02:30:00Z", tags: [], categories: [],
  });
  await stub(`/posts/${SLUG}/comments`, { totalActiveCount: 1, comments: [comment()] });
});

const posted = async (path: string) => (await requests()).filter((r) => r.method !== "GET" && r.path === path);

describe("commenting on a post", () => {
  it("asks a reader who isn't signed in to log in, and back", async () => {
    const { doc } = await new Visitor().get(PAGE);
    const comments = doc.querySelector("section.comments")!;

    expect(comments.querySelector("form textarea")).toBeNull();
    expect(comments.querySelector("a[href^='/login']")?.getAttribute("href")).toBe(`/login?return=${encodeURIComponent(PAGE)}`);
  });

  it("offers a signed-in reader a form for a comment and one for a reply to each, that work without script", async () => {
    const v = await signedIn();
    const { doc } = await v.get(PAGE);
    const forms = doc.querySelectorAll(`section.comments form[action='${PAGE}/comments']`);

    expect(forms.length).toBe(2);
    for (const form of forms) {
      expect(form.getAttribute("method")).toBe("post");
      expect(form.querySelector("input[name=csrf]")?.getAttribute("value")).toMatch(/.{20,}/);
      expect(form.querySelector("textarea[name=markdownSource]")).not.toBeNull();
    }
    expect(doc.querySelector(`#comment-${THEIRS} form input[name=parentCommentId]`)?.getAttribute("value")).toBe(THEIRS);
  });

  it("reads the thread as the signed-in reader, so the API can say what's theirs, and keeps it private", async () => {
    const v = await signedIn();
    const response = await fetch(`${inject("appUrl")}${PAGE}`, { headers: { Cookie: `session_id=${v.cookies.get("session_id")}` } });

    expect(response.headers.get("cache-control")).toContain("private");
    const read = (await requests()).filter((r) => r.path === `/posts/${SLUG}/comments`);
    expect(read.at(-1)!.headers.authorization).toBe("Bearer access-1");
  });

  it("posts a comment as the reader and shows it in its place", async () => {
    await stub(`/posts/${SLUG}/comments`, { id: NEW, authorDisplayName: "Joe O" }, { method: "POST", status: 201 });
    const v = await signedIn();
    const done = await v.post(`${PAGE}/comments`, { markdownSource: "Agreed, **heartily**." });

    expect(done.status).toBe(303);
    expect(done.location).toBe(`${PAGE}#comment-${NEW}`);
    const [sent] = await posted(`/posts/${SLUG}/comments`);
    expect(sent.headers.authorization).toBe("Bearer access-1");
    expect(sent.body).toEqual({ markdownSource: "Agreed, **heartily**." });
  });

  it("posts a reply under the comment it answers", async () => {
    await stub(`/posts/${SLUG}/comments`, { id: NEW }, { method: "POST", status: 201 });
    const v = await signedIn();
    await v.post(`${PAGE}/comments`, { markdownSource: "Quite.", parentCommentId: THEIRS });

    expect((await posted(`/posts/${SLUG}/comments`))[0].body).toEqual({ markdownSource: "Quite.", parentCommentId: THEIRS });
  });

  it("wants something in a comment before sending it", async () => {
    const v = await signedIn();
    const { status, doc } = await v.post(`${PAGE}/comments`, { markdownSource: "  " });

    expect(status).toBe(400);
    expect(text(doc.querySelector("section.comments .form-error"))).toBe("There was nothing in the comment.");
    expect(await posted(`/posts/${SLUG}/comments`)).toEqual([]);
  });

  it("says what the API says when it won't take a reply, keeping the draft open where it was", async () => {
    await stub(`/posts/${SLUG}/comments`, { status: 403, detail: "Verify your email address before commenting." }, { method: "POST", status: 403 });
    const v = await signedIn();
    const { status, doc } = await v.post(`${PAGE}/comments`, { markdownSource: "My draft.", parentCommentId: THEIRS });
    const reply = doc.querySelector(`#comment-${THEIRS} details.comment-reply`)!;

    expect(status).toBe(400);
    expect(reply.hasAttribute("open")).toBe(true);
    expect(reply.querySelector("textarea")?.textContent).toBe("My draft.");
    expect(text(reply.querySelector(".form-error[role=alert]"))).toBe("Verify your email address before commenting.");
    // The page is the post's, framed, with its title.
    expect(text(doc.querySelector("title"))).toBe("Midden | ByteCode.News");
  });

  it("says so when the API is down, keeping the draft", async () => {
    await stub(`/posts/${SLUG}/comments`, { detail: "down" }, { method: "POST", status: 503 });
    const v = await signedIn();
    const { status, doc } = await v.post(`${PAGE}/comments`, { markdownSource: "My draft." });

    expect(status).toBe(503);
    expect(text(doc.querySelector("section.comments .form-error"))).toContain("couldn't be posted just now");
    expect(doc.querySelector("#new-comment")?.textContent).toBe("My draft.");
  });

  it("sends a reader who isn't signed in to log in first", async () => {
    const v = new Visitor();
    const done = await v.post(`${PAGE}/comments`, { markdownSource: "Hello." });

    expect(done.status).toBe(303);
    expect(done.location).toBe(`/login?return=${encodeURIComponent(PAGE)}`);
    expect(await posted(`/posts/${SLUG}/comments`)).toEqual([]);
  });

  it("refuses a form posted without the reader's anti-forgery token", async () => {
    const v = await signedIn();
    const { status } = await v.post(`${PAGE}/comments`, { markdownSource: "Hello." }, { csrf: false });

    expect(status).toBe(403);
    expect(await posted(`/posts/${SLUG}/comments`)).toEqual([]);
  });
});

describe("editing a comment", () => {
  beforeEach(async () => {
    await stub(`/posts/${SLUG}/comments`, {
      totalActiveCount: 2,
      comments: [comment(), comment({ id: MINE, authorDisplayName: "Joe O", markdownSource: "My **first** go.", editable: true })],
    });
  });

  it("is offered for the reader's own comments, with what they wrote", async () => {
    const v = await signedIn();
    const { doc } = await v.get(PAGE);

    expect(doc.querySelector(`#comment-${THEIRS} details.comment-edit`)).toBeNull();
    const form = doc.querySelector(`#comment-${MINE} details.comment-edit form`)!;
    expect(form.getAttribute("action")).toBe(`/comments/${MINE}`);
    expect(form.querySelector("input[name=post]")?.getAttribute("value")).toBe(SLUG);
    expect(form.querySelector("textarea")?.textContent).toBe("My **first** go.");
  });

  it("saves the edit as the reader and returns to the comment", async () => {
    await stub(`/comments/${MINE}`, { id: MINE }, { method: "PUT" });
    const v = await signedIn();
    const done = await v.post(`/comments/${MINE}`, { markdownSource: "My second go.", post: SLUG });

    expect(done.status).toBe(303);
    expect(done.location).toBe(`${PAGE}#comment-${MINE}`);
    const [sent] = await posted(`/comments/${MINE}`);
    expect(sent.method).toBe("PUT");
    expect(sent.headers.authorization).toBe("Bearer access-1");
    expect(sent.body).toEqual({ markdownSource: "My second go." });
  });

  it("says what the API says when it won't take the edit, keeping it open", async () => {
    await stub(`/comments/${MINE}`, { status: 403, detail: "The time to edit this comment has passed." }, { method: "PUT", status: 403 });
    const v = await signedIn();
    const { status, doc } = await v.post(`/comments/${MINE}`, { markdownSource: "Too late.", post: SLUG });
    const edit = doc.querySelector(`#comment-${MINE} details.comment-edit`)!;

    expect(status).toBe(400);
    expect(edit.hasAttribute("open")).toBe(true);
    expect(edit.querySelector("textarea")?.textContent).toBe("Too late.");
    expect(text(edit.querySelector(".form-error"))).toBe("The time to edit this comment has passed.");
  });

  it("goes nowhere for a post that isn't one", async () => {
    const v = await signedIn();
    const done = await v.post(`/comments/${MINE}`, { markdownSource: "x", post: "../../admin" });

    expect(done.status).toBe(404);
    expect(await posted(`/comments/${MINE}`)).toEqual([]);
  });
});

describe("removing a comment", () => {
  it("is offered to admins, asked first on a page that works without script", async () => {
    const v = await signedIn(ADMIN);
    const link = (await v.get(PAGE)).doc.querySelector(`#comment-${THEIRS} a.comment-remove`)!;
    expect(link.getAttribute("href")).toBe(`/comments/${THEIRS}/remove?post=${encodeURIComponent(SLUG)}`);

    const { status, doc } = await v.get(link.getAttribute("href")!);
    expect(status).toBe(200);
    const form = doc.querySelector(`form[action='/comments/${THEIRS}/remove']`)!;
    expect(form.querySelector("input[name=post]")?.getAttribute("value")).toBe(SLUG);
    expect(doc.querySelector("a[href*='hard=true']")).not.toBeNull();
  });

  it("removes it as the admin, its replies kept, and returns to the thread", async () => {
    await stub(`/admin/comments/${THEIRS}`, {}, { method: "DELETE" });
    const v = await signedIn(ADMIN);
    const done = await v.post(`/comments/${THEIRS}/remove`, { post: SLUG });

    expect(done.status).toBe(303);
    expect(done.location).toBe(`${PAGE}#comments`);
    const [sent] = await posted(`/admin/comments/${THEIRS}`);
    expect(sent.method).toBe("DELETE");
    expect(sent.headers.authorization).toBe("Bearer access-1");
    expect(sent.query.hard).toBeUndefined();
  });

  it("deletes it for good when asked to, asked again first", async () => {
    await stub(`/admin/comments/${THEIRS}`, {}, { method: "DELETE" });
    const v = await signedIn(ADMIN);
    const confirm = await v.get(`/comments/${THEIRS}/remove?post=${encodeURIComponent(SLUG)}&hard=true`);
    expect(text(confirm.doc.querySelector("main, section"))).toContain("cannot be undone");

    await v.post(`/comments/${THEIRS}/remove`, { post: SLUG, hard: "true" });
    expect((await posted(`/admin/comments/${THEIRS}`))[0].query.hard).toBe("true");
  });

  it("isn't there for anyone else", async () => {
    const v = await signedIn();
    expect((await v.get(PAGE)).doc.querySelector("a.comment-remove")).toBeNull();
    expect((await v.get(`/comments/${THEIRS}/remove?post=${encodeURIComponent(SLUG)}`)).status).toBe(404);
    expect((await v.post(`/comments/${THEIRS}/remove`, { post: SLUG })).status).toBe(404);
    expect(await posted(`/admin/comments/${THEIRS}`)).toEqual([]);
  });
});

/* A comment on a passage (#65, streampack#256): the passage goes to the API as the comment's anchor,
   and each comment's anchor comes back to the page for client/annotate.ts. */
describe("commenting on a passage", () => {
  const QUOTING = "019f0000-0000-7000-8000-0000000e0004";
  const ORPHAN = "019f0000-0000-7000-8000-0000000e0005";

  it("offers a signed-in reader the button and the form's empty quote, hidden until script shows them", async () => {
    const v = await signedIn();
    const { doc } = await v.get(PAGE);
    const form = doc.querySelector("section.comments form.comment-form")!;

    const ask = doc.querySelector("article .anchor-ask")!;
    expect(ask.hasAttribute("hidden")).toBe(true);
    expect(text(ask.querySelector("button[type=button][data-anchor-ask]"))).toBe("Comment on this passage");
    for (const name of ["anchorExact", "anchorPrefix", "anchorSuffix"]) {
      expect(form.querySelector(`input[type=hidden][name=${name}]`)?.getAttribute("value")).toBe("");
    }
    expect(form.querySelector("[data-comment-quote]")?.hasAttribute("hidden")).toBe(true);
    expect(doc.querySelectorAll(".comment-reply input[name^=anchor]")).toEqual([]);
  });

  it("offers no button to a reader who isn't signed in", async () => {
    const { doc } = await new Visitor().get(PAGE);

    expect(doc.querySelector(".anchor-ask")).toBeNull();
  });

  it("sends the passage as the comment's anchor", async () => {
    await stub(`/posts/${SLUG}/comments`, { id: NEW }, { method: "POST", status: 201 });
    const v = await signedIn();
    await v.post(`${PAGE}/comments`, { markdownSource: "Nice.", anchorExact: "Midden.", anchorPrefix: "", anchorSuffix: "" });

    expect((await posted(`/posts/${SLUG}/comments`))[0].body).toEqual({ markdownSource: "Nice.", anchor: { exact: "Midden.", prefix: null, suffix: null } });
  });

  it("sends the passage's context when it has some", async () => {
    await stub(`/posts/${SLUG}/comments`, { id: NEW }, { method: "POST", status: 201 });
    const v = await signedIn();
    await v.post(`${PAGE}/comments`, { markdownSource: "Nice.", anchorExact: "reads", anchorPrefix: "Midden ", anchorSuffix: " heap" });

    expect((await posted(`/posts/${SLUG}/comments`))[0].body.anchor).toEqual({ exact: "reads", prefix: "Midden ", suffix: " heap" });
  });

  it("leaves the anchor out when there's no passage, and from a reply", async () => {
    await stub(`/posts/${SLUG}/comments`, { id: NEW }, { method: "POST", status: 201 });
    const v = await signedIn();
    await v.post(`${PAGE}/comments`, { markdownSource: "Plain.", anchorExact: " ", anchorPrefix: "", anchorSuffix: "" });
    await v.post(`${PAGE}/comments`, { markdownSource: "Quite.", parentCommentId: THEIRS, anchorExact: "Midden." });

    const [plain, reply] = await posted(`/posts/${SLUG}/comments`);
    expect(plain.body).toEqual({ markdownSource: "Plain." });
    expect(reply.body).toEqual({ markdownSource: "Quite.", parentCommentId: THEIRS });
  });

  it("keeps the draft and its quote when the API refuses it", async () => {
    await stub(`/posts/${SLUG}/comments`, { status: 400, detail: "The quoted passage isn't in the post" }, { method: "POST", status: 400 });
    const v = await signedIn();
    const { status, doc } = await v.post(`${PAGE}/comments`, { markdownSource: "My draft.", anchorExact: "brown <fox>", anchorPrefix: "The quick ", anchorSuffix: "." });
    const form = doc.querySelector("section.comments form.comment-form")!;

    expect(status).toBe(400);
    expect(text(form.querySelector(".form-error"))).toBe("The quoted passage isn't in the post");
    expect(form.querySelector("textarea")?.textContent).toBe("My draft.");
    expect(form.querySelector("input[name=anchorExact]")?.getAttribute("value")).toBe("brown <fox>");
    expect(form.querySelector("input[name=anchorPrefix]")?.getAttribute("value")).toBe("The quick ");
    expect(form.querySelector("input[name=anchorSuffix]")?.getAttribute("value")).toBe(".");
    const quote = form.querySelector("[data-comment-quote]")!;
    expect(quote.hasAttribute("hidden")).toBe(false);
    expect(text(quote.querySelector("[data-comment-quote-text]"))).toBe("brown <fox>");
  });

  it("carries each comment's anchor, and marks one whose passage is gone", async () => {
    await stub(`/posts/${SLUG}/comments`, {
      totalActiveCount: 3,
      comments: [
        comment({ id: QUOTING, renderedHtml: "<blockquote class=\"comment-anchor\"><p>Midden.</p></blockquote><p>Agreed.</p>", anchor: { exact: "Midden.", prefix: null, suffix: null }, anchorFound: true }),
        comment({ id: ORPHAN, renderedHtml: "<blockquote class=\"comment-anchor\"><p>lazy dog</p></blockquote><p>Gone?</p>", anchor: { exact: "lazy dog", prefix: "the ", suffix: null }, anchorFound: false }),
        comment(),
      ],
    });
    const { doc } = await new Visitor().get(PAGE);

    const data = doc.querySelector(`#comment-${QUOTING} > .comment-anchor-data`)!;
    expect(data.hasAttribute("hidden")).toBe(true);
    expect(data.getAttribute("data-exact")).toBe("Midden.");
    expect(data.getAttribute("data-prefix")).toBe("");
    expect(data.getAttribute("data-found")).toBe("true");
    expect(doc.querySelector(`#comment-${QUOTING} .comment-anchor-gone`)).toBeNull();

    expect(doc.querySelector(`#comment-${ORPHAN} > .comment-anchor-data`)?.getAttribute("data-found")).toBe("false");
    expect(doc.querySelector(`#comment-${ORPHAN} > .comment-anchor-data`)?.getAttribute("data-prefix")).toBe("the ");
    expect(text(doc.querySelector(`#comment-${ORPHAN} .comment-anchor-gone`))).toBe("This passage is no longer in the post.");

    expect(doc.querySelector(`#comment-${THEIRS} .comment-anchor-data, #comment-${THEIRS} .comment-anchor-gone`)).toBeNull();
  });
});
