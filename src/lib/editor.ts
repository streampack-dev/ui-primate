/* Editing a post, for admins, as ui-pudl's EditorController has it: every field, the admin's own
   (address, publish date, sort order), a preview rendered here, and the helpers the submit form
   has. It works without script: Preview and the helpers post the form and show it again, and
   Save sends it to the admin endpoint and comes back saying so. */
import { cachedGet, send } from "#api/client.ts";
import type { components } from "#api/schema.d.ts";
import type { ContentDetail, Features } from "#api/types.ts";
import { csrf, current, isAdmin } from "#auth/readers.ts";
import { asReader, bearer } from "#auth/signed-in.ts";
import { audioOf, MAX_BYTES, MAX_LABEL } from "#lib/audio.ts";
import { view } from "#lib/view.ts";
import { notFound } from "#lib/post-page.ts";
import { preview } from "#lib/preview.ts";
import { fromZoned, readerZone, toZoned, validZone } from "#lib/zone.ts";

type Category = components["schemas"]["CategorySummary"];

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The editor's fields, as posted and as shown again. The publish date is to the minute on
 * [publishedZone]'s clock, the reader's (src/lib/zone.ts); the API is given it in UTC.
 */
export type EditForm = {
  title: string; slug: string; markdownSource: string; summary: string; tags: string;
  categoryIds: string[]; publishedAt: string; publishedZone: string; sortOrder: string; helper: string;
};

export type EditView = {
  form: EditForm;
  notice?: string;
  status?: string;
  errors?: Partial<Record<"title" | "markdownSource" | "slug" | "publishedAt" | "sortOrder", string>>;
  helper?: "tags" | "summary";
  said?: { text: string; ok: boolean };
  /** What the recording's form did, or why it didn't (#33), said beside it. */
  audio?: { status?: string; notice?: string };
};

/** What the recording's form did, by the code its redirect carries (?audio=). */
export const AUDIO_DONE: Record<string, string> = {
  attached: "Recording uploaded. The post now has a player, and is in the podcast feed.",
  replaced: "Recording replaced.",
  removed: "Recording removed.",
};

/** The post's id, for an admin; null for anyone else, or an address that isn't a post. */
export function admitted(id: string): string | null {
  return isAdmin(current()) && UUID.test(id) ? id : null;
}

/** The post as the admin sees it (drafts too); null when the API hasn't got it. Throws when it can't be had. */
export async function load(id: string): Promise<ContentDetail | null> {
  const answer = await asReader((a) => send("GET", `/posts/${id}`, undefined, bearer(a)));
  if (answer.status === 404) return null;
  if (!answer.ok) throw new Error(`/posts/${id}: ${answer.status}`);
  return await answer.json() as ContentDetail;
}

/** Every category, the site's own too: admins file pages under them. */
export async function categories(): Promise<{ id: string; name: string }[]> {
  try {
    return ((await cachedGet<Category[]>("/categories")) || []).filter((c) => c.id && c.name).map((c) => ({ id: c.id!, name: c.name! }));
  } catch {
    return [];
  }
}

/** A datetime-local field's value, on [zone]'s clock, as a date; null for one that isn't. */
export const fromLocal = (value: string, zone: string): Date | null => fromZoned(value, zone);

/** [iso] as a datetime-local field's value on [zone]'s clock. */
export const toLocal = (iso: string | null | undefined, zone: string) => toZoned(iso, zone);

/** The zone a posted date field was read in: the one it says, if it's a zone, else the reader's. */
export const postedZone = (said: string) => validZone(said) ?? readerZone();

/** A date field's props for the view: its value, the zone it's in, and the instant it names. */
export function dateField(value: string, zone: string) {
  return { value, zone, instant: fromZoned(value.trim(), zone)?.toISOString() ?? "" };
}

export function formOf(post: ContentDetail, all: { id: string; name: string }[]): EditForm {
  return {
    title: post.title || "",
    slug: post.slug || "",
    markdownSource: post.markdownSource || "",
    summary: post.excerpt || "",
    tags: (post.tags || []).join(", "),
    categoryIds: (post.categories || []).map((name) => all.find((c) => c.name === name)?.id).filter((id): id is string => !!id),
    publishedAt: toLocal(post.publishedAt, readerZone()),
    publishedZone: readerZone(),
    sortOrder: post.sortOrder === undefined || post.sortOrder === null ? "" : String(post.sortOrder),
    helper: "",
  };
}

/** The editor page for post [id] with [shown]. */
export async function editorPage(id: string, post: ContentDetail, shown: EditView, status = 200) {
  const features = await cachedGet<Features>("/features").catch(() => null);
  return view("Editor.marko", {
    id,
    ...shown,
    errors: shown.errors || {},
    categories: await categories(),
    preview: preview(shown.form.markdownSource),
    published: dateField(shown.form.publishedAt, shown.form.publishedZone),
    draft: post.status === "DRAFT",
    recording: audioOf(post.versions),
    recordingSaid: shown.audio || {},
    maxBytes: MAX_BYTES,
    maxLabel: MAX_LABEL,
    postHref: post.status === "APPROVED" && post.slug ? `/posts/${post.slug}` : null,
    ai: !!features?.ai,
    csrf: csrf(),
    meta: { title: `Edit: ${post.title || "post"}` },
  }, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

/** A posted form's fields, every value of a repeated one kept: Primate's body.formEntries()
   (primate-bugs/08, primate#116), where body.form() keeps only the last. */
export async function formData(request: { body: { formEntries(): Promise<[string, string][]> } }): Promise<{ one: (name: string) => string; all: (name: string) => string[] }> {
  const entries = await request.body.formEntries();
  const all = (name: string) => entries.filter(([key]) => key === name).map(([, value]) => value);
  return { one: (name) => all(name)[0] ?? "", all };
}

export { notFound };
