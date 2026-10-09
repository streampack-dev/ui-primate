import { beforeEach, describe, expect, inject, it } from "vitest";
import { page, text } from "../support/page.ts";
import { ADMIN, signedIn } from "../support/readers.ts";
import { requests, resetStubs, stub, stubSite } from "../support/stub.ts";
import { Visitor } from "../support/visitor.ts";

/* Admins rate RSS items Rates / Might / Dull on the reader (#27, streampack#187/#188): buttons on
   each item for admins only, plain forms posted as the admin, a rating filter, and readers' reader
   exactly as it was. The model's guess is never shown. */
const ITEM = "019f0000-0000-7000-8000-0000000f0001";
const ITEM2 = "019f0000-0000-7000-8000-0000000f0002";
const RATE = `/admin/rss/items/${ITEM}/rating`;

function item(fields: Record<string, unknown> = {}) {
  return {
    id: ITEM, feedTitle: "Inside Java", feedUrl: "https://inside.java/feed.xml", siteUrl: "https://inside.java", guid: "g1",
    link: "https://inside.java/2026/09/30/jdk-26/", title: "JDK 26 is here", summary: "What's new.",
    publishedAt: "2026-10-01T02:00:00Z", receivedAt: "2026-10-01T02:05:00Z", categories: [], tags: [], ...fields,
  };
}
const items = (list: unknown[], pageNo = 0, totalPages = 1, totalCount = list.length) => ({ items: list, page: pageNo, totalPages, totalCount });
const rated = (rating: string | null, by: string | null = rating ? "ed" : null) => ({ rating, ratedBy: by, ratedAt: rating ? "2026-10-09T10:00:00Z" : null });

const adminCalls = async () => (await requests()).filter((r) => r.path.startsWith("/admin/rss"));
const buttons = (doc: Awaited<ReturnType<typeof page>>["doc"], id = ITEM) =>
  doc.querySelectorAll(`#item-${id} .rss-rating button`).map((b) => ({
    name: text(b).replace(/^[✓○]\s*/, ""),
    pressed: b.getAttribute("aria-pressed"),
    glyph: text(b.querySelector(".rss-rate-glyph")),
    value: b.getAttribute("value"),
  }));

beforeEach(async () => {
  await resetStubs();
  await stubSite();
  await stub("/rss/feeds", { feeds: [{ title: "Inside Java", feedUrl: "https://inside.java/feed.xml", siteUrl: "https://inside.java", itemCount: 12, latestItemTimestamp: null }] });
  await stub("/rss/items", items([item(), item({ id: ITEM2, title: "Loom, again" })]), { query: { page: 0, size: 20 } });
  // The admin list, carrying a guess field it never should: if it did, it mustn't be shown.
  await stub("/admin/rss/items", items([
    item({ ...rated("MIGHT"), ratingGuess: "DULL", guessReason: "SECRET GUESS REASON" }),
    item({ id: ITEM2, title: "Loom, again", ...rated(null) }),
  ]), { query: { rating: "all", page: 0, size: 20 } });
  await stub(RATE, { itemId: ITEM, rating: "RATES", ratedBy: "ed", ratedAt: "2026-10-09T11:00:00Z" }, { method: "PUT" });
  await stub(RATE, undefined, { method: "DELETE", status: 204 });
});

describe("readers' RSS reader, with ratings about", () => {
  it("is as it was: no buttons, no rating filter, no anchors, and only the public items asked for", async () => {
    const reader = await signedIn();
    for (const v of [new Visitor(), reader]) {
      const { status, doc } = await v.get("/rss");
      expect(status).toBe(200);
      expect(doc.querySelectorAll("article.rss-item").length).toBe(2);
      expect(doc.querySelector(".rss-rating")).toBeNull();
      expect(doc.querySelector("form.rss-rate")).toBeNull();
      expect(doc.querySelector("select[name=rating]")).toBeNull();
      expect(doc.querySelector("article.rss-item[id]")).toBeNull();
      expect(doc.querySelector("form.rss-filter")!.getAttribute("class")).toBe("rss-filter grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-end mb-8");
    }
    expect(await adminCalls()).toEqual([]);
  });

  it("ignores ?rating: the same page as without it, and the same items asked for", async () => {
    const plain = await page("/rss");
    const asked = await page("/rss?rating=dull");

    expect(asked.status).toBe(200);
    // The page is the same but for the hydration data, which names the address asked.
    for (const d of [plain.doc, asked.doc]) d.querySelector("script#hydration")!.remove();
    expect(asked.doc.outerHTML).toBe(plain.doc.outerHTML);
    expect(asked.doc.querySelector("a.rss-clear")).toBeNull();
    const calls = (await requests()).filter((r) => r.path === "/rss/items");
    expect(calls.at(-1)!.query).toEqual({ page: "0", size: "20" });
    expect(await adminCalls()).toEqual([]);
  });

  it("can't rate: every rating post is a 404 for anyone but an admin, and the API isn't asked", async () => {
    const reader = await signedIn();
    for (const v of [new Visitor(), reader]) {
      for (const rating of ["RATES", "MIGHT", "DULL", "NONE"]) {
        expect((await v.post(RATE, { rating, back: "/rss" })).status, rating).toBe(404);
      }
      expect((await v.post(RATE, { rating: "RATES" }, { csrf: false })).status).toBe(404);
    }
    expect(await adminCalls()).toEqual([]);
  });
});

describe("an admin's RSS reader", () => {
  it("lists the items from the admin list, which says how each is rated, and isn't kept by a cache", async () => {
    const v = await signedIn(ADMIN);
    const response = await fetch(`${inject("appUrl")}/rss`, { headers: { Cookie: [...v.cookies].map(([k, x]) => `${k}=${x}`).join("; ") } });
    expect(response.headers.get("cache-control")).toBe("private, no-store");

    const { doc } = await v.get("/rss");
    expect(doc.querySelectorAll("article.rss-item").length).toBe(2);
    const asked = (await requests()).filter((r) => r.path === "/admin/rss/items");
    expect(asked.at(-1)!.query).toEqual({ rating: "all", page: "0", size: "20" });
    expect(asked.at(-1)!.headers.authorization).toBe("Bearer access-1");
  });

  it("gives each item Rates, Might and Dull, the current one pressed, marked by a glyph and said in words", async () => {
    const v = await signedIn(ADMIN);
    const { doc } = await v.get("/rss");

    expect(buttons(doc)).toEqual([
      { name: "Rates", pressed: "false", glyph: "○", value: "RATES" },
      // Pressing the current one clears it.
      { name: "Might", pressed: "true", glyph: "✓", value: "NONE" },
      { name: "Dull", pressed: "false", glyph: "○", value: "DULL" },
    ]);
    expect(text(doc.querySelector(`#item-${ITEM} .rss-rating-now`))).toBe("Rated Might by ed");
    expect(buttons(doc, ITEM2).map((b) => b.pressed)).toEqual(["false", "false", "false"]);
    expect(text(doc.querySelector(`#item-${ITEM2} .rss-rating-now`))).toBe("Unrated");
  });

  it("names the buttons and their group for a screen reader", async () => {
    const v = await signedIn(ADMIN);
    const { doc } = await v.get("/rss");
    const group = doc.querySelector(`#item-${ITEM} .rss-rating`)!;

    expect(group.getAttribute("role")).toBe("group");
    expect(group.getAttribute("aria-label")).toBe("Rate “JDK 26 is here”");
    for (const b of group.querySelectorAll("button")) {
      expect(b.querySelector(".rss-rate-glyph")!.getAttribute("aria-hidden")).toBe("true");
      expect(b.getAttribute("type")).toBe("submit");
      expect(b.getAttribute("name")).toBe("rating");
    }
    expect(group.querySelector(".rss-rating-now")!.getAttribute("aria-live")).toBe("polite");
  });

  it("makes each a small form that works without script, carrying the token and the way back", async () => {
    const v = await signedIn(ADMIN);
    await stub("/admin/rss/items", items([item(rated("MIGHT"))]), { query: { rating: "might", page: 0, size: 20, title: "jdk" } });
    const { doc } = await v.get("/rss?title=jdk&rating=might");
    const forms = doc.querySelectorAll(`#item-${ITEM} form.rss-rate`);

    expect(forms.length).toBe(3);
    for (const form of forms) {
      expect(form.getAttribute("method")).toBe("post");
      expect(form.getAttribute("action")).toBe(RATE);
      expect(form.querySelector("input[name=csrf]")!.getAttribute("value")).toBe(await v.csrf());
      expect(form.querySelector("input[name=back]")!.getAttribute("value")).toBe("/rss?title=jdk&rating=might");
    }
  });

  it("never shows the model's guess", async () => {
    const v = await signedIn(ADMIN);
    const { html } = await v.get("/rss");

    expect(html).not.toContain("SECRET GUESS REASON");
    expect(html).not.toContain("ratingGuess");
    expect(html).not.toContain("guessReason");
  });

  it("filters by rating with the reader's GET form, kept by the pager, Refresh and the buttons' way back", async () => {
    await stub("/admin/rss/items", items([item({ id: ITEM2, title: "Loom, again", ...rated(null) })], 1, 3, 41), { query: { rating: "unrated", page: 1, size: 20 } });
    const v = await signedIn(ADMIN);
    const { status, doc } = await v.get("/rss?page=1&rating=unrated");
    const select = doc.querySelector("form.rss-filter select[name=rating]")!;

    expect(status).toBe(200);
    expect(doc.querySelector("form.rss-filter")!.getAttribute("method")).toBe("get");
    expect(select.querySelectorAll("option").map((o) => [o.getAttribute("value"), text(o)])).toEqual([
      ["", "All"], ["unrated", "Unrated"], ["rates", "Rates"], ["might", "Might"], ["dull", "Dull"],
    ]);
    expect(select.querySelector("option[selected]")!.getAttribute("value")).toBe("unrated");
    expect((await requests()).filter((r) => r.path === "/admin/rss/items").at(-1)!.query).toEqual({ rating: "unrated", page: "1", size: "20" });
    expect(text(doc.querySelector(".rss-count"))).toBe("41 items");
    expect(doc.querySelector("a.pagelink[rel=prev]")!.getAttribute("href")).toBe("/rss?rating=unrated");
    expect(doc.querySelector("a.pagelink[rel=next]")!.getAttribute("href")).toBe("/rss?page=2&rating=unrated");
    expect(doc.querySelector("a.rss-refresh")!.getAttribute("href")).toBe("/rss?page=1&rating=unrated&refresh");
    expect(doc.querySelector("a.rss-clear")!.getAttribute("href")).toBe("/rss");
    expect(doc.querySelector("input[name=back]")!.getAttribute("value")).toBe("/rss?page=1&rating=unrated");

    const refreshed = await v.get("/rss?page=1&rating=unrated&refresh");
    expect(refreshed.status).toBe(303);
    expect(refreshed.location).toBe("/rss?page=1&rating=unrated");
  });

  it("takes each filter, and anything else as all", async () => {
    const v = await signedIn(ADMIN);
    for (const rating of ["rates", "might", "dull", "unrated"]) {
      await stub("/admin/rss/items", items([]), { query: { rating, page: 0, size: 20 } });
      const { doc } = await v.get(`/rss?rating=${rating.toUpperCase()}`);
      expect(doc.querySelector("select[name=rating] option[selected]")!.getAttribute("value")).toBe(rating);
      expect((await requests()).filter((r) => r.path === "/admin/rss/items").at(-1)!.query.rating).toBe(rating);
    }
    const { doc } = await v.get("/rss?rating=excellent");
    expect(doc.querySelector("select[name=rating] option[selected]")!.getAttribute("value")).toBe("");
    expect((await requests()).filter((r) => r.path === "/admin/rss/items").at(-1)!.query.rating).toBe("all");
  });

  it("shows the public items, unrated and saying so, when the ratings can't be read", async () => {
    await stub("/admin/rss/items", { detail: "down" }, { query: { rating: "dull", page: 0, size: 20 }, status: 503 });
    const v = await signedIn(ADMIN);
    const { status, doc } = await v.get("/rss?rating=dull");

    expect(status).toBe(200);
    expect(doc.querySelectorAll("article.rss-item").length).toBe(2);
    expect(doc.querySelector(".rss-rating")).toBeNull();
    expect(text(doc.querySelector(".rss-rating-note"))).toBe("The ratings couldn't be read just now, so these items are shown unrated and not filtered by rating.");
  });

  it("keeps the feed list as it was (#28)", async () => {
    const v = await signedIn(ADMIN);
    const { status, doc } = await v.get("/rss?view=feeds");

    expect(status).toBe(200);
    expect(doc.querySelectorAll("li.rss-feed-row").map((r) => text(r))).toEqual(["Inside Java - https://inside.java/feed.xml"]);
    expect(doc.querySelector(".rss-rating")).toBeNull();
    expect(doc.querySelector("select[name=rating]")).toBeNull();
    expect(await adminCalls()).toEqual([]);
  });
});

describe("rating an item", () => {
  it("sets a rating: the API's PUT as the admin, then back to the reader as it was, at the item", async () => {
    const v = await signedIn(ADMIN);
    const answer = await v.post(RATE, { rating: "DULL", back: "/rss?page=2&title=jdk&rating=unrated" });

    expect(answer.status).toBe(303);
    expect(answer.location).toBe(`/rss?page=2&title=jdk&rating=unrated#item-${ITEM}`);
    const sent = (await adminCalls()).filter((r) => r.path === RATE);
    expect(sent.map((r) => [r.method, r.body])).toEqual([["PUT", { rating: "DULL" }]]);
    expect(sent[0].headers.authorization).toBe("Bearer access-1");
    expect(sent[0].headers["content-type"]).toBe("application/json");
  });

  it("sends each rating as the API names it", async () => {
    const v = await signedIn(ADMIN);
    for (const rating of ["RATES", "MIGHT", "DULL"]) expect((await v.post(RATE, { rating, back: "/rss" })).status).toBe(303);
    expect((await adminCalls()).filter((r) => r.path === RATE).map((r) => [r.method, r.body])).toEqual([
      ["PUT", { rating: "RATES" }], ["PUT", { rating: "MIGHT" }], ["PUT", { rating: "DULL" }],
    ]);
  });

  it("clears one: the pressed button's NONE is the API's DELETE, with no body", async () => {
    const v = await signedIn(ADMIN);
    const answer = await v.post(RATE, { rating: "NONE", back: "/rss" });

    expect(answer.status).toBe(303);
    expect(answer.location).toBe(`/rss#item-${ITEM}`);
    const sent = (await adminCalls()).filter((r) => r.path === RATE);
    expect(sent.map((r) => [r.method, r.body])).toEqual([["DELETE", undefined]]);
  });

  it("answers JSON for client/rate.ts, saying what's now so in words", async () => {
    const v = await signedIn(ADMIN);
    const cookie = [...v.cookies].map(([k, x]) => `${k}=${x}`).join("; ");
    const form = new URLSearchParams({ csrf: await v.csrf(), rating: "RATES", back: "/rss" });
    const base = inject("appUrl");
    const set = await fetch(`${base}${RATE}`, { method: "POST", body: form, headers: { Cookie: cookie, Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" }, redirect: "manual" });

    expect(set.status).toBe(200);
    expect(await set.json()).toEqual({ itemId: ITEM, rating: "RATES", ratedBy: "ed", said: "Rated Rates by ed" });

    form.set("rating", "NONE");
    const cleared = await fetch(`${base}${RATE}`, { method: "POST", body: form, headers: { Cookie: cookie, Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" }, redirect: "manual" });
    expect(cleared.status).toBe(200);
    expect(await cleared.json()).toEqual({ itemId: ITEM, rating: null, ratedBy: null, said: "Unrated" });
  });

  it("is refused without the form's token, and the API isn't asked", async () => {
    const v = await signedIn(ADMIN);
    expect((await v.post(RATE, { rating: "RATES", back: "/rss" }, { csrf: false })).status).toBe(403);
    expect((await v.post(RATE, { rating: "RATES", back: "/rss", csrf: "x".repeat(32) })).status).toBe(403);
    expect((await v.post(RATE, { rating: "NONE", back: "/rss", csrf: "" })).status).toBe(403);
    expect(await adminCalls()).toEqual([]);
  });

  it("refuses what isn't a rating, or an id that isn't one, without asking the API", async () => {
    const v = await signedIn(ADMIN);
    const bad = await v.post(RATE, { rating: "EXCELLENT", back: "/rss" });
    expect(bad.status).toBe(400);
    expect(text(bad.doc.querySelector(".rss-rate-refused"))).toBe("Rate it Rates, Might or Dull.");
    expect((await v.post(RATE, { back: "/rss" })).status).toBe(400);
    expect((await v.post("/admin/rss/items/not-an-id/rating", { rating: "RATES" })).status).toBe(404);
    expect(await adminCalls()).toEqual([]);
  });

  it("goes back only to the reader", async () => {
    const v = await signedIn(ADMIN);
    for (const back of ["//evil.example/rss", "https://evil.example/", "/admin", "/rssx", ""]) {
      expect((await v.post(RATE, { rating: "RATES", back })).location, back).toBe(`/rss#item-${ITEM}`);
    }
    expect((await v.post(RATE, { rating: "RATES", back: "/rss?title=a#elsewhere" })).location).toBe(`/rss?title=a#item-${ITEM}`);
  });

  it("says why when the API refuses, with the way back to the item", async () => {
    await stub(RATE, { detail: "Unknown item" }, { method: "PUT", status: 404 });
    const v = await signedIn(ADMIN);
    const gone = await v.post(RATE, { rating: "RATES", back: "/rss?page=1" });
    expect(gone.status).toBe(404);
    expect(text(gone.doc.querySelector(".rss-rate-refused"))).toBe("That item isn't stored any more.");
    expect(gone.doc.querySelector("main a.form-helper")!.getAttribute("href")).toBe(`/rss?page=1#item-${ITEM}`);

    await stub(RATE, { detail: "Rating must be one of RATES, MIGHT, DULL" }, { method: "PUT", status: 400 });
    const refused = await v.post(RATE, { rating: "MIGHT", back: "/rss" });
    expect(refused.status).toBe(400);
    expect(text(refused.doc.querySelector(".rss-rate-refused"))).toBe("Rating must be one of RATES, MIGHT, DULL");

    await stub(RATE, { detail: "down" }, { method: "PUT", status: 503 });
    expect((await v.post(RATE, { rating: "MIGHT", back: "/rss" })).status).toBe(503);
  });
});
