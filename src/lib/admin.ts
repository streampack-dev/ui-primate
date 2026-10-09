/* The admin pages, as ui-nextjs has them (Site Management: the dashboard, pending drafts, users,
   categories), drawn here with plain forms. They're for admins; anyone else finds nothing there,
   as with the editor. */
import response from "primate/response";
import { csrf, current, isAdmin } from "#auth/readers.ts";
import { view } from "#lib/view.ts";
import { notFound } from "#lib/post-page.ts";

export const SECTIONS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/pending", label: "Pending" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/categories", label: "Categories" },
  { href: "/admin/moderation", label: "Moderation" },
  { href: "/admin/tags", label: "Tags" },
];

/** How a section's count is said to a screen reader. */
const COUNTED: Record<string, (n: number) => string> = {
  "/admin/moderation": (n) => `${n} open`,
  "/admin/tags": (n) => `${n} to decide`,
};

/** How many moderation reports are open, for the nav; null when it can't be said. */
async function openReports(): Promise<number | null> {
  try {
    const { getAsReader } = await import("#auth/signed-in.ts");
    const list = await getAsReader<{ openCount?: number }>("/admin/moderation/reports", { status: "open", page: 0, size: 1 });
    return typeof list?.openCount === "number" ? list.openCount : null;
  } catch {
    return null;
  }
}

/** Open tag review entries and waiting feed tags, for the nav; null when neither can be said. */
async function tagsWaiting(): Promise<number | null> {
  try {
    const { attention, counts } = await import("#lib/tags-admin.ts");
    return attention(await counts());
  } catch {
    return null;
  }
}

/** Whether the reader is an admin. */
export const admin = () => isAdmin(current());

/**
 * [name] with [props], in the admin shell, [here] marked in its nav, with the open moderation
 * reports counted there ([open] when the page knows it already), and the tags waiting for a
 * decision ([tags], likewise). Never kept by a cache.
 */
export async function adminPage(name: string, props: Record<string, unknown>, title: string, here: string, status = 200, open?: number | null, tags?: number | null) {
  const [reports, waiting] = await Promise.all([open === undefined ? openReports() : open, tags === undefined ? tagsWaiting() : tags]);
  const counts: Record<string, number | null> = { "/admin/moderation": reports, "/admin/tags": waiting };
  const sections = SECTIONS.map((s) => {
    const count = counts[s.href] || null;
    return { ...s, current: s.href === here, count, countLabel: count ? COUNTED[s.href](count) : null };
  });
  return view(name, { ...props, csrf: csrf(), sections, meta: { title, robots: "noindex, nofollow" } }, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export { notFound };

/** A username as the API's addresses take it; anything else names no one. */
export const USERNAME = /^[A-Za-z0-9._-]{1,64}$/;

/** What a list says after an action, by the fixed code it was sent back with (never words from the address). */
export function doneSaying(done: string | undefined, who: string | undefined, words: Record<string, (who: string) => string>): string | undefined {
  const say = done ? words[done] : undefined;
  return say ? say(who && USERNAME.test(who) ? who : "") : undefined;
}

/**
 * Runs an admin action [call] as the reader: on success, to [then] (or where it says, given the
 * answer); refused, [refused] draws the
 * page again with the API's reason (a 400, or 503 when the API is down).
 */
export async function act(call: (access: string) => Promise<Response>, then: string | ((answer: Response) => Promise<string>), refused: (reason: string, status: number) => unknown, fallback: string) {
  const { asReader, SignInRequired } = await import("#auth/signed-in.ts");
  const { refusal } = await import("#auth/forms.ts");
  let answer: Response;
  try {
    answer = await asReader(call);
  } catch (e) {
    if (e instanceof SignInRequired) return response.redirect("/login?return=%2Fadmin", 303);
    return refused(`${fallback} The site couldn't be reached; try again shortly.`, 503);
  }
  if (answer.ok) return response.redirect(typeof then === "string" ? then : await then(answer), 303);
  return refused(await refusal(answer, fallback), answer.status >= 500 ? 503 : 400);
}

/** The confirmation page for an admin action. */
export function confirmPage(props: { title: string; body: string; action: string; button: string; back: string; fields?: Record<string, string>; onward?: { text: string; href: string }; tone?: "go" }) {
  return view("Confirm.marko", { fields: {}, ...props, csrf: csrf(), meta: { title: props.title, robots: "noindex, nofollow" } }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
