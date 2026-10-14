import { describe, expect, it } from "vitest";
import { limitLabel, MAX_BYTES, MAX_LABEL } from "../../src/lib/audio.ts";

/* The most a recording may be (#33): 100 MB unless BCN_RECORDING_MAX_BYTES says otherwise, as the
   page tests' app does (test/support/app.ts). */
describe("the recording limit", () => {
  it("is 100 MB when nothing sets it", () => {
    expect(MAX_BYTES).toBe(100 * 1024 * 1024);
    expect(MAX_LABEL).toBe("100 MB");
  });

  it("is said in the units it was set in", () => {
    expect(limitLabel(100 * 1024)).toBe("100 KB");
    expect(limitLabel(5 * 1024 * 1024)).toBe("5 MB");
    expect(limitLabel(1536 * 1024)).toBe("1536 KB");
    expect(limitLabel(1000)).toBe("1000 bytes");
  });
});
