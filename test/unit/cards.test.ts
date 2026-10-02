import { describe, expect, it } from "vitest";
import { cardLines, postCard, siteCard } from "../../src/og/cards.ts";

/** A PNG's width and height, from its header. */
function size(png: Uint8Array) {
  const view = new DataView(png.buffer, png.byteOffset);
  return { png: [...png.subarray(1, 4)].map((c) => String.fromCharCode(c)).join(""), width: view.getUint32(16), height: view.getUint32(20) };
}

describe("a post's card", () => {
  it("shows its title and dek, trimmed, and the day it was published in UTC", () => {
    expect(cardLines({ title: " Midden ", excerpt: " Reads heap dumps. ", publishedAt: "2026-10-01T02:30:00Z" }))
      .toEqual({ title: "Midden", dek: "Reads heap dumps.", date: "1 October 2026" });
  });

  it("leaves out a dek or date it hasn't got", () => {
    expect(cardLines({ title: "Midden", excerpt: "  ", publishedAt: null })).toEqual({ title: "Midden", dek: null, date: null });
  });

  it("is drawn as a 1200 by 630 PNG, a new one when what it shows changes", async () => {
    const one = await postCard({ title: "Midden", dek: "Reads heap dumps.", date: "1 October 2026" });
    const other = await postCard({ title: "Midden, again", dek: null, date: null });

    expect(size(one)).toEqual({ png: "PNG", width: 1200, height: 630 });
    expect(Buffer.from(one).equals(Buffer.from(other))).toBe(false);
  });
});

describe("the site's card", () => {
  it("is drawn as a 1200 by 630 PNG", async () => {
    expect(size(await siteCard())).toEqual({ png: "PNG", width: 1200, height: 630 });
  });
});
