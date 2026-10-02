import { describe, expect, it, vi } from "vitest";

describe("the Node compatibility shim", () => {
  it("gives Uint8Array a toHex that matches Node 25's, where Node hasn't one", async () => {
    const proto = Uint8Array.prototype as { toHex?: () => string };
    const native = proto.toHex;
    // As on Node 22: none.
    delete proto.toHex;
    try {
      vi.resetModules();
      await import("../../src/lib/node-compat.ts");
      expect(new Uint8Array([0, 1, 15, 16, 171, 255]).toHex()).toBe("00010f10abff");
      expect(Object.keys(Uint8Array.prototype)).not.toContain("toHex");
    } finally {
      if (native) Object.defineProperty(Uint8Array.prototype, "toHex", { value: native, writable: true, configurable: true });
    }
  });
});
