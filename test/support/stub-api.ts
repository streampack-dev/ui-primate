/* A stand-in for the ByteCode News API, as ui-pudl's tests use WireMock: tests say what each path
   answers, and the app under test, pointed at it by BCN_API_BASE, never reaches the real API.

   Like the API, it gives each answer an ETag and answers a matching If-None-Match with a bodiless
   304, and it records every request, so a test can see what the app sent. Tests running in other
   processes program it over HTTP, through /__stub, /__reset and /__requests (see stub.ts). */
import { createHash } from "node:crypto";
import http from "node:http";

export type Answer = { status?: number; body?: unknown; raw?: string; headers?: Record<string, string>; delayMs?: number };
export type Seen = { method: string; path: string; query: Record<string, string>; headers: Record<string, string>; body: unknown };

/** An answer matches a path, and every query parameter and request header it names (others are
   ignored); header names in lower case. */
type Rule = { path: string; method?: string; query: Record<string, string>; when?: Record<string, string>; answer: Answer };

export function startStubApi(port = 0): Promise<{ url: string; close: () => Promise<void> }> {
  let rules: Rule[] = [];
  let seen: Seen[] = [];

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://stub");
    if (url.pathname.startsWith("/__")) return admin(url.pathname, req, res);

    const query = Object.fromEntries(url.searchParams);
    let incoming = "";
    for await (const chunk of req) incoming += chunk;
    let received: unknown = incoming || undefined;
    try { received = incoming ? JSON.parse(incoming) : undefined; } catch { /* kept as text */ }
    seen.push({ method: req.method || "GET", path: url.pathname, query, headers: req.headers as Record<string, string>, body: received });
    // The last rule that matches wins, so a test can override a default.
    const rule = [...rules].reverse().find((r) =>
      r.path === url.pathname && (!r.method || r.method === req.method) && Object.entries(r.query).every(([k, v]) => query[k] === v) &&
      Object.entries(r.when || {}).every(([k, v]) => req.headers[k] === v));
    if (!rule) {
      res.writeHead(404, { "Content-Type": "application/problem+json" });
      return res.end(JSON.stringify({ status: 404, detail: `No stub for ${url.pathname}` }));
    }
    const { status = 200, body, raw, headers = {}, delayMs = 0 } = rule.answer;
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    // A raw answer (XML, say) is sent as it is, with whatever Content-Type the rule gives.
    const text = raw ?? (body === undefined ? "" : JSON.stringify(body));
    const etag = `"${createHash("sha1").update(text).digest("hex").slice(0, 16)}"`;
    if (status === 200 && req.headers["if-none-match"] === etag) {
      res.writeHead(304, { ETag: etag, ...headers });
      return res.end();
    }
    res.writeHead(status, { "Content-Type": "application/json", ...(status === 200 ? { ETag: etag } : {}), ...headers });
    res.end(text);
  });

  async function admin(path: string, req: http.IncomingMessage, res: http.ServerResponse) {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    if (path === "/__stub") rules.push(JSON.parse(raw));
    else if (path === "/__reset") { rules = []; seen = []; }
    else if (path === "/__requests") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(seen));
    }
    res.writeHead(204);
    res.end();
  }

  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      const address = server.address() as { port: number };
      resolve({
        url: `http://127.0.0.1:${address.port}`,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}
