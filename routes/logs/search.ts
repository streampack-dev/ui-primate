import response from "primate/response";
import route from "primate/route";
import type { components } from "#api/schema.d.ts";
import { refusal } from "#auth/forms.ts";
import { current, isAdmin } from "#auth/readers.ts";
import { askLogs, channels as listChannels, type Channel } from "#lib/log-channels.ts";
import { segments, speaker } from "#lib/logs.ts";
import { notFound } from "#lib/post-page.ts";
import { view } from "#lib/view.ts";

type Found = components["schemas"]["LogSearchResponse"];

/* Searching one channel's logs (#4), through streampack's GET /logs/search: lines with the text
   (`q`, 3 to 200 characters, ignoring case), from someone (`from`, a nick), or both, newest first,
   fifty to a page. Each hit links to its day's log at that line. Only a channel the reader is
   offered is searched; the API's refusals (a query too short, too many searches) are shown in its
   words. Searches aren't cached: each is its own question, and the API limits them. */
const SIZE = 50;
const MIN_QUERY = 3;
const MAX_QUERY = 200;

const DAY = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });

export default route({
  async get(request) {
    const provenance = request.query.try("provenance") || "";
    const q = (request.query.try("q") || "").trim();
    const from = (request.query.try("from") || "").trim();
    const asked = Number.parseInt(request.query.try("page") || "1", 10);
    const page = Number.isFinite(asked) && asked >= 1 ? asked : 1;
    const all = isAdmin(current()) && request.query.try("all") !== undefined;
    const privately = current() ? { "Cache-Control": "private, no-store" } : {};

    let offered: Channel[];
    try {
      offered = await listChannels(all);
    } catch {
      return view("LogsUnavailable.marko", { meta: { title: "Logs Unavailable" } }, { status: 503, headers: privately });
    }
    const channel = offered.find((c) => c.uri === provenance);
    if (!channel) return notFound();
    const own = { provenance, ...(all ? { all: "1" } : {}) };
    // Nothing to look for: the channel's log.
    if (!q && !from) return response.redirect(`/logs?${new URLSearchParams(own)}`, 303);

    const href = (n: number) => `/logs/search?${new URLSearchParams({ ...own, ...(q ? { q } : {}), ...(from ? { from } : {}), ...(n > 1 ? { page: String(n) } : {}) })}`;
    const shown = {
      channel: { name: channel.name, uri: channel.uri, href: `/logs?${new URLSearchParams(own)}` },
      all, q, from,
      heading: [q && `“${q}”`, from && `from ${from}`, `in ${channel.name}`].filter(Boolean).join(" "),
      meta: { title: `Search ${channel.name}`, path: "/logs", robots: "noindex" },
    };
    const refused = (notice: string, status: number) =>
      view("LogSearch.marko", { ...shown, notice, hits: [], summary: "", prev: null, next: null }, { status, headers: privately });

    if (q && (q.length < MIN_QUERY || q.length > MAX_QUERY)) return refused(`Search for ${MIN_QUERY} to ${MAX_QUERY} characters.`, 400);

    let answer: Response;
    try {
      answer = await askLogs("/logs/search", { provenance, ...(q ? { q } : {}), ...(from ? { sender: from } : {}), page: String(page - 1), size: String(SIZE) });
    } catch {
      return view("LogsUnavailable.marko", { meta: { title: "Logs Unavailable" } }, { status: 503, headers: privately });
    }
    if (answer.status === 404) return notFound();
    if (!answer.ok) {
      if (answer.status >= 500) return view("LogsUnavailable.marko", { meta: { title: "Logs Unavailable" } }, { status: 503, headers: privately });
      return refused(await refusal(answer, "That search didn't work."), answer.status);
    }
    const found = await answer.json() as Found;
    const total = Number(found.totalCount ?? 0);
    const hits = (found.hits || []).filter((h) => h.timestamp).map((h, i) => {
      const at = new Date(h.timestamp!);
      const day = h.day || at.toISOString().slice(0, 10);
      // A line's anchor on its day's page is its second (#lib/logs.ts); of several in one second, the first.
      const anchor = `l-${at.toISOString().slice(11, 19).replaceAll(":", "")}`;
      return {
        key: `${h.timestamp}-${i}`,
        href: `/logs?${new URLSearchParams({ ...own, day })}#${anchor}`,
        iso: h.timestamp!,
        when: `${DAY(day)}, ${at.toISOString().slice(11, 16)}`,
        sender: speaker(h.sender, h.content),
        segments: segments(h.content || ""),
        outbound: h.direction === "OUTBOUND",
      };
    });
    return view("LogSearch.marko", {
      ...shown,
      notice: "",
      hits,
      summary: `${total} line${total === 1 ? "" : "s"}`,
      prev: page > 1 ? href(page - 1) : null,
      next: page < Number(found.totalPages ?? 0) ? href(page + 1) : null,
    }, { headers: privately });
  },
});
