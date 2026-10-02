/* The helpers a post's form has, on /submit and in the editor, as ui-nextjs and ui-pudl have them:
   Suggest tags (anyone, heuristic), AI tags (admins, when the API has AI), Derive summary (signed
   in). Each fills in part of the draft and says so beside its button; none submits. */
import { send } from "#api/client.ts";
import { refusal } from "#auth/forms.ts";
import { asReader, bearer, SignInRequired } from "#auth/signed-in.ts";

/** The id the AI tag endpoint is given for a post that isn't saved yet, as ui-nextjs and ui-pudl send. */
export const UNSAVED = "00000000-0000-0000-0000-000000000000";
// The API's AI takes its time (ui-pudl's derive-summary timeout).
const AI = { timeoutMs: 60_000 };

export type Draft = { title: string; markdownSource: string; tags: string; summary: string };
export type Said = { text: string; ok: boolean };
export type Helped = { which: "tags" | "summary"; said: Said } | "sign-in";

/** The tags as a list: comma-separated, trimmed, without repeats (ignoring case). */
export function tagList(tags: string): string[] {
  const seen = new Set<string>();
  return tags.split(",").map((t) => t.trim()).filter((t) => t && !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()));
}

function addTags(draft: Draft, more: unknown, kind: string): string {
  const tags = Array.isArray(more) ? more.map(String) : [];
  draft.tags = tagList([...tagList(draft.tags), ...tags].join(",")).join(", ");
  return tags.length ? `${kind} tags added. Remove any that don't fit.` : "No tags could be suggested from the text yet.";
}

async function run(which: "tags" | "summary", fallback: string, call: () => Promise<Response>, use: (body: any) => string): Promise<Helped> {
  try {
    const answer = await call();
    if (!answer.ok) return { which, said: { text: await refusal(answer, fallback), ok: false } };
    return { which, said: { text: use(await answer.json()), ok: true } };
  } catch (e) {
    if (e instanceof SignInRequired) return "sign-in";
    return { which, said: { text: fallback, ok: false } };
  }
}

/**
 * Runs the helper [action] names on [draft], filling it in; null for an action that isn't a helper,
 * or one this reader may not use. [postId] is the post's, or UNSAVED.
 */
export function helper(action: string, draft: Draft, may: { ai: boolean; summary: boolean }, postId = UNSAVED): Promise<Helped> | null {
  const asked = { title: draft.title, markdownSource: draft.markdownSource, existingTags: tagList(draft.tags) };
  switch (action) {
    case "suggest-tags":
      return run("tags", "Tags couldn't be suggested just now.",
        () => send("POST", "/posts/derive-tags", asked), (body) => addTags(draft, body?.tags, "Suggested"));
    case "ai-tags":
      if (!may.ai) return null;
      return run("tags", "AI tags couldn't be suggested just now.",
        () => asReader((a) => send("POST", `/admin/posts/${postId}/derive-tags`, asked, bearer(a), AI)),
        (body) => addTags(draft, body?.tags, "AI"));
    case "derive-summary":
      if (!may.summary) return null;
      return run("summary", "A summary couldn't be derived just now.",
        () => asReader((a) => send("POST", "/posts/derive-summary", { title: draft.title, markdownSource: draft.markdownSource }, bearer(a), AI)),
        (body) => {
          const summary = typeof body?.summary === "string" ? body.summary.trim() : "";
          if (!summary) return "No summary could be derived from the text yet.";
          draft.summary = summary;
          return "Summary derived. Edit it as you like.";
        });
    default:
      return null;
  }
}
