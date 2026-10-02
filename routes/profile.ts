import response from "primate/response";
import route from "primate/route";
import { send } from "#api/client.ts";
import { refusal } from "#auth/forms.ts";
import { csrfOk, current, rename } from "#auth/readers.ts";
import { asReader, bearer, SignInRequired } from "#auth/signed-in.ts";
import { profilePage, SIGN_IN } from "#lib/profile.ts";

/* The reader's own account, as ui-pudl has it: who they are, their display name to change, their
   data to export (routes/profile/export.ts), and their account to delete (routes/profile/delete.ts).
   Plain forms; no script needed. */
export default route({
  get(request) {
    if (!current()) return response.redirect(SIGN_IN, 303);
    const saved = request.query.try("saved");
    return profilePage({
      status: saved === "1" ? "Saved." : saved === "0" ? "Nothing changed." : undefined,
      deleteOpen: request.query.try("delete") !== undefined,
    });
  },

  /* The display name, sent only when it changed: the API keeps any field it isn't sent. */
  async post(request) {
    const form = await request.body.form() as Record<string, string>;
    if (!csrfOk(form.csrf)) return new Response("Forbidden", { status: 403 });
    const reader = current();
    if (!reader) return response.redirect(SIGN_IN, 303);
    const name = (form.displayName || "").trim();
    if (!name) return profilePage({ nameError: "Your display name can't be blank.", nameDraft: "" }, 400);
    if (name === reader.displayName) return response.redirect("/profile?saved=0", 303);

    let answer: Response;
    try {
      answer = await asReader((a) => send("PUT", "/auth/profile", { displayName: name }, bearer(a)));
    } catch (e) {
      if (e instanceof SignInRequired) return response.redirect(SIGN_IN, 303);
      return profilePage({ nameError: "Your name couldn't be saved just now. Try again shortly.", nameDraft: name }, 503);
    }
    if (!answer.ok) {
      const status = answer.status >= 500 ? 503 : 400;
      return profilePage({ nameError: await refusal(answer, "That name wasn't accepted."), nameDraft: name }, status);
    }
    const principal = await answer.json().catch(() => null) as { displayName?: string } | null;
    rename(principal?.displayName?.trim() || name);
    return response.redirect("/profile?saved=1", 303);
  },
});
