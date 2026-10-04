/* The channels a reader may browse, and the API's logs, as that reader: signed in, with their
   token, uncached (so no one else is served their channels); signed out, anonymously and cached,
   as ui-pudl does. Shared by the logs and their search. */
import { cachedGet, send } from "#api/client.ts";
import type { components } from "#api/schema.d.ts";
import { current } from "#auth/readers.ts";
import { asReader, bearer, SignInRequired } from "#auth/signed-in.ts";
import { channelName } from "#lib/logs.ts";

type Channels = components["schemas"]["LogProvenanceListResponse"];

export type Channel = { uri: string; name: string; latest: string | null };

/** [path] from the API, as the signed-in reader when there is one; null for a 404. Throws when it can't be had. */
export async function readLogs<T>(path: string, query: Record<string, string>): Promise<T | null> {
  if (current()) {
    try {
      const answer = await asReader((a) => send("GET", `${path}?${new URLSearchParams(query)}`, undefined, bearer(a)));
      if (answer.status === 404) return null;
      if (!answer.ok) throw new Error(`${path}: ${answer.status}`);
      return await answer.json() as T;
    } catch (e) {
      // A reader whose sign-in has lapsed sees what anyone does.
      if (!(e instanceof SignInRequired)) throw e;
    }
  }
  return cachedGet<T>(path, query);
}

/** The reader's channels: IRC's, or every protocol's when [all] (an admin's choice). Throws when they can't be had. */
export async function channels(all: boolean): Promise<Channel[]> {
  const listed = await readLogs<Channels>("/logs/provenances", {});
  return (listed?.provenances || [])
    .filter((c) => c.provenanceUri && (all || c.protocol?.toLowerCase() === "irc"))
    .map((c) => ({
      uri: c.provenanceUri!,
      name: channelName(c.provenanceUri!),
      latest: c.latestContentPreview ? `${c.latestSender ?? ""}: ${c.latestContentPreview}` : null,
    }));
}

/**
 * A GET of [path] the API may refuse in words a reader should see (a search too short, too many
 * searches): as the signed-in reader when there is one, else anonymously, never cached. The
 * response is the API's, as it came.
 */
export async function askLogs(path: string, query: Record<string, string>): Promise<Response> {
  const url = `${path}?${new URLSearchParams(query)}`;
  if (current()) {
    try {
      return await asReader((a) => send("GET", url, undefined, bearer(a)));
    } catch (e) {
      if (!(e instanceof SignInRequired)) throw e;
    }
  }
  return send("GET", url);
}
