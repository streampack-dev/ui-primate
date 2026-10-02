import session from "primate/session";
import { READER_DAYS } from "#auth/sessions.ts";
import Session from "@/stores/Session";

/* Readers' sessions: server-side, an HttpOnly, SameSite=Lax cookie naming them, kept as
   stores/Session.ts says, for thirty days. Behind a proxy that ends TLS, SESSION_COOKIE_SECURE=true marks
   the cookie Secure. */
export default session({
  cookie: {
    secure: process.env.SESSION_COOKIE_SECURE === "true",
    maxAge: READER_DAYS * 24 * 60 * 60,
  },
  store: Session,
});
