import { describe, expect, it } from "vitest";
import { SignInRequired, signedInCalls, type Tokens } from "../../src/auth/renewal.ts";

/** A session holding [tokens], recording what's written to it. */
function sessionWith(tokens: Tokens | null, id = "s1") {
  const s = {
    id,
    tokens,
    read: () => s.tokens,
    write: (t: Tokens | null) => { s.tokens = t; },
  };
  return s;
}

/** An API call that accepts only [good] as the access token. */
function apiAccepting(good: string) {
  const seen: string[] = [];
  const call = async (access: string) => {
    seen.push(access);
    return new Response(null, { status: access === good ? 200 : 401 });
  };
  return { seen, call };
}

describe("a call as a signed-in reader", () => {
  it("uses the reader's access token", async () => {
    const api = apiAccepting("a1");
    const calls = signedInCalls(async () => { throw new Error("no refresh expected"); });
    const answer = await calls(sessionWith({ access: "a1", refresh: "r1" }), api.call);

    expect(answer.status).toBe(200);
    expect(api.seen).toEqual(["a1"]);
  });

  it("renews an expired token once, keeps the new tokens and tries again", async () => {
    const api = apiAccepting("a2");
    const spent: string[] = [];
    const calls = signedInCalls(async (refresh) => { spent.push(refresh); return { access: "a2", refresh: "r2" }; });
    const session = sessionWith({ access: "a1", refresh: "r1" });
    const answer = await calls(session, api.call);

    expect(answer.status).toBe(200);
    expect(api.seen).toEqual(["a1", "a2"]);
    expect(spent).toEqual(["r1"]);
    expect(session.tokens).toEqual({ access: "a2", refresh: "r2" });
  });

  it("spends the refresh token once when several calls find the token expired at once", async () => {
    // The API rotates refresh tokens: spending one twice would be refused, signing the reader out.
    const api = apiAccepting("a2");
    const spent: string[] = [];
    const calls = signedInCalls(async (refresh) => {
      spent.push(refresh);
      await new Promise((r) => setTimeout(r, 20));
      return { access: "a2", refresh: "r2" };
    });
    // Each request sees the session as it was when the request began.
    const answers = await Promise.all([1, 2, 3].map(() => calls(sessionWith({ access: "a1", refresh: "r1" }), api.call)));

    expect(answers.map((a) => a.status)).toEqual([200, 200, 200]);
    expect(spent).toEqual(["r1"]);
  });

  it("uses a renewal already made for a request that began before it", async () => {
    const api = apiAccepting("a2");
    const spent: string[] = [];
    const calls = signedInCalls(async (refresh) => { spent.push(refresh); return { access: "a2", refresh: "r2" }; });
    await calls(sessionWith({ access: "a1", refresh: "r1" }, "s2"), api.call);
    const late = sessionWith({ access: "a1", refresh: "r1" }, "s2");
    await calls(late, api.call);

    expect(spent).toEqual(["r1"]);
    expect(late.tokens).toEqual({ access: "a2", refresh: "r2" });
  });

  it("signs the reader out when the API refuses the renewal", async () => {
    const calls = signedInCalls(async () => null);
    const session = sessionWith({ access: "a1", refresh: "r1" }, "s3");

    await expect(calls(session, apiAccepting("a2").call)).rejects.toBeInstanceOf(SignInRequired);
    expect(session.tokens).toBeNull();
  });

  it("signs the reader out when even the renewed token is refused", async () => {
    const calls = signedInCalls(async () => ({ access: "a2", refresh: "r2" }));
    const session = sessionWith({ access: "a1", refresh: "r1" }, "s4");

    await expect(calls(session, apiAccepting("nothing").call)).rejects.toBeInstanceOf(SignInRequired);
    expect(session.tokens).toBeNull();
  });

  it("keeps the reader signed in when the API can't be reached to renew", async () => {
    const calls = signedInCalls(async () => { throw new Error("down"); });
    const session = sessionWith({ access: "a1", refresh: "r1" }, "s5");

    await expect(calls(session, apiAccepting("a2").call)).rejects.toThrow("down");
    expect(session.tokens).toEqual({ access: "a1", refresh: "r1" });
  });

  it("wants a signed-in reader", async () => {
    const calls = signedInCalls(async () => null);
    await expect(calls(sessionWith(null), apiAccepting("a1").call)).rejects.toBeInstanceOf(SignInRequired);
  });
});
