/* Who's signed in, kept in their server-side session, and the form token that goes with it.

   Session data: a csrf token for the reader's forms, the address a code was sent to while they
   sign in, and once they have, who they are and their API tokens, sealed.

   Every helper here is async, because Primate reads and writes a session in its store. A caller
   must await a write before it answers: Primate sets no session cookie while a write is pending. */
import { randomBytes, timingSafeEqual } from "node:crypto";
import session from "@/config/session";
import { open, seal } from "./vault.ts";

export type Reader = { userId: string; username: string; displayName: string; role: string };
/* As stores/Session.ts keeps it: the reader's fields flat, their tokens sealed. */
type Data = { csrf: string; pendingEmail?: string; access?: string; refresh?: string } & Partial<Reader>;

const data = async () => await session.try() as Data | undefined;
const token = () => randomBytes(24).toString("base64url");

/** The reader signed in, if any. */
export async function current(): Promise<Reader | null> {
  const d = await data();
  return d?.userId ? { userId: d.userId, username: d.username || "", displayName: d.displayName || "", role: d.role || "USER" } : null;
}

export function isAdmin(reader: Reader | null): boolean {
  return reader?.role === "ADMIN" || reader?.role === "SUPER_ADMIN";
}

/** The token the reader's forms carry, starting their session if they have none yet. */
export async function csrf(): Promise<string> {
  const now = await data();
  if (now?.csrf) return now.csrf;
  if (now) await session.set({ ...now, csrf: token() });
  else await session.create({ created: new Date(), csrf: token() });
  return (await data())!.csrf;
}

/** Whether a posted form carries the reader's token. */
export async function csrfOk(given: unknown): Promise<boolean> {
  return (await csrfCheck())(given);
}

/** The check of csrfOk, with the reader's token read now: for a form read as it streams, whose
    fields arrive in a callback that can't wait for the session. */
export async function csrfCheck(): Promise<(given: unknown) => boolean> {
  const expected = (await data())?.csrf;
  return (given) => !!expected && typeof given === "string" && given.length === expected.length &&
    timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

export async function pendingEmail(): Promise<string | undefined> {
  return (await data())?.pendingEmail;
}

export async function setPendingEmail(email: string) {
  const d = await data();
  if (d) await session.set({ ...d, pendingEmail: email });
  else await session.create({ created: new Date(), csrf: token(), pendingEmail: email });
}

/** Signs [reader] in under a new session, so a session id fixed before sign-in is no use. */
export async function signIn(reader: Reader, access: string, refresh: string | null) {
  if (session.exists) await session.destroy();
  await session.create({ created: new Date(), csrf: token(), ...reader, access: seal(access), ...(refresh ? { refresh: seal(refresh) } : {}) });
}

export async function signOut() {
  if (session.exists) await session.destroy();
}

/** The reader's API tokens, as they were sealed; null when signed out or unreadable. */
export async function tokens(): Promise<{ access: string; refresh: string | null } | null> {
  const d = await data();
  const access = d?.access ? open(d.access) : null;
  if (!access) return null;
  return { access, refresh: d?.refresh ? open(d.refresh) : null };
}

/** The API's rotated tokens, kept in place of the old. */
export async function setTokens(access: string, refresh: string | null) {
  const d = await data();
  if (!d) return;
  await session.set({ ...d, access: seal(access), ...(refresh ? { refresh: seal(refresh) } : {}) });
}

/** The reader's new display name, as the API took it, for the header and their pages. */
export async function rename(displayName: string) {
  const d = await data();
  if (d?.userId) await session.set({ ...d, displayName });
}
