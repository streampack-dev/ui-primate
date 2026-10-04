/* Editing a post, for admins, as ui-pudl's EditorController has it: every field, the admin's own
   (address, publish date, sort order), a preview rendered here, and the helpers the submit form
   has. It works without script: Preview and the helpers post the form and show it again, and
   Save sends it to the admin endpoint and comes back saying so. */
import { cachedGet, send } from "#api/client.ts";
import type { components } from "#api/schema.d.ts";
import type { ContentDetail, Features } from "#api/types.ts";
import { csrf, current, isAdmin } from "#auth/readers.ts";
import { asReader, bearer } from "#auth/signed-in.ts";
import { view } from "#lib/view.ts";
import { notFound } from "#lib/post-page.ts";
import { preview } from "#lib/preview.ts";

type Category = components["schemas"]["CategorySummary"];

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The editor's fields, as posted and as shown again. Dates are UTC, minutes, as the field says. */
export type EditForm = {
  title: string; slug: string; markdownSource: string; summary: string; tags: string;
  categoryIds: string[]; publishedAt: string; sortOrder: string; helper: string;
};

export type EditView = {
  form: EditForm;
  notice?: string;
  status?: string;
  errors?: Partial<Record<"title" | "markdownSource" | "slug" | "publishedAt" | "sortOrder", string>>;
  helper?: "tags" | "summary";
  said?: { text: string; ok: boolean };
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

const LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/** A datetime-local field's value, UTC, as a date; null for one that isn't. */
export function fromLocal(value: string): Date | null {
  if (!LOCAL.test(value)) return null;
  const date = new Date(`${value}:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export const toLocal = (iso: string | null | undefined) => (iso ? new Date(iso).toISOString().slice(0, 16) : "");

export function formOf(post: ContentDetail, all: { id: string; name: string }[]): EditForm {
  return {
    title: post.title || "",
    slug: post.slug || "",
    markdownSource: post.markdownSource || "",
    summary: post.excerpt || "",
    tags: (post.tags || []).join(", "),
    categoryIds: (post.categories || []).map((name) => all.find((c) => c.name === name)?.id).filter((id): id is string => !!id),
    publishedAt: toLocal(post.publishedAt),
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
    draft: post.status === "DRAFT",
    postHref: post.status === "APPROVED" && post.slug ? `/posts/${post.slug}` : null,
    ai: !!features?.ai,
    csrf: csrf(),
    meta: { title: `Edit: ${post.title || "post"}` },
  }, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

/** A posted form's fields, every value of a repeated one kept. Primate's body.form() and its
   request's formData() both keep only the last (primate-bugs/08), so the body is read as text. */
export async function formData(request: { original: Request }): Promise<{ one: (name: string) => string; all: (name: string) => string[] }> {
  const data = new URLSearchParams(await request.original.text());
  return { one: (name) => data.get(name) ?? "", all: (name) => data.getAll(name) };
}

export { notFound };
