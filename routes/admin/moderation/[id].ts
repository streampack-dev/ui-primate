import route from "primate/route";
import { getAsReader } from "#auth/signed-in.ts";
import { admin, adminPage, notFound } from "#lib/admin.ts";
import { logHref, logZone } from "#lib/log-channels.ts";
import { clockIn } from "#lib/zone.ts";
import { channelFor, dayHref, doneSaying, ID, senderSearch, shownActions, shownLines, shownReport, type ReportDetail } from "#lib/moderation.ts";

/**
 * Report [id]'s page: the lines it's about, with their context, and what may be done about them;
 * [extra] says what was just done, or why it wasn't, and [checked] keeps a refused step's lines checked.
 */
export async function reportPage(id: string, extra: { said?: string; error?: string; checked?: string[]; note?: string } = {}, status = 200) {
  let detail: ReportDetail | null;
  try {
    detail = await getAsReader<ReportDetail>(`/admin/moderation/reports/${id}`);
  } catch {
    return adminPage("AdminModerationReport.marko", { failed: true, report: null, ...extra }, "Moderation", "/admin/moderation", 503);
  }
  if (!detail) return notFound();
  const report = shownReport(detail.report);
  const channel = await channelFor(detail.report.provenanceUri);
  // The lines' days are the log's zone's, as the API gives them (#36); so is the window's, without any.
  const zone = await logZone();
  const days = [...new Set(detail.lines.map((l) => l.day).filter(Boolean))].sort();
  if (days.length === 0) {
    const start = new Date(detail.report.windowStart);
    days.push(Number.isNaN(start.getTime()) ? detail.report.windowStart.slice(0, 10) : clockIn(start, zone).day);
  }

  return adminPage("AdminModerationReport.marko", {
    failed: false,
    report,
    open: detail.report.status === "OPEN",
    lines: shownLines(detail.lines, channel, zone),
    zone,
    purged: detail.purgedLineIds.length,
    actions: shownActions(detail.actions),
    days: days.map((day) => ({ day, admin: dayHref(channel.uri, day), public: logHref(channel, day) })),
    senderLines: senderSearch(channel, detail.report.sender),
    ...extra,
  }, `Report on ${report.sender}`, "/admin/moderation", status);
}

export default route({
  get(request) {
    const id = request.path.get("id");
    if (!admin() || !ID.test(id)) return notFound();
    return reportPage(id, { said: doneSaying(request.query.try("done"), request.query.try("n")) });
  },
});
