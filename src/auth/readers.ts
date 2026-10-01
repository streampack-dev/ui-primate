/* Who's signed in, kept in their server-side session, and the form token that goes with it.

   Session data: a csrf token for the reader's forms, the address a code was sent to while they
   sign in, and once they have, who they are and their API tokens, sealed. */
import { randomBytes, timingSafeEqual } from "node:crypto";
import session from "@/config/session";
import { open, seal } from "./vault.ts";

export type Reader = { userId: string; username: string; displayName: string; role: string };
/* As stores/Session.ts keeps it: the reader's fields flat, their tokens sealed. */
type Data = { csrf: string; pendingEmail?: string; access?: string; refresh?: string } & Partial<Reader>;

const data = () => session.try() as Data | undefined;
const token = () => randomBytes(24).toString("base64url");

/** The reader signed in, if any. */
export function current(): Reader | null {
  const d = data();
  return d?.userId ? { userId: d.userId, username: d.username || "", displayName: d.displayName || "", role: d.role || "USER" } : null;
}

export function isAdmin(reader: Reader | null): boolean {
  return reader?.role === "ADMIN" || reader?.role === "SUPER_ADMIN";
}

/** The token the reader's forms carry, starting their session if they have none yet. */
export function csrf(): string {
  const now = data();
  if (now?.csrf) return now.csrf;
  if (now) session.set({ ...now, csrf: token() });
  else session.create({ csrf: token() });
  return data()!.csrf;
}

/** Whether a posted form carries the reader's token. */
export function csrfOk(given: unknown): boolean {
  const expected = data()?.csrf;
  if (!expected || typeof given !== "string" || given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

export function pendingEmail(): string | undefined {
  return data()?.pendingEmail;
}

export function setPendingEmail(email: string) {
  session.set({ ...(data() ?? { csrf: token() }), pendingEmail: email });
}

/** Signs [reader] in under a new session, so a session id fixed before sign-in is no use. */
export function signIn(reader: Reader, access: string, refresh: string | null) {
  if (session.exists) session.destroy();
  session.create({ csrf: token(), ...reader, access: seal(access), ...(refresh ? { refresh: seal(refresh) } : {}) });
}

export function signOut() {
  if (session.exists) session.destroy();
}

/** The reader's API tokens, as they were sealed; null when signed out or unreadable. */
export function tokens(): { access: string; refresh: string | null } | null {
  const d = data();
  const access = d?.access ? open(d.access) : null;
  if (!access) return null;
  return { access, refresh: d?.refresh ? open(d.refresh) : null };
}

/** The API's rotated tokens, kept in place of the old. */
export function setTokens(access: string, refresh: string | null) {
  const d = data();
  if (!d) return;
  session.set({ ...d, access: seal(access), ...(refresh ? { refresh: seal(refresh) } : {}) });
}
