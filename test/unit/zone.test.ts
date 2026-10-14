import { describe, expect, it } from "vitest";
import { formatDateTime, formatStamp, formatUpdatedTime } from "../../src/lib/format.ts";
import { fromZoned, toZoned, validZone } from "../../src/lib/zone.ts";

/* The reader's zone (#35): checking it, and moving between it and UTC, gaps and repeats included. */

describe("zones, converting", () => {
  it("check the zone, kept as given", () => {
    expect(validZone("America/New_York")).toBe("America/New_York");
    expect(validZone("Asia/Kolkata")).toBe("Asia/Kolkata");
    expect(validZone("Nowhere/Special")).toBeNull();
    expect(validZone("")).toBeNull();
    expect(validZone(undefined)).toBeNull();
  });

  it("move a time that never happens on by the gap, and take the first of one that happens twice", () => {
    // Clocks go forward at 02:00 on 2026-03-08 in New York: 02:30 is 03:30 EDT.
    expect(fromZoned("2026-03-08T02:30", "America/New_York")?.toISOString()).toBe("2026-03-08T07:30:00.000Z");
    // Back at 02:00 on 2026-11-01: 01:30 happens twice; the first is EDT's.
    expect(fromZoned("2026-11-01T01:30", "America/New_York")?.toISOString()).toBe("2026-11-01T05:30:00.000Z");
    expect(fromZoned("2026-02-30T09:00", "America/New_York")).toBeNull();
    expect(fromZoned("soon", "UTC")).toBeNull();
  });

  it("round-trip on the wall clock", () => {
    expect(toZoned("2026-10-20T14:30:00Z", "Asia/Kolkata")).toBe("2026-10-20T20:00");
    expect(fromZoned("2026-10-20T20:00", "Asia/Kolkata")?.toISOString()).toBe("2026-10-20T14:30:00.000Z");
    expect(toZoned(null, "UTC")).toBe("");
  });
});

describe("times, formatted in a zone", () => {
  it("name the zone", () => {
    expect(formatDateTime("2026-10-20T14:30:00Z", "America/New_York")).toBe("October 20, 2026, 10:30 AM EDT");
    expect(formatDateTime("2026-12-20T14:30:00Z", "America/New_York")).toBe("December 20, 2026, 9:30 AM EST");
    expect(formatStamp("2026-10-07T10:00:00Z", "Asia/Kolkata")).toBe("2026-10-07 15:30 GMT+5:30");
    expect(formatUpdatedTime("2026-10-01T02:30:00Z", "America/Los_Angeles")).toBe("Updated 7:30pm PDT");
    expect(formatStamp(null, "UTC")).toBe("");
  });

  it("are UTC outside a request", () => {
    expect(formatDateTime("2026-10-20T14:30:00Z")).toBe("October 20, 2026, 2:30 PM UTC");
  });
});
