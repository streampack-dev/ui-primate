/* The admin pages, as ui-nextjs has them (Site Management: the dashboard, pending drafts, users,
   categories), drawn here with plain forms. They're for admins; anyone else finds nothing there,
   as with the editor. */
import response from "primate/response";
import { csrf, current, isAdmin } from "#auth/readers.ts";
import { meta } from "#lib/meta.ts";
import { notFound } from "#lib/post-page.ts";

export const SECTIONS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/pending", label: "Pending" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/categories", label: "Categories" },
];

/** Whether the reader is an admin. */
export const admin = () => isAdmin(current());

/** [view] with [props], in the admin shell, [here] marked in its nav. Never kept by a cache. */
export function adminPage(view: string, props: Record<string, unknown>, title: string, here: string, status = 200) {
  return response.view(view, { ...props, csrf: csrf(), sections: SECTIONS.map((s) => ({ ...s, current: s.href === here })) }, {
    status,
    headers: { "Cache-Control": "private, no-store" },
    placeholders: { meta: meta({ title, robots: "noindex, nofollow" }) },
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
 * Runs an admin action [call] as the reader: on success, to [then]; refused, [refused] draws the
 * page again with the API's reason (a 400, or 503 when the API is down).
 */
export async function act(call: (access: string) => Promise<Response>, then: string, refused: (reason: string, status: number) => unknown, fallback: string) {
  const { asReader, SignInRequired } = await import("#auth/signed-in.ts");
  const { refusal } = await import("#auth/forms.ts");
  let answer: Response;
  try {
    answer = await asReader(call);
  } catch (e) {
    if (e instanceof SignInRequired) return response.redirect("/login?return=%2Fadmin", 303);
    return refused(`${fallback} The site couldn't be reached; try again shortly.`, 503);
  }
  if (answer.ok) return response.redirect(then, 303);
  return refused(await refusal(answer, fallback), answer.status >= 500 ? 503 : 400);
}

/** The confirmation page for an admin action. */
export function confirmPage(props: { title: string; body: string; action: string; button: string; back: string; fields?: Record<string, string>; onward?: { text: string; href: string }; tone?: "go" }) {
  return response.view("Confirm.marko", { fields: {}, ...props, csrf: csrf() }, {
    headers: { "Cache-Control": "private, no-store" },
    placeholders: { meta: meta({ title: props.title, robots: "noindex, nofollow" }) },
  });
}
