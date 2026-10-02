import { beforeEach, describe, expect, it } from "vitest";
import { page, text } from "../support/page.ts";
import { requests, resetStubs, stub, stubSite } from "../support/stub.ts";

const entry = (subject: string, score: number, lastUpdated = "2026-10-01") => ({ subject, score, lastUpdated });

beforeEach(async () => {
  await resetStubs();
  await stubSite();
  await stub("/karma/leaderboard", {
    top: [entry("java", 40), entry("kotlin", 10), entry("zero", 0), entry("stray", -1)],
    bottom: [entry("cobol", -8), entry("perl", -2), entry("zero", 0), entry("odd", 3)],
    limit: 25,
  }, { query: { limit: 25 } });
});

const rows = (doc: Awaited<ReturnType<typeof page>>["doc"]) =>
  doc.querySelectorAll("li.karma-entry").map((li) => [text(li.querySelector(".karma-rank")), text(li.querySelector(".karma-subject")), text(li.querySelector(".karma-score"))]);

describe("the karma leaderboard", () => {
  it("shows the top board by default: ranked, signed, dated, none below zero", async () => {
    const { status, doc } = await page("/karma");

    expect(status).toBe(200);
    expect(text(doc.querySelector("main h1"))).toBe("Karma");
    expect(rows(doc)).toEqual([["1", "java", "+40"], ["2", "kotlin", "+10"], ["3", "zero", "+0"]]);
    expect(text(doc.querySelector("li.karma-entry time"))).toBe("October 1, 2026");
  });

  it("draws each score's bar against the board's largest, never too thin to see", async () => {
    const { doc } = await page("/karma");
    const widths = doc.querySelectorAll("li.karma-entry .karma-bar-fill").map((b) => b.getAttribute("style"));
    expect(widths).toEqual(["width: 100%", "width: 25%", "width: 2%"]);
  });

  it("shows the bottom board when asked, none above zero", async () => {
    const { doc } = await page("/karma?view=bottom");
    expect(rows(doc)).toEqual([["1", "cobol", "-8"], ["2", "perl", "-2"], ["3", "zero", "+0"]]);
    expect(doc.querySelector("li.karma-entry .karma-score")?.classList.contains("is-negative")).toBe(true);
  });

  it("switches boards with links that keep how many are shown", async () => {
    await stub("/karma/leaderboard", { top: [], bottom: [], limit: 10 }, { query: { limit: 10 } });
    const { doc } = await page("/karma?limit=10&view=bottom");
    const tabs = doc.querySelectorAll("nav.karma-views a");

    expect(tabs.map((a) => [text(a), a.getAttribute("href")])).toEqual([["Top Karma", "/karma?limit=10"], ["Bottom Karma", "/karma?limit=10&view=bottom"]]);
    expect(doc.querySelector("nav.karma-views a[aria-current=page]")?.textContent).toBe("Bottom Karma");
  });

  it("asks for between 1 and 100 a board, 25 unless told, with a form that works without script", async () => {
    await stub("/karma/leaderboard", { top: [], bottom: [] }, { query: { limit: 100 } });
    await stub("/karma/leaderboard", { top: [], bottom: [] }, { query: { limit: 1 } });
    const limits = async (path: string) => {
      await page(path);
      return (await requests()).filter((r) => r.path === "/karma/leaderboard").at(-1)!.query.limit;
    };

    expect(await limits("/karma")).toBe("25");
    expect(await limits("/karma?limit=500")).toBe("100");
    expect(await limits("/karma?limit=0")).toBe("1");
    expect(await limits("/karma?limit=lots")).toBe("25");
    const form = (await page("/karma?limit=500&view=bottom")).doc.querySelector("main form[action='/karma']")!;
    expect(form.getAttribute("method")).toBe("get");
    expect(form.querySelector("input[name=limit]")?.getAttribute("value")).toBe("100");
    expect(form.querySelector("input[name=view]")?.getAttribute("value")).toBe("bottom");
  });

  it("says when there's no karma yet", async () => {
    await stub("/karma/leaderboard", { top: [], bottom: [] }, { query: { limit: 25 } });
    expect(text((await page("/karma")).doc.querySelector("main"))).toContain("No karma recorded yet");
  });

  it("says it's unavailable when the API is down and nothing was kept", async () => {
    await stub("/karma/leaderboard", { detail: "down" }, { query: { limit: 77 }, status: 503 });
    const { status, doc } = await page("/karma?limit=77");
    expect(status).toBe(503);
    expect(text(doc.querySelector("main"))).toContain("Karma Unavailable");
  });

  it("is titled for browsers and link previews", async () => {
    const { doc } = await page("/karma");
    expect(text(doc.querySelector("title"))).toBe("Karma | ByteCode.News");
  });
});
