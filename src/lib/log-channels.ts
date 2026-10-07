/* The channels a reader may browse, and the API's logs, as that reader: signed in, with their
   token, uncached (so no one else is served their channels); signed out, anonymously and cached,
   as ui-pudl does. Shared by the logs and their search. */
import { cachedGet, send } from "#api/client.ts";
import type { components } from "#api/schema.d.ts";
import { current } from "#auth/readers.ts";
import { asReader, bearer, SignInRequired } from "#auth/signed-in.ts";
import { channelName, speaker } from "#lib/logs.ts";

type Channels = components["schemas"]["LogProvenanceListResponse"];

/** A channel: its provenance, its name, its latest line, and its readable address (`irc/libera/java`, #16) where the API gives one. */
export type Channel = { uri: string; name: string; latest: string | null; path: string | null };

/** A channel's log: its readable address where it has one (`/logs/irc/libera/java/2026-10-06`), else the query form. A [day] of null is today's, as the address says nothing of it. */
export function logHref(channel: Channel, day: string | null, all = false): string {
  if (channel.path) return `/logs/${channel.path}${day ? `/${day}` : ""}${all ? "?all=1" : ""}`;
  return `/logs?${new URLSearchParams({ provenance: channel.uri, ...(day ? { day } : {}), ...(all ? { all: "1" } : {}) })}`;
}

/** A search of a channel's log, with [params] (q, from, page), in the same two forms. */
export function searchHref(channel: Channel, params: Record<string, string>, all = false): string {
  const own = { ...params, ...(all ? { all: "1" } : {}) };
  if (channel.path) {
    const query = new URLSearchParams(own).toString();
    return `/logs/${channel.path}/search${query ? `?${query}` : ""}`;
  }
  return `/logs/search?${new URLSearchParams({ provenance: channel.uri, ...own })}`;
}

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

/** The reader's channels, by name: IRC's, or every protocol's when [all] (an admin's choice). Throws when they can't be had. */
export async function channels(all: boolean): Promise<Channel[]> {
  const listed = await readLogs<Channels>("/logs/provenances", {});
  return (listed?.provenances || [])
    .filter((c) => c.provenanceUri && (all || c.protocol?.toLowerCase() === "irc"))
    .map((c) => {
      const who = speaker(c.latestSender, c.latestContentPreview);
      return {
        uri: c.provenanceUri!,
        name: channelName(c.provenanceUri!),
        latest: c.latestContentPreview ? (who ? `${who}: ${c.latestContentPreview}` : c.latestContentPreview) : null,
        path: c.path || null,
      };
    })
    // Alphabetically, as a reader looks a channel up by name.
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
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
