/* The questions asked before an alias, a split or a new alias: what each says, its fields, and its
   preview, from the API's dry run. Confirm names what was checked: "Alias to “compilers”". */
import { getAsReader } from "#auth/signed-in.ts";
import { aliasTarget, backField, both, dryRun, href, parts, q, splitParts, type At, type Preview, type ReviewEntry } from "#lib/tags-admin.ts";
import { askPage } from "#lib/tags-pages.ts";

export type ReviewAction = "alias" | "split";
export const ASKED = ["alias", "split"] as const;
export const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const reviewPath = (id: string, action: ReviewAction) => `/admin/tags/review/${id}/${action}`;

/** The open review entry [id]; null if there's none, or it's decided and so has nothing to ask. */
export async function openEntry(id: string): Promise<ReviewEntry | null> {
  const entry = await getAsReader<ReviewEntry>(`/admin/tags/review/${id}`);
  return entry && entry.status === "OPEN" ? entry : null;
}

/** What [action] on review entry [id] would do with [value] (the tag, or the parts), and Confirm's words. */
export async function reviewPreview(id: string, action: ReviewAction, value: string): Promise<Preview & { button: string }> {
  if (action === "alias") {
    const tag = value.trim();
    if (!tag) return { ok: false, text: "Name the tag to alias it to.", button: "Alias" };
    return { ...(await dryRun(reviewPath(id, action), { tag })), button: `Alias to ${q(tag)}` };
  }
  const list = parts(value);
  if (list.length < 2) return { ok: false, text: "Name at least two parts, separated by commas.", button: "Split" };
  return { ...(await dryRun(reviewPath(id, action), { parts: list })), button: `Split into ${both(list)}` };
}

/** [action]'s question for [entry], its field at [value] (prefilled when undefined), previewed. */
export async function reviewQuestion(entry: ReviewEntry, action: ReviewAction, value: string | undefined, back: At, extra: { error?: string } = {}, status = 200) {
  const backQuery = backField(back);
  const hidden = backQuery ? { back: backQuery } : {};
  const t = q(entry.tag);
  const shown = value ?? (action === "alias" ? aliasTarget(entry) : splitParts(entry).join(", "));
  const preview = await reviewPreview(entry.id, action, shown);
  const path = reviewPath(entry.id, action);
  const common = { check: path, previewUrl: `${path}/preview`, action: path, back: href(back), hidden, preview, button: preview.button, ...extra };
  return action === "alias"
    ? askPage({
      ...common,
      title: `Alias ${t} to another tag?`,
      body: `Every post and factoid tagged ${t} is re-pointed to the tag you name, and ${t} becomes its alias: writing it finds that tag from then on.`,
      fields: [{ name: "tag", label: "Alias to", value: shown, help: "An existing tag.", suggest: true }],
    }, status)
    : askPage({
      ...common,
      title: `Split ${t} into its parts?`,
      body: `Every post and factoid tagged ${t} carries the parts instead, and ${t} goes.`,
      fields: [{ name: "parts", label: "Parts", value: shown, help: "Separate the parts with commas; at least two." }],
    }, status);
}

/** What making [alias] an alias of [tag] would do, and Confirm's words. */
export async function aliasPreview(alias: string, tag: string): Promise<Preview & { button: string }> {
  const a = alias.trim();
  const t = tag.trim();
  if (!a || !t) return { ok: false, text: "Name both the alias and the tag it means.", button: "Add alias" };
  return { ...(await dryRun("/admin/tags/aliases", { alias: a, tag: t })), button: `Make ${q(a)} an alias of ${q(t)}` };
}

/** The new alias's question, its fields as given; previewed once anything's named. */
export async function aliasQuestion(alias: string | undefined, tag: string | undefined, extra: { error?: string } = {}, status = 200) {
  const named = alias !== undefined || tag !== undefined;
  const preview = named ? await aliasPreview(alias ?? "", tag ?? "") : null;
  return askPage({
    title: "Add an alias",
    body: "Whatever already carries the alias is re-pointed to the tag it means, and writing the alias stores that tag from then on.",
    check: "/admin/tags/aliases/new",
    previewUrl: "/admin/tags/aliases/preview",
    action: "/admin/tags/aliases",
    back: "/admin/tags/aliases",
    button: preview?.button ?? "Add alias",
    fields: [
      { name: "alias", label: "Alias", value: (alias ?? "").trim(), help: "The name to fold away, such as k8s." },
      { name: "tag", label: "Means", value: (tag ?? "").trim(), help: "An existing tag.", suggest: true },
    ],
    preview,
    ...extra,
  }, status);
}
