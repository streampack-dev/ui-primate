import response from "primate/response";
import route from "primate/route";
import { cachedGet, send } from "#api/client.ts";
import type { components } from "#api/schema.d.ts";
import type { Features } from "#api/types.ts";
import { refusal } from "#auth/forms.ts";
import { csrf, csrfOk, current, isAdmin } from "#auth/readers.ts";
import { asReader, bearer, SignInRequired } from "#auth/signed-in.ts";
import { meta } from "#lib/meta.ts";

type Category = components["schemas"]["CategorySummary"];

/* Submitting a post for review, as ui-pudl does it: a plain form that works without script. The
   post is a draft until an editor approves it.

   The helpers are buttons that post the form and show it again filled in, never submitting:
   Suggest tags (anyone), Derive summary (signed in), AI tags (admins, when the API has AI).

   Spam: the form carries formLoadedAt, the time it was shown, which the API checks, and a
   `website` trap no person fills in. A filled trap is thanked like a post and nothing is sent. */

type Form = {
  title: string; markdownSource: string; tags: string; summary: string; categoryId: string;
  formLoadedAt: string; website: string; action: string;
};
type Helper = "tags" | "summary";
type Shown = {
  form: Form; status?: number; errors?: Partial<Record<"title" | "markdownSource", string>>;
  notice?: string; helper?: Helper; said?: { text: string; ok: boolean };
};

const UNSAVED = "00000000-0000-0000-0000-000000000000";
// The API's AI takes its time (ui-pudl's derive-summary timeout).
const AI = { timeoutMs: 60_000 };
const SIGN_IN = "/login?return=%2Fsubmit";

/** The tags as a list: comma-separated, trimmed, without repeats (ignoring case). */
function tagList(tags: string): string[] {
  const seen = new Set<string>();
  return tags.split(",").map((t) => t.trim()).filter((t) => t && !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()));
}

async function features(): Promise<Features | null> {
  try {
    return await cachedGet<Features>("/features");
  } catch {
    return null;
  }
}

/** Categories a post may be filed under: the site's own (_sidebar, _pages) aren't. */
async function categories(): Promise<{ id: string; name: string }[]> {
  try {
    const all = await cachedGet<Category[]>("/categories") || [];
    return all.filter((c) => c.id && c.name && !c.name.startsWith("_")).map((c) => ({ id: c.id!, name: c.name! }));
  } catch {
    return [];
  }
}

/** What this reader may use: whether they may submit at all, and the helpers beyond Suggest tags. */
async function allowed() {
  const reader = current();
  const f = await features();
  return { submit: !!reader || f?.anonymousSubmission !== false, summary: !!reader, ai: isAdmin(reader) && !!f?.ai };
}

async function page(shown: Shown) {
  const may = await allowed();
  return response.view("Submit.marko", {
    ...shown,
    errors: shown.errors || {},
    categories: await categories(),
    signedIn: may.summary,
    ai: may.ai,
    csrf: csrf(),
  }, {
    status: shown.status ?? 200,
    // formLoadedAt is this render's time, so the page is never kept.
    headers: { "Cache-Control": "private, no-store" },
    placeholders: { meta: meta({ title: "Submit a post", path: "/submit" }) },
  });
}

const blank = (): Form => ({ title: "", markdownSource: "", tags: "", summary: "", categoryId: "", formLoadedAt: String(Date.now()), website: "", action: "" });

/** Runs a helper that fills in part of the form; what it says, or the API's refusal, shows beside it. */
async function helper(form: Form, which: Helper, fallback: string, fill: () => Promise<Response>, use: (body: any) => string) {
  try {
    const answer = await fill();
    if (!answer.ok) return page({ form, helper: which, said: { text: await refusal(answer, fallback), ok: false } });
    return page({ form, helper: which, said: { text: use(await answer.json()), ok: true } });
  } catch (e) {
    if (e instanceof SignInRequired) return response.redirect(SIGN_IN, 303);
    return page({ form, helper: which, said: { text: fallback, ok: false } });
  }
}

function addTags(form: Form, more: unknown): string {
  const tags = Array.isArray(more) ? more.map(String) : [];
  form.tags = tagList([...tagList(form.tags), ...tags].join(",")).join(", ");
  return tags.length ? "Suggested tags added. Remove any that don't fit." : "No tags could be suggested from the text yet.";
}

export default route({
  async get() {
    if (!(await allowed()).submit) return response.redirect(SIGN_IN, 303);
    return page({ form: blank() });
  },

  async post(request) {
    const posted = await request.body.form() as Record<string, string>;
    if (!csrfOk(posted.csrf)) return new Response("Forbidden", { status: 403 });
    const may = await allowed();
    if (!may.submit) return response.redirect(SIGN_IN, 303);
    const form: Form = { ...blank(), ...Object.fromEntries(Object.entries(posted).filter(([k]) => k in blank())) };
    const draft = { title: form.title, markdownSource: form.markdownSource, existingTags: tagList(form.tags) };

    switch (form.action) {
      case "suggest-tags":
        return helper(form, "tags", "Tags couldn't be suggested just now.",
          () => send("POST", "/posts/derive-tags", draft), (body) => addTags(form, body?.tags));
      case "ai-tags":
        if (!may.ai) return page({ form });
        return helper(form, "tags", "AI tags couldn't be suggested just now.",
          () => asReader((a) => send("POST", `/admin/posts/${UNSAVED}/derive-tags`, draft, bearer(a), AI)),
          (body) => addTags(form, body?.tags).replace("Suggested", "AI"));
      case "derive-summary":
        if (!may.summary) return page({ form });
        return helper(form, "summary", "A summary couldn't be derived just now.",
          () => asReader((a) => send("POST", "/posts/derive-summary", { title: form.title, markdownSource: form.markdownSource }, bearer(a), AI)),
          (body) => {
            const summary = typeof body?.summary === "string" ? body.summary.trim() : "";
            if (!summary) return "No summary could be derived from the text yet.";
            form.summary = summary;
            return "Summary derived. Edit it as you like.";
          });
    }

    if (form.website.trim()) return response.redirect("/submit/thanks", 303);
    const errors: Shown["errors"] = {};
    if (!form.title.trim()) errors.title = "Give the post a title.";
    if (!form.markdownSource.trim()) errors.markdownSource = "Write the post.";
    if (Object.keys(errors).length) return page({ form, errors, status: 400 });

    const tags = tagList(form.tags);
    const category = /^[0-9a-f-]{36}$/i.test(form.categoryId) ? form.categoryId : null;
    const summary = may.summary ? form.summary.trim() : "";
    const payload = {
      title: form.title.trim(),
      markdownSource: form.markdownSource,
      formLoadedAt: Number(form.formLoadedAt) || null,
      ...(tags.length ? { tags } : {}),
      ...(category ? { categoryIds: [category] } : {}),
      ...(summary ? { summary } : {}),
    };
    let answer: Response;
    try {
      // A signed-in reader submits as themselves; anyone else, anonymously.
      answer = current()
        ? await asReader((a) => send("POST", "/posts", payload, bearer(a)))
        : await send("POST", "/posts", payload);
    } catch (e) {
      if (e instanceof SignInRequired) return response.redirect(SIGN_IN, 303);
      answer = new Response(null, { status: 503 });
    }
    if (answer.ok) return response.redirect("/submit/thanks", 303);
    if (answer.status >= 500) return page({ form, status: 503, notice: "Your post couldn't be sent just now. Try again shortly; nothing you wrote is lost." });
    return page({ form, status: 400, notice: await refusal(answer, "The post wasn't accepted. Check it and try again.") });
  },
});
