import { describe, expect, it } from "vitest";
import { passageHtml } from "../../src/lib/passage.ts";

describe("a search result's passage", () => {
  it("wraps each marked range in <mark>", () => {
    expect(passageHtml({ source: "body", text: "An emerging runtime, emerging again", marks: [{ start: 3, end: 11 }, { start: 21, end: 29 }] }))
      .toBe("An <mark>emerging</mark> runtime, <mark>emerging</mark> again");
  });

  it("escapes the text, inside the marks and out", () => {
    expect(passageHtml({ source: "body", text: `<b>x</b> & "y" 'z'`, marks: [{ start: 0, end: 8 }] }))
      .toBe("<mark>&lt;b&gt;x&lt;/b&gt;</mark> &amp; &quot;y&quot; &#39;z&#39;");
  });

  it("counts offsets in UTF-16 units, as the API does", () => {
    // "🦀" is two UTF-16 units: "Rust" starts at 3.
    expect(passageHtml({ source: "title", text: "🦀 Rust", marks: [{ start: 3, end: 7 }] })).toBe("🦀 <mark>Rust</mark>");
  });

  it("ignores marks out of range, empty, backwards or overlapping, and sorts the rest", () => {
    const text = "one two three";
    expect(passageHtml({ source: "body", text, marks: [{ start: 8, end: 13 }, { start: 0, end: 3 }, { start: 2, end: 6 }, { start: 5, end: 5 }, { start: 7, end: 4 }, { start: 10, end: 99 }] }))
      .toBe("<mark>one</mark> two <mark>three</mark>");
  });

  it("is empty without a match", () => {
    expect(passageHtml(null)).toBe("");
    expect(passageHtml(undefined)).toBe("");
  });
});
