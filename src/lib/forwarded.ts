/* XML the API builds for where the reader is (the feed, the sitemap): passed through as it is, with
   the host, scheme and port a proxy in front of us says, else our own, so its links point at this
   site. The last good copy of each, for each host, is served while the API is down. */
const base = () => (process.env.BCN_API_BASE || "https://api.bytecode.news").replace(/\/$/, "");
const kept = new Map<string, { body: string; type: string }>();

type Request = { headers: { try(name: string): string | undefined }; url: URL };

export async function forwardedXml(request: Request, path: string, unavailable: string): Promise<Response> {
  const first = (name: string) => request.headers.try(name)?.split(",")[0].trim() || undefined;
  const host = first("x-forwarded-host") || first("host") || request.url.host;
  const proto = first("x-forwarded-proto") === "https" || first("x-forwarded-proto") === "http"
    ? first("x-forwarded-proto")!
    : request.url.protocol.replace(":", "");
  const port = first("x-forwarded-port") || request.url.port || (proto === "https" ? "443" : "80");
  const key = `${path} ${host}`;
  try {
    const response = await fetch(`${base()}${path}`, {
      headers: { Accept: "application/xml,text/xml;q=0.9,*/*;q=0.8", "X-Forwarded-Host": host, "X-Forwarded-Proto": proto, "X-Forwarded-Port": port },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error(`API ${response.status} on ${path}`);
    const copy = { body: await response.text(), type: response.headers.get("content-type") || "application/xml; charset=utf-8" };
    kept.set(key, copy);
    return new Response(copy.body, { headers: { "Content-Type": copy.type } });
  } catch {
    const copy = kept.get(key);
    if (copy) return new Response(copy.body, { headers: { "Content-Type": copy.type } });
    return new Response(unavailable, { status: 503, headers: { "Content-Type": "text/plain" } });
  }
}
