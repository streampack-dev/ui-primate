import response from "primate/response";
import route from "primate/route";
import { send } from "#api/client.ts";
import { refusal } from "#auth/forms.ts";
import { csrfOk } from "#auth/readers.ts";
import { asReader, bearer, SignInRequired } from "#auth/signed-in.ts";
import { helper, tagList } from "#lib/drafting.ts";
import { admitted, AUDIO_DONE, categories, editorPage, formData, formOf, fromLocal, load, notFound, postedZone, type EditForm, type EditView } from "#lib/editor.ts";

const SIGN_IN = (id: string) => `/login?return=${encodeURIComponent(`/edit/${id}`)}`;

export default route({
  async get(request) {
    const id = admitted(request.path.get("id"));
    if (!id) return notFound();
    let post;
    try {
      post = await load(id);
    } catch (e) {
      if (e instanceof SignInRequired) return response.redirect(SIGN_IN(id), 303);
      throw e;
    }
    if (!post) return notFound();
    const status = request.query.try("approved") !== undefined ? "Approved and published."
      : request.query.try("saved") !== undefined ? "Saved." : undefined;
    // What the recording's form did (#33), said beside it.
    const done = AUDIO_DONE[request.query.try("audio") || ""];
    return editorPage(id, post, { form: formOf(post, await categories()), status, audio: done ? { status: done } : undefined });
  },

  async post(request) {
    const id = admitted(request.path.get("id"));
    if (!id) return notFound();
    const data = await formData(request);
    if (!csrfOk(data.one("csrf"))) return new Response("Forbidden", { status: 403 });
    let post;
    try {
      post = await load(id);
    } catch (e) {
      if (e instanceof SignInRequired) return response.redirect(SIGN_IN(id), 303);
      throw e;
    }
    if (!post) return notFound();
    const form: EditForm = {
      title: data.one("title"), slug: data.one("slug"), markdownSource: data.one("markdownSource"),
      summary: data.one("summary"), tags: data.one("tags"), categoryIds: data.all("categoryIds"),
      publishedAt: data.one("publishedAt"), publishedZone: postedZone(data.one("publishedZone")),
      sortOrder: data.one("sortOrder"), helper: data.one("helper"),
    };

    if (form.helper === "preview") return editorPage(id, post, { form });
    const helped = helper(form.helper, form, { ai: true, summary: true }, id);
    if (helped) {
      const result = await helped;
      if (result === "sign-in") return response.redirect(SIGN_IN(id), 303);
      return editorPage(id, post, { form, helper: result.which, said: result.said });
    }

    // Save.
    const published = form.publishedAt.trim();
    const publishedAt = published ? fromLocal(published, form.publishedZone) : null;
    const sortOrder = form.sortOrder.trim();
    const errors: EditView["errors"] = {};
    if (!form.title.trim()) errors.title = "Give the post a title.";
    if (!form.markdownSource.trim()) errors.markdownSource = "Write the post.";
    if (!form.slug.trim()) errors.slug = "Give the post an address.";
    if (published && !publishedAt) errors.publishedAt = "Give a date and time, or leave it empty.";
    if (sortOrder && !/^-?\d+$/.test(sortOrder)) errors.sortOrder = "A whole number, or leave it empty.";
    if (Object.keys(errors).length) return editorPage(id, post, { form, errors }, 400);

    const payload = {
      title: form.title.trim(),
      markdownSource: form.markdownSource,
      slug: form.slug.trim(),
      tags: tagList(form.tags),
      categoryIds: form.categoryIds.filter((c) => /^[0-9a-f-]{36}$/i.test(c)),
      summary: form.summary.trim() || null,
      publishedAt: publishedAt ? publishedAt.toISOString() : null,
      sortOrder: sortOrder ? Number(sortOrder) : null,
    };
    let answer: Response;
    try {
      answer = await asReader((a) => send("PUT", `/admin/posts/${id}`, payload, bearer(a)));
    } catch (e) {
      if (e instanceof SignInRequired) return response.redirect(SIGN_IN(id), 303);
      return editorPage(id, post, { form, notice: "The post couldn't be saved just now. Try again shortly; nothing you wrote is lost." }, 503);
    }
    if (!answer.ok) {
      const status = answer.status >= 500 ? 503 : 400;
      return editorPage(id, post, { form, notice: await refusal(answer, "The post wasn't saved. Check it and try again.") }, status);
    }
    return response.redirect(`/edit/${id}?saved`, 303);
  },
});
