/* Calls to the API as a signed-in reader, renewing their access token when it's expired, as
   ui-pudl's AuthenticatedCalls does.

   On a 401 the call renews once and tries again. The API rotates refresh tokens, so a refresh
   token can be spent only once: calls that find the same token expired together share one
   renewal. Each request sees the session as it was when the request began, so a renewal is
   remembered for a while, by session and by the token it replaced, for requests already under way
   with the old one. A refused renewal signs the reader out; an API that's merely down leaves them
   signed in. */

export type Tokens = { access: string; refresh: string | null };

/** One reader's tokens: as this request saw them, and where new ones are kept. */
export interface SessionTokens {
  id: string;
  read(): Tokens | null;
  /** Keeps [tokens], or signs the reader out when null. */
  write(tokens: Tokens | null): void;
}

/** Trades a refresh token for new tokens; null when the API refuses it. Throws when it can't ask. */
export type Refresh = (refresh: string) => Promise<Tokens | null>;

/** The reader has to sign in (again) first. */
export class SignInRequired extends Error {
  constructor() {
    super("Sign-in required");
  }
}

const REMEMBER_MS = 5 * 60_000;

export function signedInCalls(refresh: Refresh) {
  const renewals = new Map<string, { from: string; to: Promise<Tokens | null>; at: number }>();

  function renew(session: SessionTokens, failed: Tokens): Promise<Tokens | null> {
    const now = Date.now();
    for (const [key, r] of renewals) if (now - r.at > REMEMBER_MS) renewals.delete(key);
    const known = renewals.get(session.id);
    if (known?.from === failed.access) return known.to;
    const to = failed.refresh ? refresh(failed.refresh) : Promise.resolve(null);
    renewals.set(session.id, { from: failed.access, to, at: now });
    // A renewal that couldn't be asked for may be tried again by the next call.
    to.catch(() => { if (renewals.get(session.id)?.to === to) renewals.delete(session.id); });
    return to;
  }

  return async function call(session: SessionTokens, block: (access: string) => Promise<Response>): Promise<Response> {
    const tokens = session.read();
    if (!tokens) throw new SignInRequired();
    const first = await block(tokens.access);
    if (first.status !== 401) return first;

    const renewed = await renew(session, tokens);
    if (!renewed) {
      session.write(null);
      throw new SignInRequired();
    }
    session.write(renewed);
    const second = await block(renewed.access);
    if (second.status === 401) {
      session.write(null);
      throw new SignInRequired();
    }
    return second;
  };
}
