import response from "primate/response";
import route from "primate/route";
import { send } from "#api/client.ts";
import { current } from "#auth/readers.ts";
import { asReader, bearer, SignInRequired } from "#auth/signed-in.ts";
import { profilePage, SIGN_IN } from "#lib/profile.ts";

/* The API's export of the reader's data, passed through untouched as a download. */
export default route({
  async get() {
    const reader = current();
    if (!reader) return response.redirect(SIGN_IN, 303);
    let answer: Response;
    try {
      answer = await asReader((a) => send("GET", "/auth/export", undefined, bearer(a)));
    } catch (e) {
      if (e instanceof SignInRequired) return response.redirect(SIGN_IN, 303);
      answer = new Response(null, { status: 503 });
    }
    if (!answer.ok) return profilePage({ exportError: "Your data couldn't be exported just now. Try again shortly." }, 503);
    const name = reader.username.replace(/[^A-Za-z0-9._-]/g, "_") || "account";
    return new Response(await answer.arrayBuffer(), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="bytecode-news-${name}.json"`,
        "Cache-Control": "private, no-store",
      },
    });
  },
});
