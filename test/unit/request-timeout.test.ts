import { describe, expect, it } from "vitest";
import app, { REQUEST_TIMEOUT_MS } from "../../config/app.ts";

/* Node ends a request that takes longer than its server's requestTimeout (five minutes) with a
   408, so a recording on a slow connection never arrived (#47). Primate 0.43 sets it from
   http.timeout.request (primate-bugs/16, primate#216), where ui-primate's own module used to. */
describe("how long a request may take to arrive", () => {
  it("is half an hour, set through Primate", () => {
    expect(REQUEST_TIMEOUT_MS).toBe(30 * 60 * 1000);
    expect((app as unknown as { config(path: string): unknown }).config("http.timeout"))
      .toEqual({ request: REQUEST_TIMEOUT_MS });
  });
});
