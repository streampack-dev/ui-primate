import response from "primate/response";
import route from "primate/route";
import { cachedGet, send } from "#api/client.ts";
import type { Features } from "#api/types.ts";
import type { components } from "#api/schema.d.ts";
import { csrf, csrfOk, pendingEmail, signIn } from "#auth/readers.ts";
import { refreshCookie, refusal, safeReturn } from "#auth/forms.ts";
import { view } from "#lib/view.ts";

type LoginResponse = components["schemas"]["LoginResponse"];

/* Signing in, as ui-pudl does it: an email address (routes/login/code.ts has the API send a code
   to it), then the code. Plain forms; no script needed. */
export async function loginPage(step: "email" | "code", fields: { email?: string; back: string; error?: string }, status = 200) {
  // The address the codes come from, as the API says, so a reader knows what to look for.
  const features = await cachedGet<Features>("/features").catch(() => null);
  const from = features?.authentication?.otpFrom?.trim() || "";
  return view("Login.marko", { step, ...fields, from, csrf: csrf(), meta: { title: "Log in" } }, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export default route({
  get(request) {
    const back = safeReturn(request.query.try("return"));
    const email = pendingEmail();
    return request.query.try("step") === "code" && email ? loginPage("code", { email, back }) : loginPage("email", { back });
  },

  async post(request) {
    const form = await request.body.form() as Record<string, string>;
    if (!csrfOk(form.csrf)) return new Response("Forbidden", { status: 403 });
    const back = safeReturn(form.return);
    const email = pendingEmail();
    if (!email) return response.redirect(`/login?return=${encodeURIComponent(back)}`, 303);

    let answer: Response;
    try {
      answer = await send("POST", "/auth/otp/verify", { channel: "email", address: email, code: (form.code || "").trim() });
    } catch {
      return loginPage("code", { email, back, error: "Signing in isn't possible just now. Try again shortly." }, 503);
    }
    if (!answer.ok) return loginPage("code", { email, back, error: await refusal(answer, "That code didn't work. Check it and try again.") }, 400);
    const body = await answer.json() as LoginResponse;
    const p = body.principal;
    if (!body.token || !p?.id) return loginPage("code", { email, back, error: "Signing in didn't work. Try again." }, 400);

    signIn({ userId: p.id, username: p.username || "", displayName: p.displayName?.trim() || p.username || "", role: p.role || "USER" }, body.token, refreshCookie(answer));
    return response.redirect(back, 303);
  },
});
