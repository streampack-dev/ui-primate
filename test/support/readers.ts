/* Readers who sign in, by way of the email and the code, against the stub API. */
import { stub } from "./stub.ts";
import { Visitor } from "./visitor.ts";

export const PRINCIPAL = { id: "019f0000-0000-7000-8000-00000000a001", username: "joe", displayName: "Joe O", role: "USER" };
export const ADMIN = { ...PRINCIPAL, id: "019f0000-0000-7000-8000-00000000a002", username: "ed", displayName: "Ed Itor", role: "ADMIN" };

/** The API, ready to send a code and to take it, signing [principal] in with access-1 and refresh-1. */
export async function stubSignIn(principal = PRINCIPAL) {
  await stub("/auth/otp/request", { message: "Sent." }, { method: "POST" });
  await stub("/auth/otp/verify", { token: "access-1", principal }, {
    method: "POST",
    headers: { "Set-Cookie": "refresh_token=refresh-1; Path=/auth; HttpOnly; SameSite=Lax" },
  });
}

/** A visitor who has signed in as [principal]. */
export async function signedIn(principal = PRINCIPAL) {
  await stubSignIn(principal);
  const v = new Visitor();
  await v.post("/login/code", { email: "joe@example.com", return: "/" });
  await v.post("/login", { code: "123456", return: "/" });
  return v;
}
