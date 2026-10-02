import response from "primate/response";
import route from "primate/route";
import { send } from "#api/client.ts";
import { refusal } from "#auth/forms.ts";
import { csrfOk, current, signOut } from "#auth/readers.ts";
import { asReader, bearer, SignInRequired } from "#auth/signed-in.ts";
import { profilePage, SIGN_IN } from "#lib/profile.ts";

/* Deletes the reader's own account once they've typed their username. The API's `username` names
   the account to erase (admins may name others), so what's sent is always the reader's own
   username, never what was typed. */
export default route({
  async post(request) {
    const form = await request.body.form() as Record<string, string>;
    if (!csrfOk(form.csrf)) return new Response("Forbidden", { status: 403 });
    const reader = current();
    if (!reader) return response.redirect(SIGN_IN, 303);
    const typed = form.confirm || "";
    const refuse = (deleteError: string, status = 400) => profilePage({ deleteOpen: true, deleteError, confirmDraft: typed }, status);
    if (typed.trim() !== reader.username) return refuse(`That isn't your username. Type ${reader.username} to delete this account.`);

    let answer: Response;
    try {
      answer = await asReader((a) => send("DELETE", "/auth/account", { username: reader.username }, bearer(a)));
    } catch (e) {
      if (e instanceof SignInRequired) return response.redirect(SIGN_IN, 303);
      return refuse("The account couldn't be deleted just now. Try again shortly.", 503);
    }
    if (!answer.ok) return refuse(await refusal(answer, "The account wasn't deleted. Try again in a moment."), answer.status >= 500 ? 503 : 400);
    signOut();
    return response.redirect("/profile/deleted", 303);
  },
});
