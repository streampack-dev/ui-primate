import response from "primate/response";
import route from "primate/route";
import { ApiUnavailable, cachedGet } from "#api/client.ts";
import type { components } from "#api/schema.d.ts";
import { formatDate } from "#lib/format.ts";
import { meta } from "#lib/meta.ts";

type Board = components["schemas"]["KarmaLeaderboardResponse"];
type Entry = components["schemas"]["KarmaLeaderboardEntryResponse"];

/* The karma leaderboard, as ui-nextjs has it: the top board or the bottom one, 1 to 100 a board
   (25 unless asked), each score with a bar against the board's largest. The boards switch by
   link, so it needs no script. */
const DEFAULT = 25;

function limitAsked(value: string | undefined): number {
  const asked = Number.parseInt(value || "", 10);
  return Number.isFinite(asked) ? Math.min(Math.max(asked, 1), 100) : DEFAULT;
}

function karmaHref(limit: number, view: "top" | "bottom"): string {
  const params = new URLSearchParams();
  if (limit !== DEFAULT) params.set("limit", String(limit));
  if (view === "bottom") params.set("view", "bottom");
  return params.size ? `/karma?${params}` : "/karma";
}

export default route({
  async get(request) {
    const limit = limitAsked(request.query.try("limit"));
    const view = request.query.try("view") === "bottom" ? "bottom" : "top";
    const title = meta({ title: "Karma", description: "View the public karma leaderboard across bytecode.news integrations.", path: "/karma" });

    let board: Board | null;
    try {
      board = await cachedGet<Board>("/karma/leaderboard", { limit });
    } catch (e) {
      if (!(e instanceof ApiUnavailable)) throw e;
      return response.view("KarmaUnavailable.marko", {}, { status: 503, placeholders: { meta: title } });
    }
    const entries: Entry[] = view === "top"
      ? (board?.top || []).filter((e) => (e.score ?? 0) >= 0)
      : (board?.bottom || []).filter((e) => (e.score ?? 0) <= 0);
    const max = Math.max(1, ...entries.map((e) => Math.abs(e.score ?? 0)));

    return response.view("Karma.marko", {
      limit,
      view,
      views: [
        { label: "Top Karma", href: karmaHref(limit, "top"), current: view === "top" },
        { label: "Bottom Karma", href: karmaHref(limit, "bottom"), current: view === "bottom" },
      ],
      entries: entries.map((e, i) => {
        const score = e.score ?? 0;
        return {
          rank: i + 1,
          subject: e.subject || "",
          score: `${score >= 0 ? "+" : ""}${score}`,
          negative: score < 0,
          width: Math.max(Math.round((Math.abs(score) / max) * 100), 2),
          updated: e.lastUpdated || "",
          date: formatDate(e.lastUpdated),
        };
      }),
    }, { placeholders: { meta: title } });
  },
});
