import { beforeEach, describe, expect, it } from "vitest";
import { text } from "../support/page.ts";
import { ADMIN, signedIn } from "../support/readers.ts";
import { post, requests, resetStubs, stub, stubSite } from "../support/stub.ts";

/* Times in the reader's zone (#35): the API's are UTC; the reader sees and types their own, from
   the bcn-tz cookie client/zone.ts sets, and UTC, said so, without it. */

const ID = "019f0000-0000-7000-8000-0000000a0035";
const EDIT = `/edit/${ID}`;
const AT = "2026-10-20T14:30:00Z";
const sent = async (method: string, path: string) => (await requests()).filter((r) => r.method === method && r.path === path);

async function admin(zone?: string) {
  const v = await signedIn(ADMIN);
  if (zone !== undefined) v.cookies.set("bcn-tz", encodeURIComponent(zone));
  return v;
}

beforeEach(async () => {
  await resetStubs();
  await stubSite();
  await stub("/admin/posts/scheduled", { posts: [post({ id: ID, title: "Tomorrow", publishedAt: AT })], page: 0, totalPages: 1, totalCount: 1 }, { query: { page: 0, size: 20 } });
});

const goesOut = async (zone?: string) => {
  const { doc } = await (await admin(zone)).get("/admin/scheduled");
  const time = doc.querySelector("article.admin-scheduled time")!;
  return { text: text(time), datetime: time.getAttribute("datetime"), local: time.hasAttribute("data-local") };
};

describe("times shown", () => {
  it("are in the reader's zone, named, with the instant itself in the markup", async () => {
    expect(await goesOut("America/New_York")).toEqual({ text: "October 20, 2026, 10:30 AM EDT", datetime: AT, local: true });
    expect((await goesOut("Asia/Kolkata")).text).toBe("October 20, 2026, 8:00 PM GMT+5:30");
  });

  it("are in UTC, said so, without the cookie, or with one that names no zone", async () => {
    expect((await goesOut()).text).toBe("October 20, 2026, 2:30 PM UTC");
    expect((await goesOut("Mars/Olympus_Mons")).text).toBe("October 20, 2026, 2:30 PM UTC");
    expect((await goesOut("<script>")).text).toBe("October 20, 2026, 2:30 PM UTC");
  });

  it("include the admin lists' stamps", async () => {
    await stub("/admin/tags/aliases", [{ alias: "k8s", tag: "kubernetes", createdBy: "ed", createdAt: "2026-10-07T10:00:00Z" }]);
    const { doc } = await (await admin("America/New_York")).get("/admin/tags/aliases");
    expect(text(doc.querySelector("li.tag-alias-row .byline"))).toBe("Added by ed, 2026-10-07 06:00 EDT");
  });
});

describe("the editor's publish date", () => {
  function detail(fields: Record<string, unknown> = {}) {
    return {
      id: ID, title: "Tomorrow", slug: "2026/10/tomorrow", markdownSource: "Soon.", excerpt: "Soon.", renderedHtml: "<p>Soon.</p>",
      authorDisplayName: "dreamreal", status: "APPROVED", publishedAt: AT, sortOrder: 0, tags: [], categories: [], versions: [], ...fields,
    };
  }

  beforeEach(async () => {
    await stub(`/posts/${ID}`, detail());
    await stub(`/admin/posts/${ID}`, detail(), { method: "PUT" });
  });

  const save = async (zone: string, publishedAt: string, publishedZone: string) => {
    const v = await admin(zone);
    const { doc } = await v.get(EDIT);
    const form = doc.querySelector("form#editor")!;
    const values: Record<string, string> = {};
    for (const input of form.querySelectorAll("input[name], textarea[name]")) {
      const name = input.getAttribute("name")!;
      if (name === "categoryIds" || name === "csrf") continue;
      values[name] = input.tagName === "TEXTAREA" ? input.textContent : input.getAttribute("value") || "";
    }
    await v.post(EDIT, { ...values, publishedAt, publishedZone });
    return (await sent("PUT", `/admin/posts/${ID}`)).at(-1)!.body as { publishedAt: string };
  };

  it("is shown on the reader's clock, its zone beside it and sent with it", async () => {
    const { doc } = await (await admin("America/New_York")).get(EDIT);
    const field = doc.querySelector("input[name=publishedAt]")!;

    expect(field.getAttribute("value")).toBe("2026-10-20T10:30");
    expect(field.getAttribute("data-instant")).toBe("2026-10-20T14:30:00.000Z");
    expect(doc.querySelector("input[name=publishedZone]")?.getAttribute("value")).toBe("America/New_York");
    expect(text(doc.querySelector("label[for=edit-published]"))).toBe("Published (America/New_York)");
  });

  it("is read on the clock of the zone sent with it, and reaches the API in UTC, by the season", async () => {
    expect((await save("America/New_York", "2026-01-15T09:00", "America/New_York")).publishedAt).toBe("2026-01-15T14:00:00.000Z");
    await resetStubs(); await stubSite(); await stub(`/posts/${ID}`, detail()); await stub(`/admin/posts/${ID}`, detail(), { method: "PUT" });
    expect((await save("America/New_York", "2026-07-15T09:00", "America/New_York")).publishedAt).toBe("2026-07-15T13:00:00.000Z");
  });

  it("follows the zone the field says over the cookie's, and the cookie's over a zone that isn't one", async () => {
    expect((await save("America/New_York", "2026-07-15T09:00", "Asia/Kolkata")).publishedAt).toBe("2026-07-15T03:30:00.000Z");
    await resetStubs(); await stubSite(); await stub(`/posts/${ID}`, detail()); await stub(`/admin/posts/${ID}`, detail(), { method: "PUT" });
    expect((await save("America/New_York", "2026-07-15T09:00", "Nowhere/Special")).publishedAt).toBe("2026-07-15T13:00:00.000Z");
  });

  it("is UTC, said so, for a reader whose zone isn't known", async () => {
    const { doc } = await (await admin()).get(EDIT);
    expect(doc.querySelector("input[name=publishedAt]")?.getAttribute("value")).toBe("2026-10-20T14:30");
    expect(text(doc.querySelector("label[for=edit-published]"))).toBe("Published (UTC)");
  });

  it("asked on approval, is on the reader's clock too", async () => {
    await stub(`/posts/${ID}`, detail({ status: "DRAFT", publishedAt: null }));
    await stub(`/admin/posts/${ID}/approve`, detail(), { method: "PUT" });
    const v = await admin("Asia/Kolkata");
    const { doc } = await v.get(`${EDIT}/approve`);
    expect(text(doc.querySelector("label[for=confirm-field]"))).toBe("Publish at (Asia/Kolkata)");
    expect(doc.querySelector("input[name=publishedZone]")?.getAttribute("value")).toBe("Asia/Kolkata");

    await v.post(`${EDIT}/approve`, { publishedAt: "2026-10-21T09:00", publishedZone: "Asia/Kolkata" });
    expect((await sent("PUT", `/admin/posts/${ID}/approve`))[0].body).toEqual({ publishedAt: "2026-10-21T03:30:00.000Z" });
  });
});
