import { parse } from "node-html-parser";
import { beforeEach, describe, expect, inject, it } from "vitest";
import { page, text } from "../support/page.ts";
import { ADMIN, signedIn } from "../support/readers.ts";
import { features, list, post, requests, resetStubs, stub, stubRaw, stubSite } from "../support/stub.ts";
import type { Visitor } from "../support/visitor.ts";

/* A post's recording (#33): its player, the lists' mark, the podcast feed, and the editor's upload
   and removal. */

const ID = "019f0000-0000-7000-8000-0000000a0033";
const SLUG = "2026/10/its-been-a-bit";
const EDIT = `/edit/${ID}`;
const MEDIA = `https://api.bytecode.news/media/posts/${ID}/audio`;
const UPLOAD = `/admin/posts/${ID}/versions/audio`;
const MAX = 100 * 1024 * 1024;

function recording(fields: Record<string, unknown> = {}) {
  return {
    kind: "audio", variant: null, mediaType: "audio/mpeg", size: 3_900_000, duration: 257, url: MEDIA,
    note: "read by the author", maker: "dreamreal", current: true, createdAt: "2026-10-12T15:00:00Z", replacedAt: null, ...fields,
  };
}

function detail(fields: Record<string, unknown> = {}) {
  return {
    id: ID, title: "It's been a bit", slug: SLUG, markdownSource: "A status update.", excerpt: "A status update.",
    renderedHtml: "<p>A status update.</p>", authorDisplayName: "dreamreal", status: "APPROVED",
    publishedAt: "2026-10-12T14:00:00Z", sortOrder: 0, tags: [], categories: [], versions: [], ...fields,
  };
}

/** Posts the editor's Recording form as a browser would: its token first, the file last. */
async function upload(v: Visitor, { file = "ID3 fake mp3 bytes" as string | Uint8Array, note = "", duration = "", csrf = true, name = "talk.mp3" } = {}) {
  const form = new FormData();
  if (csrf) form.append("csrf", await v.csrf());
  form.append("note", note);
  form.append("duration", duration);
  form.append("file", new File([file], name, { type: "audio/x-m4a" }));
  const cookie = [...v.cookies].map(([k, val]) => `${k}=${val}`).join("; ");
  const response = await fetch(`${inject("appUrl")}${EDIT}/audio`, { method: "POST", headers: { Cookie: cookie }, body: form, redirect: "manual" });
  return { status: response.status, location: response.headers.get("location"), html: await response.text() };
}

const sent = async (method: string, path: string) => (await requests()).filter((r) => r.method === method && r.path === path);

beforeEach(async () => {
  await resetStubs();
  await stubSite();
});

describe("a post's recording, for readers", () => {
  it("is played on the post from the API's own address, fetching nothing until played", async () => {
    await stub(`/posts/${SLUG}`, detail({ versions: [recording()] }));
    const { status, doc } = await page(`/posts/${SLUG}`);
    const player = doc.querySelector(".post-audio audio");

    expect(status).toBe(200);
    expect(player?.getAttribute("src")).toBe(MEDIA);
    expect(player?.getAttribute("preload")).toBe("none");
    expect(player?.hasAttribute("controls")).toBe(true);
    expect(text(doc.querySelector(".post-audio figcaption"))).toBe("Listen to this post (4 minutes 17 seconds), read by the author");
    expect(doc.querySelector(".post-audio time")?.getAttribute("datetime")).toBe("PT257S");
    const download = doc.querySelector(".post-audio-download a");
    expect(download?.getAttribute("href")).toBe(MEDIA);
    expect(download?.hasAttribute("download")).toBe(true);
    expect(text(doc.querySelector(".post-audio-download"))).toBe("Download the recording (MP3, 3.9 MB)");
  });

  it("isn't there for a post without one", async () => {
    await stub(`/posts/${SLUG}`, detail());
    const { status, doc } = await page(`/posts/${SLUG}`);
    expect(status).toBe(200);
    expect(doc.querySelector(".post-audio")).toBeNull();
    expect(doc.querySelector("audio")).toBeNull();
  });

  it("leaves the length out when the API doesn't know it", async () => {
    await stub(`/posts/${SLUG}`, detail({ versions: [recording({ duration: null, note: null })] }));
    const { doc } = await page(`/posts/${SLUG}`);
    expect(text(doc.querySelector(".post-audio figcaption"))).toBe("Listen to this post");
  });

  it("is marked in the lists, in words, and only for posts that have one", async () => {
    const heard = post({ title: "Heard", versionKinds: ["audio"] });
    const read = post({ title: "Read", versionKinds: [] });
    const brief = [1, 2, 3, 4].map((n) => post({ title: `Brief ${n}`, versionKinds: n === 2 ? ["audio"] : undefined }));
    await stub("/posts", list([heard, read, ...brief]));
    await stub("/posts/popular", list([post({ title: "Popular", versionKinds: ["audio"] })]));
    const { doc } = await page("/");
    const marked = doc.querySelectorAll(".audio-mark").map((m) => m.closest("article"));

    expect(doc.querySelectorAll(".audio-mark").every((m) => text(m) === "Audio" && m.getAttribute("title") === "This post has a recording")).toBe(true);
    expect(marked.map((a) => text(a?.querySelector("h2, h3, h4")))).toEqual(["Heard", "Brief 2", "Popular"]);
  });

  it("is marked in a list of rows, as search shows them", async () => {
    await stub("/posts/search", list([post({ title: "Heard", versionKinds: ["audio"] }), post({ title: "Read" })]), { query: { q: "status" } });
    const { doc } = await page("/search?q=status");
    const rows = doc.querySelectorAll(".post-row");
    expect(rows.map((r) => !!r.querySelector(".audio-mark"))).toEqual([true, false]);
  });
});

describe("the podcast feed", () => {
  const FEED = `<?xml version="1.0"?><rss version="2.0"><channel><title>ByteCode.News podcast</title><link>https://bytecode.news/</link>`
    + `<item><link>https://bytecode.news/posts/${SLUG}</link><enclosure url="${MEDIA}" length="3900000" type="audio/mpeg"/></item></channel></rss>`;

  it("is the API's, its links moved to where the reader is and the recordings' addresses left alone", async () => {
    await stubRaw("/podcast.xml", FEED, "application/rss+xml;charset=UTF-8");
    const response = await fetch(`${inject("appUrl")}/podcast.xml`, { headers: { "X-Forwarded-Host": "primate.bytecode.news", "X-Forwarded-Proto": "https" } });
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/rss+xml;charset=UTF-8");
    expect(body).toContain(`<link>https://primate.bytecode.news/posts/${SLUG}</link>`);
    expect(body).toContain(`<enclosure url="${MEDIA}"`);
  });

  it("says so when the API can't be had", async () => {
    await stub("/podcast.xml", { detail: "down" }, { status: 503 });
    const response = await fetch(`${inject("appUrl")}/podcast.xml`, { headers: { "X-Forwarded-Host": "nowhere.example" } });
    expect(response.status).toBe(503);
    expect(await response.text()).toBe("The podcast feed is unavailable just now.");
  });

  it("is named in every page's head, and linked in its header, in words", async () => {
    await stub("/posts", list([]));
    const { doc } = await page("/");
    const head = doc.querySelector("link[rel=alternate][href='/podcast.xml']");
    expect(head?.getAttribute("type")).toBe("application/rss+xml");
    expect(head?.getAttribute("title")).toBe("ByteCode.News podcast");
    expect(text(doc.querySelector("header a[href='/podcast.xml']"))).toBe("Podcast");
  });
});

describe("the editor's recording", () => {
  beforeEach(async () => {
    await stub("/categories", []);
    await stub("/features", features());
  });

  it("says there's none yet, and offers the upload, its token first and its file last", async () => {
    await stub(`/posts/${ID}`, detail());
    const { doc } = await (await signedIn(ADMIN)).get(EDIT);
    const section = doc.querySelector("#recording");
    const form = section?.querySelector("form");

    expect(text(section?.querySelector(".form-hint"))).toContain("No recording yet.");
    expect(form?.getAttribute("action")).toBe(`${EDIT}/audio`);
    expect(form?.getAttribute("enctype")).toBe("multipart/form-data");
    expect(form?.querySelectorAll("input[name]").map((i) => i.getAttribute("name"))).toEqual(["csrf", "note", "duration", "file"]);
    expect(form?.querySelector("input[type=file]")?.getAttribute("data-max-bytes")).toBe(String(100 * 1024 * 1024));
    expect(text(form?.querySelector("button[type=submit]"))).toBe("Upload recording");
    expect(section?.querySelector("a[href$='/audio/remove']")).toBeNull();
    // Not inside the post's own form, whose Save would otherwise send the file.
    expect(doc.querySelector("form#editor #recording")).toBeNull();
  });

  it("describes what's attached, saying in words when it was made from an earlier draft", async () => {
    await stub(`/posts/${ID}`, detail({ versions: [recording({ current: false, replacedAt: "2026-10-13T09:00:00Z" })] }));
    const { doc } = await (await signedIn(ADMIN)).get(EDIT);
    const terms = doc.querySelectorAll("#recording dt").map(text);
    const facts = Object.fromEntries(doc.querySelectorAll("#recording dd").map((dd, i) => [terms[i], text(dd)]));

    expect(facts).toEqual({
      File: "MP3 (audio/mpeg), 3.9 MB",
      Length: "4 minutes 17 seconds",
      Note: "read by the author",
      Uploaded: "By dreamreal, October 12, 2026; replaced October 13, 2026",
      "Made from": "An earlier draft. The post has been edited since it was recorded.",
    });
    expect(doc.querySelector("#recording audio")?.getAttribute("src")).toBe(MEDIA);
    expect(text(doc.querySelector("#recording button[type=submit]"))).toBe("Replace recording");
    expect(doc.querySelector(`#recording a[href='${EDIT}/audio/remove']`)?.hasAttribute("data-confirm")).toBe(true);
  });

  it("passes the upload on to the API as the admin: the file as its one part, typed by its bytes, the note and length in the query", async () => {
    await stub(`/posts/${ID}`, detail());
    await stub(UPLOAD, recording(), { method: "POST", status: 201 });
    const v = await signedIn(ADMIN);
    const done = await upload(v, { note: "read by the author", duration: "4:17" });

    expect(done.status).toBe(303);
    expect(done.location).toBe(`${EDIT}?audio=attached#recording`);
    const [asked] = await sent("POST", UPLOAD);
    expect(asked.headers.authorization).toBe("Bearer access-1");
    expect(asked.query).toEqual({ note: "read by the author", duration: "257" });
    expect(asked.headers["content-type"]).toMatch(/^multipart\/form-data; boundary=/);
    const body = String(asked.body);
    expect(body).toContain('Content-Disposition: form-data; name="file"; filename="recording"');
    expect(body).toContain("Content-Type: application/octet-stream");
    expect(body).toContain("ID3 fake mp3 bytes");
    // Only the file goes: not the form's token.
    expect(body).not.toContain("csrf");
    expect(body.match(/Content-Disposition/g)).toHaveLength(1);

    await stub(`/posts/${ID}`, detail({ versions: [recording()] }));
    const { doc } = await v.get(`${EDIT}?audio=attached`);
    expect(text(doc.querySelector("#recording [role=status]"))).toBe("Recording uploaded. The post now has a player, and is in the podcast feed.");
  });

  it("says a recording was replaced when the API says so", async () => {
    await stub(`/posts/${ID}`, detail({ versions: [recording()] }));
    await stub(UPLOAD, recording(), { method: "POST", status: 200 });
    const done = await upload(await signedIn(ADMIN));
    expect(done.location).toBe(`${EDIT}?audio=replaced#recording`);
  });

  it("says why the API refused it, beside the recording", async () => {
    await stub(`/posts/${ID}`, detail());
    await stub(UPLOAD, { status: 415, detail: "That isn't MP3, M4A, Ogg Vorbis or Ogg Opus." }, { method: "POST", status: 415, headers: { "Content-Type": "application/problem+json" } });
    const done = await upload(await signedIn(ADMIN), { file: "not audio at all" });

    expect(done.status).toBe(400);
    expect(text(parse(done.html).querySelector("#recording [role=alert]"))).toBe("That isn't MP3, M4A, Ogg Vorbis or Ogg Opus.");
  });

  it("refuses a recording said to be over 100 MB before sending any of it on, and still answers", async () => {
    await stub(`/posts/${ID}`, detail());
    const done = await upload(await signedIn(ADMIN), { file: new Uint8Array(MAX + 128 * 1024) });
    expect(done.status).toBe(413);
    expect(text(parse(done.html).querySelector("#recording [role=alert]"))).toBe("The recording is over 100 MB.");
    expect(await sent("POST", UPLOAD)).toHaveLength(0);
  });

  it("cuts off a file found to be over 100 MB as it arrives, and still answers", async () => {
    await stub(`/posts/${ID}`, detail());
    await stub(UPLOAD, recording(), { method: "POST", status: 201 });
    // Within what the whole upload may be said to be, but the file itself is over.
    const done = await upload(await signedIn(ADMIN), { file: new Uint8Array(MAX + 1024) });
    expect(done.status).toBe(413);
    expect(text(parse(done.html).querySelector("#recording [role=alert]"))).toBe("The recording is over 100 MB.");
    const [asked] = await sent("POST", UPLOAD);
    expect(asked.body).toBe("(aborted)");
  });

  it("refuses a length it can't read, sending nothing on", async () => {
    await stub(`/posts/${ID}`, detail());
    const done = await upload(await signedIn(ADMIN), { duration: "four minutes" });
    expect(done.status).toBe(400);
    expect(done.html).toContain("Give the length in seconds, or as minutes:seconds, or leave it empty.");
    expect(await sent("POST", UPLOAD)).toHaveLength(0);
  });

  it("refuses a form with no file chosen", async () => {
    await stub(`/posts/${ID}`, detail());
    const v = await signedIn(ADMIN);
    const form = new FormData();
    form.append("csrf", await v.csrf());
    form.append("file", new File([], ""));
    const cookie = [...v.cookies].map(([k, val]) => `${k}=${val}`).join("; ");
    const response = await fetch(`${inject("appUrl")}${EDIT}/audio`, { method: "POST", headers: { Cookie: cookie }, body: form, redirect: "manual" });
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("Choose a recording to upload.");
    expect(await sent("POST", UPLOAD)).toHaveLength(0);
  });

  it("refuses an upload without the form's token, sending nothing on", async () => {
    await stub(`/posts/${ID}`, detail());
    expect((await upload(await signedIn(ADMIN), { csrf: false })).status).toBe(403);
    expect(await sent("POST", UPLOAD)).toHaveLength(0);
  });

  it("isn't there for anyone but an admin", async () => {
    await stub(`/posts/${ID}`, detail({ versions: [recording()] }));
    expect((await upload(await signedIn())).status).toBe(404);
    expect((await (await signedIn()).get(`${EDIT}/audio/remove`)).status).toBe(404);
    expect((await (await signedIn()).post(`${EDIT}/audio/remove`)).status).toBe(404);
    expect(await sent("POST", UPLOAD)).toHaveLength(0);
    expect(await sent("DELETE", UPLOAD)).toHaveLength(0);
  });

  it("removes it, asked first", async () => {
    await stub(`/posts/${ID}`, detail({ versions: [recording()] }));
    await stub(UPLOAD, undefined, { method: "DELETE", status: 204 });
    const v = await signedIn(ADMIN);
    const asked = await v.get(`${EDIT}/audio/remove`);
    expect(asked.status).toBe(200);
    expect(text(asked.doc.querySelector("h1"))).toBe("Remove this post's recording? This cannot be undone.");
    expect(asked.doc.querySelector(`form[action='${EDIT}/audio/remove']`)).not.toBeNull();

    const done = await v.post(`${EDIT}/audio/remove`);
    expect(done.status).toBe(303);
    expect(done.location).toBe(`${EDIT}?audio=removed#recording`);
    const [removed] = await sent("DELETE", UPLOAD);
    expect(removed.headers.authorization).toBe("Bearer access-1");
  });

  it("isn't asked about when there's nothing to remove", async () => {
    await stub(`/posts/${ID}`, detail());
    expect((await (await signedIn(ADMIN)).get(`${EDIT}/audio/remove`)).status).toBe(404);
  });
});
