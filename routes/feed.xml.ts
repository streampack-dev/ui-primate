import route from "primate/route";

const base = () => (process.env.BCN_API_BASE || "https://api.bytecode.news").replace(/\/$/, "");
/* The last good feed for each host it was asked for, served while the API is down. */
const kept = new Map<string, { body: string; type: string }>();

/* The site's feed: the API's, which builds its links from where the reader is, so this passes that
   on: the host and scheme a proxy in front of us says, else our own. */
export default route({
  async get(request) {
    const first = (name: string) => request.headers.try(name)?.split(",")[0].trim() || undefined;
    const host = first("x-forwarded-host") || first("host") || request.url.host;
    const proto = first("x-forwarded-proto") === "https" || first("x-forwarded-proto") === "http"
      ? first("x-forwarded-proto")!
      : request.url.protocol.replace(":", "");
    const port = first("x-forwarded-port") || request.url.port || (proto === "https" ? "443" : "80");
    try {
      const response = await fetch(`${base()}/feed.xml`, {
        headers: { Accept: "application/xml,text/xml;q=0.9,*/*;q=0.8", "X-Forwarded-Host": host, "X-Forwarded-Proto": proto, "X-Forwarded-Port": port },
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) throw new Error(`API ${response.status} on /feed.xml`);
      const feed = { body: await response.text(), type: response.headers.get("content-type") || "application/xml; charset=utf-8" };
      kept.set(host, feed);
      return new Response(feed.body, { headers: { "Content-Type": feed.type } });
    } catch {
      const feed = kept.get(host);
      if (feed) return new Response(feed.body, { headers: { "Content-Type": feed.type } });
      return new Response("The feed is unavailable just now.", { status: 503, headers: { "Content-Type": "text/plain" } });
    }
  },
});
