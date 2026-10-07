/* What Primate uses that the Node the image runs (24) hasn't got, supplied before it's needed.

   Primate declares Node 24 or later, but generates its UUIDs with Uint8Array.prototype.toHex, which
   only Node 25 and later have (primate-bugs/10), so the image gets toHex here. This module is
   imported by the session store (stores/Session.ts), which is loaded before any request is
   answered. Remove it when Primate stops needing it, or the image moves to a Node that has it. */
if (typeof (Uint8Array.prototype as { toHex?: unknown }).toHex !== "function") {
  Object.defineProperty(Uint8Array.prototype, "toHex", {
    value: function toHex(this: Uint8Array): string {
      let hex = "";
      for (const byte of this) hex += byte.toString(16).padStart(2, "0");
      return hex;
    },
    writable: true,
    configurable: true,
  });
}
