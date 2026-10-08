import { beforeEach, describe, expect, it } from "vitest";
import { inject } from "vitest";
import { atlas, ago, DAY, stubAtlas, stubCatalog } from "../support/atlas.ts";
import { page, text } from "../support/page.ts";
import { requests, resetStubs, stub, stubSite } from "../support/stub.ts";
import { Visitor } from "../support/visitor.ts";

/* The Atlas (ui-pudl#184): the site's tags as a map, drawn from the API's GET /atlas. */

beforeEach(async () => {
  await resetStubs();
  await stubSite();
  await stubAtlas();
});

const seconds = (iso: string) => String(Math.floor(Date.parse(iso) / 1000));

describe("the Atlas", () => {
  it("draws every place as a link to its tag's page, named with what's found there", async () => {
    const { status, doc } = await page("/atlas");
    const places = doc.querySelectorAll("svg.atlas-map a.place");

    expect(status).toBe(200);
    expect(text(doc.querySelector("main h1"))).toBe("Atlas");
    expect(places.map((a) => a.getAttribute("href"))).toEqual(["/tags/java", "/tags/spring", "/tags/rust", "/tags/wasm", "/tags/cobol"]);
    const java = doc.querySelector("a.place[data-tag=java]")!;
    expect(java.getAttribute("aria-label")).toMatch(/^java: 3 articles, 2 factoids/);
    expect(doc.querySelector("a.place[data-tag=rust]")!.getAttribute("aria-label")).toMatch(/^rust: 4 factoids/);
    // Where the API put them, at the size it gave: nothing is laid out again here.
    expect(java.querySelector(".mark")!.getAttribute("d")).toBe("M0,-12.3L12.3,0L0,12.3L-12.3,0Z");
    const spring = doc.querySelector("a.place[data-tag=spring] .mark")!;
    expect([spring.getAttribute("cx"), spring.getAttribute("cy"), spring.getAttribute("r")]).toEqual(["40", "30", "6.6"]);
    expect(doc.querySelector("a.place[data-tag=java] text.label")!.getAttribute("style")).toBe("--fs:12.2");
    expect(doc.querySelector("svg.atlas-map")!.getAttribute("data-world")).toBe("-300 -400 1400 900");
    expect(doc.querySelector("svg.atlas-map")!.getAttribute("aria-label")).toBe("Map of the site's tags: 5 places in 3 regions");
  });

  it("tells each kind of place and pin by its own shape, not by colour", async () => {
    const { doc } = await page("/atlas");
    const mark = (tag: string) => doc.querySelector(`a.place[data-tag=${tag}] .mark`)!;

    // A disc (a filled circle), a ring (a circle drawn as its outline), a diamond (a path).
    expect([mark("spring").tagName.toLowerCase(), mark("spring").classList.contains("mark-disc")]).toEqual(["circle", true]);
    expect([mark("rust").tagName.toLowerCase(), mark("rust").classList.contains("mark-ring")]).toEqual(["circle", true]);
    expect(mark("rust").getAttribute("style")).toMatch(/stroke-width:\s*3\.5/);
    expect([mark("java").tagName.toLowerCase(), mark("java").classList.contains("mark-diamond")]).toEqual(["path", true]);

    // Pins: a square for an article, a triangle for a factoid, each a link to its page.
    const article = doc.querySelector("g.pins[data-for=java] a.pin-article")!;
    const factoid = doc.querySelector("g.pins[data-for=java] a.pin-factoid")!;
    expect(article.getAttribute("href")).toBe("/posts/2026/10/virtual-threads");
    expect(factoid.getAttribute("href")).toBe("/factoids/jvm");
    expect(article.querySelector("path")!.getAttribute("d")).toMatch(/^M[-\d.]+,[-\d.]+H[-\d.]+V[-\d.]+H[-\d.]+Z$/);
    expect(factoid.querySelector("path")!.getAttribute("d")).toMatch(/^M[-\d.]+,[-\d.]+L[-\d.]+,[-\d.]+L[-\d.]+,[-\d.]+Z$/);
    // The pins are for the pointer: the places and the list reach the same pages.
    expect(doc.querySelector("g.atlas-pins")!.getAttribute("aria-hidden")).toBe("true");
    expect(doc.querySelectorAll("a.pin").every((a) => a.getAttribute("tabindex") === "-1")).toBe(true);

    // The list says it by shape too.
    expect(doc.querySelectorAll(".atlas-list .atlas-kind").map((k) => k.classList.toString().split(" ").find((c) => c.startsWith("atlas-kind-")))).toEqual([
      "atlas-kind-shared", "atlas-kind-articles", "atlas-kind-factoids", "atlas-kind-articles", "atlas-kind-articles",
    ]);
  });

  it("has a legend naming each shape", async () => {
    const { doc } = await page("/atlas");
    const items = doc.querySelectorAll(".atlas-legend li");

    expect(doc.querySelector(".atlas-key-box summary")).not.toBeNull();
    expect(items.map((li) => text(li))).toEqual([
      "disc: Articles only", "ring: Factoids only", "diamond: Articles and factoids",
      "square: An article, close up", "triangle: A factoid, close up",
      "dot: Something new", "small ring: Something changed",
    ]);
    // Each with its shape drawn.
    expect(items.map((li) => li.querySelector("svg :is(circle, path)")!.classList.toString())).toEqual([
      "mark mark-disc", "mark mark-ring", "mark mark-diamond", "pin-mark pin-mark-article", "pin-mark pin-mark-factoid", "badge badge-new", "badge badge-changed",
    ]);
  });

  it("lists every region and its places, as links, the way in without the map", async () => {
    const { doc } = await page("/atlas");
    const list = doc.querySelector("nav.atlas-list")!;

    expect(list.querySelectorAll("h3").map(text)).toEqual(["java · spring", "rust · wasm", "Uncharted"]);
    expect(list.querySelectorAll("a.atlas-row").map((a) => [a.getAttribute("href"), text(a.querySelector(".atlas-row-tag")), text(a.querySelector(".atlas-row-counts"))])).toEqual([
      ["/tags/java", "java", "3 articles, 2 factoids"],
      ["/tags/spring", "spring", "1 article"],
      ["/tags/rust", "rust", "4 factoids"],
      ["/tags/wasm", "wasm", "1 article"],
      ["/tags/cobol", "cobol", "1 article"],
    ]);
  });

  it("frames the place ?at= names, and says when no place is called that", async () => {
    const { doc } = await page("/atlas?at=Java");
    expect(text(doc.querySelector("title"))).toBe("java | Atlas | ByteCode.News");
    expect(doc.querySelector("[data-atlas]")!.getAttribute("data-focus")).toBe("java");
    expect(doc.querySelector("svg.atlas-map")!.getAttribute("viewBox")).toBe("-320 -220 640 440");
    expect(doc.querySelector("a.place[data-tag=java]")!.classList.contains("here")).toBe(true);
    expect(doc.querySelector("g.pins[data-for=java]")!.classList.contains("here")).toBe(true);
    expect(doc.querySelector("a.atlas-row[href='/tags/java']")!.getAttribute("aria-current")).toBe("true");
    expect(doc.querySelector("#atlas-at")!.getAttribute("value")).toBe("java");

    const missed = await page("/atlas?at=fortran");
    expect(missed.status).toBe(200);
    expect(text(missed.doc.querySelector(".atlas-missed"))).toBe("No place on the map is called “fortran”.");
    expect(text(missed.doc.querySelector("title"))).toBe("Atlas | ByteCode.News");
  });

  it("offers every place's name to the find form", async () => {
    const { doc } = await page("/atlas");
    const form = doc.querySelector("form.atlas-find")!;
    expect([form.getAttribute("action"), form.getAttribute("method")]).toEqual(["/atlas", "get"]);
    expect(doc.querySelectorAll("#atlas-tags option").map((o) => o.getAttribute("value"))).toEqual(["cobol", "java", "rust", "spring", "wasm"]);
  });

  it("is in the site's navigation", async () => {
    const { doc } = await page("/");
    expect(doc.querySelectorAll("header nav a[href='/atlas']").length).toBe(2);
    expect(doc.querySelector("footer a[href='/atlas']")).not.toBeNull();
  });

  it("asks the API again with the ETag it was given, and draws the same map from a 304", async () => {
    await page("/atlas");
    const second = await page("/atlas");
    const asked = (await requests()).filter((r) => r.path === "/atlas");

    expect(asked.length).toBe(2);
    expect(asked[1].headers["if-none-match"]).toMatch(/^".+"$/);
    expect(second.doc.querySelectorAll("a.place").length).toBe(5);
  });

  it("says when the map can't be had", async () => {
    await resetStubs();
    await stubSite();
    await stub("/atlas", { detail: "down" }, { status: 503 });
    // A fresh app: the tests' app keeps the last good map, as it should.
    const { startApp } = await import("../support/app.ts");
    const app = await startApp(inject("appEnv"));
    try {
      const response = await fetch(`${app.url}/atlas`);
      const html = await response.text();
      expect(response.status).toBe(503);
      expect(html).toContain("The map is unavailable right now");
      expect(response.headers.getSetCookie()).toEqual([]);
    } finally {
      app.stop();
    }
  });
});

describe("What's new on the Atlas", () => {
  it("is private to the reader: no-cache, and the visit kept in two timestamp cookies", async () => {
    const response = await fetch(`${inject("appUrl")}/atlas`);
    const cookies = response.headers.getSetCookie();

    expect(response.headers.get("cache-control")).toBe("private, no-cache");
    expect(cookies.map((c) => c.split("=")[0])).toEqual(["bcn-atlas-since", "bcn-atlas-seen"]);
    for (const c of cookies) expect(c).toMatch(/^bcn-atlas-(since|seen)=\d+; Max-Age=\d+; Path=\/; HttpOnly; SameSite=Lax$/);
    // A first visit counts the last two weeks.
    const since = Number(cookies[0].split(/[=;]/)[1]) * 1000;
    expect(Math.abs(since - (Date.now() - 14 * DAY))).toBeLessThan(60_000);
    expect(cookies[0]).toContain("Max-Age=7200");
    expect(cookies[1]).toContain("Max-Age=31536000");
  });

  it("asks for the factoids set or changed since the visit, never every factoid", async () => {
    const reader = new Visitor();
    const last = seconds(ago(7 * DAY));
    reader.cookies.set("bcn-atlas-seen", last);
    await reader.get("/atlas");
    const asked = (await requests()).filter((r) => r.path === "/factoids");

    expect(asked.length).toBeGreaterThan(0);
    for (const r of asked) expect(r.query.since).toBe(new Date(Number(last) * 1000).toISOString());
  });

  it("lists new posts, then new factoids, then changes, since the last visit, with the places they're at", async () => {
    const reader = new Visitor();
    reader.cookies.set("bcn-atlas-seen", seconds(ago(7 * DAY)));
    const { doc } = await reader.get("/atlas");
    const items = doc.querySelectorAll(".whats-new-item");

    expect(items.map((li) => [text(li.querySelector(".fresh-badge")), text(li.querySelector(".whats-new-kind")), text(li.querySelector(".whats-new-title"))])).toEqual([
      ["New", "article", "Virtual threads"],
      ["New", "factoid", "borrowck"],
      ["Changed", "factoid", "jvm"],
    ]);
    expect(items.map((li) => li.querySelector(".whats-new-title")!.getAttribute("href"))).toEqual(["/posts/2026/10/virtual-threads", "/factoids/borrowck", "/factoids/jvm"]);
    // At its places on the map (a tag that isn't a place, "Loom", is left out).
    expect(items[0].querySelectorAll(".whats-new-meta a").map((a) => [a.getAttribute("href"), a.getAttribute("data-atlas-frame")])).toEqual([["/atlas?at=java", "java"]]);
    expect(text(doc.querySelector(".whats-new-since"))).toMatch(/: 2 new, 1 changed$/);

    // On the map: a dot where something is new, a small ring where something only changed.
    expect(doc.querySelector("a.place[data-tag=java] circle.badge-new")).not.toBeNull();
    expect(doc.querySelector("a.place[data-tag=java]")!.getAttribute("aria-label")).toBe("java: 3 articles, 2 factoids; 1 new, 1 changed");
    expect(doc.querySelector("a.place[data-tag=rust] circle.badge-new")).not.toBeNull();
    expect(doc.querySelector("a.place[data-tag=spring] .badge")).toBeNull();
    expect(text(doc.querySelector("a.atlas-row[href='/tags/java'] .fresh-badge"))).toBe("New");
  });

  it("counts from the visit's start while it goes on, and from the last visit after", async () => {
    // The last visit was two days ago: the post from yesterday is new, the factoid from three days
    // ago isn't, nor is anything changed before that.
    const reader = new Visitor();
    const last = seconds(ago(2 * DAY));
    reader.cookies.set("bcn-atlas-seen", last);
    const first = await reader.get("/atlas");
    expect(first.doc.querySelectorAll(".whats-new-title").map(text)).toEqual(["Virtual threads", "jvm"]);
    expect(reader.cookies.get("bcn-atlas-since")).toBe(last);

    // A reload during the visit counts the same things, though the reader was just here.
    const again = await reader.get("/atlas");
    expect(again.doc.querySelectorAll(".whats-new-title").map(text)).toEqual(["Virtual threads", "jvm"]);
    expect(Number(reader.cookies.get("bcn-atlas-seen"))).toBeGreaterThan(Date.now() / 1000 - 60);

    // Back after the visit (its cookie gone): only what's happened since the last view.
    reader.cookies.delete("bcn-atlas-since");
    const later = await reader.get("/atlas");
    expect(later.doc.querySelectorAll(".whats-new-item").length).toBe(0);
    expect(text(later.doc.querySelector(".whats-new-none"))).toBe("Nothing new since your last visit.");
    expect(later.doc.querySelectorAll("svg.atlas-map .badge").length).toBe(0);
  });

  it("marks a place holding only changes with a small ring", async () => {
    await stubCatalog({
      posts: [],
      factoids: [{ selector: "cargo", createdAt: ago(40 * DAY), updatedAt: ago(DAY), tags: ["rust"], locked: false, accessCount: 0 }],
    });
    const reader = new Visitor();
    reader.cookies.set("bcn-atlas-seen", seconds(ago(5 * DAY)));
    const { doc } = await reader.get("/atlas");

    expect(doc.querySelector("a.place[data-tag=rust] circle.badge-changed")).not.toBeNull();
    expect(doc.querySelector("a.place[data-tag=rust] circle.badge-new")).toBeNull();
    expect(doc.querySelector("a.place[data-tag=rust]")!.getAttribute("aria-label")).toBe("rust: 4 factoids; 1 changed");
  });

  it("frames the fresh places when they're together", async () => {
    await stubCatalog({ posts: [], factoids: [{ selector: "cargo", createdAt: ago(DAY), updatedAt: ago(DAY), tags: ["rust"], locked: false, accessCount: 0 }] });
    const { doc } = await page("/atlas");
    expect(doc.querySelector("svg.atlas-map")!.getAttribute("viewBox")).toBe("-60 -180 640 440");
  });

  it("still draws the map when the posts and factoids can't be read", async () => {
    await resetStubs();
    await stubSite();
    await stub("/atlas", atlas());
    await stub("/posts", { detail: "down" }, { query: { size: 100 }, status: 503 });
    await stub("/factoids", { detail: "down" }, { status: 503 });
    const { startApp } = await import("../support/app.ts");
    const app = await startApp(inject("appEnv"));
    try {
      const response = await fetch(`${app.url}/atlas`);
      const html = await response.text();
      expect(response.status).toBe(200);
      expect(html).toContain("What's new can't be read just now.");
      expect(html).toMatch(/href="?\/tags\/java"?[ >]/);
    } finally {
      app.stop();
    }
  });
});
