/* The tag vocabulary's pages (#lib/tags-admin.ts): each section's list, and the questions asked
   before an alias, a split or a new alias, each previewed by the API's dry run. */
import { csrf } from "#auth/readers.ts";
import response from "primate/response";
import { getAsReader, SignInRequired } from "#auth/signed-in.ts";
import { adminPage } from "#lib/admin.ts";
import {
  aliasRow, attention, backField, countLabel, counts, emptyText, feedRow, HISTORY, historyRow, href, pageLabel, reviewRow,
  SECTIONS, SIZE, stopRow, vocabulary, type ActionEntry, type AliasEntry, type At, type FeedTagList, type Preview,
  type ReviewList, type Section, type StopEntry,
} from "#lib/tags-admin.ts";
import { view } from "#lib/view.ts";

const filterLabel = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The list at [where], with [extra] (what was just done, or why it wasn't); [status] for a refusal. */
export async function tagsPage(where: At, extra: { said?: string; error?: string; term?: string } = {}, status = 200) {
  let failed = false;
  let review: ReturnType<typeof reviewRow>[] = [];
  let feed: ReturnType<typeof feedRow>[] = [];
  let aliases: ReturnType<typeof aliasRow>[] = [];
  let stops: ReturnType<typeof stopRow>[] = [];
  let history: ReturnType<typeof historyRow>[] = [];
  let totalPages: number | null = null;
  let totalCount: number | null = null;
  let known: { open?: number | null; waiting?: number | null } = {};
  const back = backField(where);

  try {
    if (where.section === "review") {
      const list = await getAsReader<ReviewList>("/admin/tags/review", { status: where.status!, page: where.page, size: SIZE });
      review = (list?.entries || []).map((e) => reviewRow(e, back));
      totalPages = list?.totalPages ?? null;
      totalCount = list?.totalCount ?? null;
      known = { open: list?.openCount ?? null };
    } else if (where.section === "feed") {
      const list = await getAsReader<FeedTagList>("/admin/rss/tags", { status: where.status!, page: where.page, size: SIZE });
      feed = (list?.tags || []).map((t) => feedRow(t, list!.promoteEntries, list!.promoteFeeds));
      totalPages = list?.totalPages ?? null;
      totalCount = list?.totalCount ?? null;
      known = { waiting: list?.waitingCount ?? null };
    } else if (where.section === "aliases") {
      aliases = ((await getAsReader<AliasEntry[]>("/admin/tags/aliases")) || []).map(aliasRow);
    } else if (where.section === "stoplist") {
      stops = ((await getAsReader<StopEntry[]>("/admin/tags/stoplist")) || []).map(stopRow);
    } else {
      history = ((await getAsReader<ActionEntry[]>("/admin/tags/actions", { limit: HISTORY })) || []).map(historyRow);
    }
  } catch {
    failed = true;
  }

  // The other count, or both, asked for only when the list didn't say.
  const { open, waiting } = await counts(known);

  const statuses = SECTIONS[where.section].statuses as readonly string[];
  const offers = (where.section === "review" && review.some((r) => r.open)) || (where.section === "feed" && feed.some((t) => t.waiting)) || where.section === "aliases";
  const pages = totalPages;
  const next = pages !== null ? where.page + 1 < pages : (review.length || feed.length) >= SIZE;

  return adminPage("AdminTags.marko", {
    section: where.section,
    tabs: (Object.keys(SECTIONS) as Section[]).map((s) => {
      const count = s === "review" ? open : s === "feed" ? waiting : null;
      return {
        label: SECTIONS[s].label, href: SECTIONS[s].href, current: s === where.section,
        count: count || null, countLabel: count ? `${count} ${s === "review" ? "open" : "waiting"}` : "",
      };
    }),
    filters: statuses.map((s) => ({ label: filterLabel(s), href: href({ ...where, status: s, page: 0 }), current: s === where.status })),
    back,
    failed,
    empty: emptyText(where),
    review, feed, aliases, stops, history,
    vocabulary: offers && !failed ? await vocabulary() : [],
    pageLabel: pageLabel(where, totalPages),
    countLabel: countLabel(where, totalCount),
    prev: where.page > 0 ? href({ ...where, page: where.page - 1 }) : null,
    next: next ? href({ ...where, page: where.page + 1 }) : null,
    ...extra,
  }, `Tags: ${SECTIONS[where.section].label}`, "/admin/tags", status, undefined, attention({ open, waiting }));
}

/** A field of a question: its name, label, value, help, and whether the vocabulary is suggested. */
export type AskField = { name: string; label: string; value: string; help: string; suggest?: boolean };

/**
 * A question asked before an alias, a split or a new alias, on a page of its own: the fields as last
 * checked ([check], a GET form, without script), what they would do ([preview], from the API's dry
 * run), and Confirm, carrying the checked values to [action], shown only when it can be done.
 * [previewUrl] answers the same preview as JSON, for client/tag-ask.ts to ask as the admin types.
 */
export async function askPage(props: {
  title: string; body: string; check: string; previewUrl: string; action: string; button: string; back: string;
  fields: AskField[]; hidden?: Record<string, string>; preview: Preview | null; error?: string;
}, status = 200) {
  const suggest = props.fields.some((f) => f.suggest);
  return view("AdminTagAsk.marko", {
    hidden: {},
    ...props,
    vocabulary: suggest ? await vocabulary() : [],
    csrf: csrf(),
    meta: { title: props.title, robots: "noindex, nofollow" },
  }, { status, headers: { "Cache-Control": "private, no-store" } });
}

/** [page], or, if the admin must sign in again first, the way there and back to [back]. */
export async function signedIn(back: string, page: () => Promise<unknown>) {
  try {
    return await page();
  } catch (e) {
    if (e instanceof SignInRequired) return response.redirect(`/login?return=${encodeURIComponent(back)}`, 303);
    throw e;
  }
}

/** A preview as JSON, for client/tag-ask.ts: whether it can be done, what it would do, and Confirm's words. */
export async function previewJson(said: () => Promise<Preview & { button: string }>) {
  let body: Preview & { button: string };
  try {
    body = await said();
  } catch (e) {
    if (!(e instanceof SignInRequired)) throw e;
    body = { ok: false, text: "Sign in again to see what this would do.", button: "" };
  }
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" } });
}
