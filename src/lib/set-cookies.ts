/* Every Set-Cookie an answer carries is sent, not only the last (primate-bugs/14). Primate's Node
   server (@rcompat/http, serve/node.js) copies a Response's headers with setHeader one by one, and
   Headers gives each Set-Cookie as its own entry, so each replaces the one before. The Atlas sets
   two cookies at once (bcn-atlas-seen and bcn-atlas-since), and a session started on the same
   answer would add a third. Here a Set-Cookie set on an answer that has one already is added to
   it instead. Loaded once, with the app's config (config/app.ts). */
import http from "node:http";

const setHeader = http.ServerResponse.prototype.setHeader;

export function keepEverySetCookie() {
  if ((http.ServerResponse.prototype as { keepsEveryCookie?: boolean }).keepsEveryCookie) return;
  (http.ServerResponse.prototype as { keepsEveryCookie?: boolean }).keepsEveryCookie = true;
  http.ServerResponse.prototype.setHeader = function (this: http.ServerResponse, name: string, value: number | string | readonly string[]) {
    if (name.toLowerCase() === "set-cookie" && this.hasHeader("set-cookie")) {
      const before = this.getHeader("set-cookie");
      const all = [...(Array.isArray(before) ? before : [String(before)]), ...(Array.isArray(value) ? value : [String(value)])];
      return setHeader.call(this, name, all);
    }
    return setHeader.call(this, name, value);
  } as typeof setHeader;
}
