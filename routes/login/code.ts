import response from "primate/response";
import route from "primate/route";
import { send } from "#api/client.ts";
import { csrfOk, setPendingEmail } from "#auth/readers.ts";
import { refusal, safeReturn } from "#auth/forms.ts";
import { loginPage } from "../login.ts";

/* The first step of signing in: the API emails a code to the address given. */
export default route({
  async post(request) {
    const form = await request.body.form() as Record<string, string>;
    if (!csrfOk(form.csrf)) return new Response("Forbidden", { status: 403 });
    const back = safeReturn(form.return);
    const email = (form.email || "").trim();
    if (!email.includes("@")) return loginPage("email", { email, back, error: "Enter the email address you sign in with." }, 400);

    let answer: Response;
    try {
      answer = await send("POST", "/auth/otp/request", { channel: "email", address: email });
    } catch {
      return loginPage("email", { email, back, error: "Codes can't be sent just now. Try again shortly." }, 503);
    }
    if (!answer.ok) return loginPage("email", { email, back, error: await refusal(answer, "That didn't work. Check the address and try again.") }, 400);
    setPendingEmail(email);
    return response.redirect(`/login?step=code&return=${encodeURIComponent(back)}`, 303);
  },
});
