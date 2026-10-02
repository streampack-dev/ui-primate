import { beforeEach, describe, expect, inject, it } from "vitest";
import { startApp } from "../support/app.ts";
import { text } from "../support/page.ts";
import { signedIn } from "../support/readers.ts";
import { list, post, requests, resetStubs, stub, stubSite } from "../support/stub.ts";
import { Visitor } from "../support/visitor.ts";

beforeEach(async () => {
  await resetStubs();
  await stubSite();
  await stub("/posts", list([post()]), { query: { page: 0, size: 9 } });
  await stub("/posts/popular", list([]), { query: { page: 0, size: 3 } });
});

describe("a reader's session", () => {
  it("outlasts a restart: kept in the database, its tokens still usable", async () => {
    const before = await signedIn();
    // Another app on the same database and secret: the app as it is after a restart.
    const restarted = await startApp(inject("appEnv"));
    try {
      const after = new Visitor(restarted.url);
      after.cookies = new Map(before.cookies);
      expect(text((await after.get("/")).doc.querySelector("header"))).toContain("Joe O");

      await stub("/posts", { id: "019f0000-0000-7000-8000-0000000d0001", title: "Midden", status: "DRAFT" }, { method: "POST", status: 201 });
      const { doc } = await after.get("/submit");
      const done = await after.post("/submit", {
        formLoadedAt: doc.querySelector("input[name=formLoadedAt]")?.getAttribute("value") || "",
        title: "Midden",
        markdownSource: "Midden reads heap dumps.",
      });
      expect(done.location).toBe("/submit/thanks");
      expect((await requests()).find((r) => r.method === "POST" && r.path === "/posts")!.headers.authorization).toBe("Bearer access-1");
    } finally {
      restarted.stop();
    }
  });

  it("is named by a cookie that lasts thirty days", async () => {
    const response = await fetch(`${inject("appUrl")}/login`);
    const cookie = response.headers.getSetCookie().find((c) => c.startsWith("session_id="))!;
    expect(cookie).toMatch(/Max-Age=2592000/);
    expect(cookie).toMatch(/HttpOnly/);
  });
});
