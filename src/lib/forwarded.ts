/* XML the API builds with the site's links in it (the feeds, the sitemap), served on whatever host
   the reader asked. The API builds every link on the canonical host (SITE_URL), whatever it's told,
   so, as ui-pudl does, the canonical origin is moved to the reader's: where it stands whole (followed
   by a path, a quote, a tag, whitespace or the end), and not on the canonical host itself. The
   reader's origin is the host, scheme and port a proxy in front of us says, else our own; the API is
   told them too, in case it ever builds for them. The last good copy of each, for each host, is
   served while the API is down. */
import { siteUrl } from "#lib/meta.ts";

const base = () => (process.env.BCN_API_BASE || "https://api.bytecode.news").replace(/\/$/, "");
const kept = new Map<string, { body: string; type: string }>();

type Request = { headers: { try(name: string): string | undefined }; url: URL };

export async function forwardedXml(request: Request, path: string, unavailable: string): Promise<Response> {
  const first = (name: string) => request.headers.try(name)?.split(",")[0].trim() || undefined;
  const host = first("x-forwarded-host") || first("host") || request.url.host;
  const proto = first("x-forwarded-proto") === "https" || first("x-forwarded-proto") === "http"
    ? first("x-forwarded-proto")!
    : request.url.protocol.replace(":", "");
  // Behind a proxy, the port is what it says, else the scheme's own: never ours, which it hides.
  const port = first("x-forwarded-port") || (first("x-forwarded-host") ? "" : request.url.port) || (proto === "https" ? "443" : "80");
  const key = `${path} ${host}`;
  const defaultPort = proto === "https" ? "443" : "80";
  const origin = `${proto}://${host}${host.includes(":") || port === defaultPort ? "" : `:${port}`}`;
  const here = (body: string) => onThisHost(body, origin);
  try {
    const response = await fetch(`${base()}${path}`, {
      headers: { Accept: "application/xml,text/xml;q=0.9,*/*;q=0.8", "X-Forwarded-Host": host, "X-Forwarded-Proto": proto, "X-Forwarded-Port": port },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error(`API ${response.status} on ${path}`);
    const copy = { body: await response.text(), type: response.headers.get("content-type") || "application/xml; charset=utf-8" };
    kept.set(key, copy);
    return new Response(here(copy.body), { headers: { "Content-Type": copy.type } });
  } catch {
    const copy = kept.get(key);
    if (copy) return new Response(here(copy.body), { headers: { "Content-Type": copy.type } });
    return new Response(unavailable, { status: 503, headers: { "Content-Type": "text/plain" } });
  }
}

/** [body] with the canonical origin, where it stands whole, moved to [origin]. */
export function onThisHost(body: string, origin: string): string {
  const canonical = siteUrl();
  if (origin.toLowerCase() === canonical.toLowerCase()) return body;
  const escaped = canonical.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return body.replace(new RegExp(`${escaped}(?=[/"'<\\s]|$)`, "gi"), origin);
}
