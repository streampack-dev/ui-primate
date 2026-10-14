import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import requestTimeout, { REQUEST_TIMEOUT_MS, stretch } from "../../src/lib/request-timeout.ts";

/* Node ends a request that takes longer than its server's requestTimeout (five minutes) with a
   408, and Primate doesn't let an app set it (#47). The module raises it on the server a request
   came in on, before the request's body is read. Here, on a real server created with a timeout of
   one second, checked every 100 ms, so a body sent over three seconds shows it. */
let server: http.Server | undefined;

afterEach(() => {
  server?.close();
  server = undefined;
});

/** A server that answers once it has the whole body: [hook] sees each request first, as a Primate
    module's onHandle does, with Primate's request around Node's. */
function serve(hook: (request: unknown) => void): Promise<number> {
  server = http.createServer({ requestTimeout: 1000, headersTimeout: 1000, connectionsCheckingInterval: 100 }, (incoming, response) => {
    hook({ original: { original: incoming } });
    incoming.resume();
    incoming.on("end", () => response.end("whole"));
  });
  return new Promise((resolve) => server!.listen(0, "127.0.0.1", () => resolve((server!.address() as AddressInfo).port)));
}

/** POSTs ten bytes, one every 300 ms, and says how it was answered. */
function slowUpload(port: number): Promise<string> {
  return new Promise((resolve) => {
    const request = http.request({ port, host: "127.0.0.1", method: "POST", headers: { "content-length": "10" } }, (response) => {
      let body = "";
      response.on("data", (chunk) => (body += chunk));
      response.on("end", () => resolve(`${response.statusCode} ${body}`.trim()));
    });
    request.on("error", (e) => resolve((e as NodeJS.ErrnoException).code || e.message));
    let sent = 0;
    const timer = setInterval(() => {
      request.write("x");
      if (++sent === 10) {
        clearInterval(timer);
        request.end();
      }
    }, 300);
  });
}

describe("the request timeout", () => {
  it("cuts off a slow upload as Node has it", async () => {
    const port = await serve(() => {});
    expect(await slowUpload(port)).toBe("408");
  });

  it("is raised before the body is read, so a slow upload is taken whole", async () => {
    const port = await serve(stretch);
    expect(await slowUpload(port)).toBe("200 whole");
    expect(server!.requestTimeout).toBe(REQUEST_TIMEOUT_MS);
  });

  it("is left alone where it's already longer, or off", () => {
    for (const before of [0, REQUEST_TIMEOUT_MS * 2]) {
      const fake = { requestTimeout: before };
      stretch({ original: { original: { socket: { server: fake } } } });
      expect(fake.requestTimeout).toBe(before);
    }
  });

  it("passes over a request it can't follow to its server, saying so once", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => stretch({ original: {} })).not.toThrow();
    expect(() => stretch({})).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("five minutes"));
    warn.mockRestore();
  });

  it("is a module that stretches each request and passes it on", async () => {
    let hook: ((request: unknown, next: (r: unknown) => Promise<Response>) => Promise<Response>) | undefined;
    requestTimeout.setup({ onHandle: (h) => (hook = h) });
    const fake = { requestTimeout: 300_000 };
    const request = { original: { original: { socket: { server: fake } } } };
    const answer = new Response("page");
    expect(await hook!(request, async (r) => (r === request ? answer : new Response("other")))).toBe(answer);
    expect(fake.requestTimeout).toBe(REQUEST_TIMEOUT_MS);
  });
});
