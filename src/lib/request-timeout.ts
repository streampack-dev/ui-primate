/* How long a request may take, start to finish, before Node ends it with a 408: half an hour,
   where Node's own is five minutes (#47). A recording (up to 100 MB) is passed on to the API as it
   arrives, so a slow connection takes as long as it takes: five minutes is 100 MB at 2.7 Mbit/s,
   half an hour about half a megabit. Headers still have to arrive within Node's minute
   (headersTimeout), so a client that never finishes asking is still cut off.

   Primate sets only the idle timeout (http.timeout), and doesn't hand an app its server. Each
   request does carry Node's own (Primate's request, then rcompat's, then Node's), and through it
   the server it came in on, so this raises the server's requestTimeout on the way past, before the
   route reads the body; Node checks against the current value. A module, so it's around
   everything (config/app.ts). For when Primate takes the setting: primate-bugs/16. */
export const REQUEST_TIMEOUT_MS = 30 * 60 * 1000;

type Server = { requestTimeout: number };

let warned = false;

/** Raises the requestTimeout of the server [request] came in on, unless it's longer or off (0).
    A request it can't follow to its server (Primate's or rcompat's changed) is said once, since
    uploads then have only Node's five minutes. */
export function stretch(request: unknown) {
  const server = (request as { original?: { original?: { socket?: { server?: Server } } } })
    ?.original?.original?.socket?.server;
  if (!server || typeof server.requestTimeout !== "number") {
    if (!warned) {
      warned = true;
      console.warn("Can't reach the HTTP server from a request: uploads have Node's five minutes, not half an hour (src/lib/request-timeout.ts).");
    }
    return;
  }
  if (server.requestTimeout !== 0 && server.requestTimeout < REQUEST_TIMEOUT_MS) server.requestTimeout = REQUEST_TIMEOUT_MS;
}

type Handle = (request: unknown, next: (request: unknown) => Promise<Response>) => Promise<Response>;

export default {
  name: "request-timeout",
  setup({ onHandle }: { onHandle: (hook: Handle) => void }) {
    onHandle((request, next) => {
      stretch(request);
      return next(request);
    });
  },
};
