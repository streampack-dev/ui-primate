/* API calls as the reader signed in to this session, their token renewed when it's expired
   (renewal.ts). */
import session from "@/config/session";
import { send } from "#api/client.ts";
import { refreshCookie } from "./forms.ts";
import { signOut, setTokens, tokens } from "./readers.ts";
import { signedInCalls } from "./renewal.ts";

export { SignInRequired } from "./renewal.ts";

const calls = signedInCalls(async (refresh) => {
  const answer = await send("POST", "/auth/refresh", undefined, { Cookie: `refresh_token=${refresh}` });
  if (answer.status >= 400 && answer.status < 500) return null;
  if (!answer.ok) throw new Error(`The API couldn't renew a token: ${answer.status}`);
  const body = await answer.json() as { token?: string };
  if (!body.token) return null;
  return { access: body.token, refresh: refreshCookie(answer) ?? refresh };
});

/** [block], given the reader's access token; throws SignInRequired when they must sign in again. */
export function asReader(block: (access: string) => Promise<Response>): Promise<Response> {
  return calls({
    id: session.exists ? session.id : "",
    read: tokens,
    write: (t) => (t ? setTokens(t.access, t.refresh) : signOut()),
  }, block);
}

export const bearer = (access: string) => ({ Authorization: `Bearer ${access}` });

/** A GET of [path] as the reader, uncached: the answer's body, or null for a 404. Throws otherwise. */
export async function getAsReader<T>(path: string, query: Record<string, string | number | undefined> = {}): Promise<T | null> {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined) search.set(k, String(v));
  const answer = await asReader((a) => send("GET", `${path}${search.size ? `?${search}` : ""}`, undefined, bearer(a)));
  if (answer.status === 404) return null;
  if (!answer.ok) throw new Error(`${path}: ${answer.status}`);
  return await answer.json() as T;
}
