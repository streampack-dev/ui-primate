import { beforeEach, describe, expect, it } from "vitest";
import { text } from "../support/page.ts";
import { list, post, requests, resetStubs, stub, stubSite } from "../support/stub.ts";
import { signedIn, stubSignIn } from "../support/readers.ts";
import { Visitor } from "../support/visitor.ts";

beforeEach(async () => {
  await resetStubs();
  await stubSite();
  await stub("/posts", list([post()]), { query: { page: 0, size: 9 } });
  await stub("/posts/popular", list([]), { query: { page: 0, size: 3 } });
});

describe("signing in", () => {
  it("asks for an email address first, in a form that works without script", async () => {
    const { status, doc } = await new Visitor().get("/login?return=%2Fposts%2F2026%2F09%2Fx");
    const form = doc.querySelector("form[action='/login/code']")!;

    expect(status).toBe(200);
    expect(form.getAttribute("method")).toBe("post");
    expect(form.querySelector("input[name=email][type=email]")).not.toBeNull();
    expect(form.querySelector("input[name=return]")?.getAttribute("value")).toBe("/posts/2026/09/x");
    expect(form.querySelector("input[name=csrf]")?.getAttribute("value")).toMatch(/.{20,}/);
  });

  it("has the API email a code, then asks for it", async () => {
    await stubSignIn();
    const v = new Visitor();
    const sent = await v.post("/login/code", { email: " joe@example.com ", return: "/tags" });

    expect(sent.status).toBe(303);
    expect(sent.location).toBe("/login?step=code&return=%2Ftags");
    const asked = (await requests()).find((r) => r.path === "/auth/otp/request")!;
    expect(asked.body).toEqual({ channel: "email", address: "joe@example.com" });

    const { doc } = await v.get(sent.location!);
    expect(doc.querySelector("form[action='/login'] input[name=code]")).not.toBeNull();
    expect(text(doc.querySelector("main"))).toContain("joe@example.com");
  });

  it("wants something like an email address before asking the API", async () => {
    const { status, doc } = await new Visitor().post("/login/code", { email: "nope" });

    expect(status).toBe(400);
    expect(text(doc.querySelector(".form-error"))).toContain("Enter the email address you sign in with.");
    expect((await requests()).some((r) => r.path === "/auth/otp/request")).toBe(false);
  });

  it("says what the API says when it won't send a code", async () => {
    await stub("/auth/otp/request", { status: 429, detail: "Too many codes requested. Wait a minute." }, { method: "POST", status: 429 });
    const { doc } = await new Visitor().post("/login/code", { email: "joe@example.com" });
    expect(text(doc.querySelector(".form-error"))).toBe("Too many codes requested. Wait a minute.");
  });

  it("signs the reader in with the code, under a new session, and sends them back", async () => {
    await stubSignIn();
    const v = new Visitor();
    await v.post("/login/code", { email: "joe@example.com", return: "/tags" });
    const before = v.cookies.get("session_id");
    const done = await v.post("/login", { code: " 123456 ", return: "/tags" });

    expect(done.status).toBe(303);
    expect(done.location).toBe("/tags");
    expect((await requests()).find((r) => r.path === "/auth/otp/verify")!.body).toEqual({ channel: "email", address: "joe@example.com", code: "123456" });
    // A session id fixed before signing in is no use afterwards.
    expect(v.cookies.get("session_id")).toBeTruthy();
    expect(v.cookies.get("session_id")).not.toBe(before);
  });

  it("keeps the API's tokens on the server, never in the browser", async () => {
    const v = await signedIn();
    const { html } = await v.get("/");

    expect([...v.cookies.keys()]).toEqual(["session_id"]);
    expect(html).not.toContain("access-1");
    expect(html).not.toContain("refresh-1");
  });

  it("names the signed-in reader in the header, with a way to sign out", async () => {
    const v = await signedIn();
    const header = (await v.get("/")).doc.querySelector("header")!;

    expect(text(header)).toContain("Joe O");
    expect(header.querySelector("form[action='/logout'][method=post]")).not.toBeNull();
    expect(header.querySelector("a[href^='/login']")).toBeNull();
  });

  it("asks again for a wrong code, saying what the API said", async () => {
    await stubSignIn();
    await stub("/auth/otp/verify", { status: 401, detail: "That code is wrong or expired." }, { method: "POST", status: 401 });
    const v = new Visitor();
    await v.post("/login/code", { email: "joe@example.com" });
    const { status, doc } = await v.post("/login", { code: "000000" });

    expect(status).toBe(400);
    expect(text(doc.querySelector(".form-error"))).toBe("That code is wrong or expired.");
    expect(doc.querySelector("header form[action='/search']")).not.toBeNull();
    expect(doc.querySelector("input[name=code]")).not.toBeNull();
  });

  it("only ever sends the reader back somewhere on this site", async () => {
    await stubSignIn();
    const v = new Visitor();
    await v.post("/login/code", { email: "joe@example.com", return: "https://evil.example/" });
    const done = await v.post("/login", { code: "123456", return: "//evil.example/" });
    expect(done.location).toBe("/");
  });

  it("refuses a form posted without the reader's anti-forgery token", async () => {
    await stubSignIn();
    const { status } = await new Visitor().post("/login/code", { email: "joe@example.com" }, { csrf: false });

    expect(status).toBe(403);
    expect((await requests()).some((r) => r.path === "/auth/otp/request")).toBe(false);
  });
});

describe("signing out", () => {
  it("revokes the tokens at the API and ends the session", async () => {
    const v = await signedIn();
    await stub("/auth/logout", { message: "Signed out." }, { method: "POST" });
    const out = await v.post("/logout");

    expect(out.status).toBe(303);
    expect(out.location).toBe("/");
    const revoked = (await requests()).find((r) => r.path === "/auth/logout")!;
    expect(revoked.headers.authorization).toBe("Bearer access-1");
    expect(text((await v.get("/")).doc.querySelector("header"))).toContain("Log in");
  });

  it("ends the session even when the API can't be told", async () => {
    const v = await signedIn();
    expect(text((await v.get("/")).doc.querySelector("header"))).toContain("Joe O");
    await stub("/auth/logout", { detail: "down" }, { method: "POST", status: 503 });
    await v.post("/logout");
    expect(text((await v.get("/")).doc.querySelector("header"))).toContain("Log in");
  });
});
