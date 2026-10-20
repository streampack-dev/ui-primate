/* The link-preview cards, 1200 by 630 PNGs, as ui-pudl draws them (its og/Cards.kt, design B) and
   ui-nextjs copies them: the site icon's orange glow in the top left and its "b" mark large and dim
   at the right, bleeding off the edge; the icon and wordmark; for a post, its title, dek and date,
   and no author. Inter comes with the app (assets/og, under the OFL), so a card looks the same
   wherever it's drawn. Laid out by satori, painted by resvg: what next/og does inside. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import satori from "satori";

export const WIDTH = 1200;
export const HEIGHT = 630;

const PAD = 80;
const TEXT_WIDTH = 700;
const BG = "#121417";
const TEXT = "#e6e8eb";
const MUTED = "#9aa3ad";
const ACCENT = "#f08a5d";
// The mark: the icon at 1.65 times its 512px, placed so its squares start clear of the words.
const MARK_SIZE = Math.round(512 * 1.65);
const MARK_X = 655;
const MARK_Y = -106;
const TAGLINE = "PROGRAMMING NEWS & TECHNICAL WRITING";

export type CardLines = { title: string; dek: string | null; date: string | null };

/** The date as a card shows it, "21 September 2026", in UTC as the API gives it. */
function cardDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** What a post's card shows: its title and dek, and when it was published. */
export function cardLines(post: { title?: string | null; excerpt?: string | null; publishedAt?: string | null }): CardLines {
  return { title: (post.title || "").trim(), dek: post.excerpt?.trim() || null, date: cardDate(post.publishedAt) };
}

/* The fonts and images, read once, from assets/og at the project's root. */
let assets: { fonts: { name: string; data: Buffer; weight: 400 | 600 | 700; style: "normal" }[]; icon: string; mark: string } | null = null;
function load() {
  if (!assets) {
    const file = (name: string) => readFileSync(join(process.cwd(), "assets/og", name));
    const png = (name: string) => `data:image/png;base64,${file(name).toString("base64")}`;
    assets = {
      fonts: [
        { name: "Inter", data: file("Inter-Bold.ttf"), weight: 700, style: "normal" },
        { name: "Inter", data: file("Inter-SemiBold.ttf"), weight: 600, style: "normal" },
        { name: "Inter", data: file("Inter-Regular.ttf"), weight: 400, style: "normal" },
      ],
      icon: png("icon.png"),
      mark: png("mark.png"),
    };
  }
  return assets;
}

/* An element as satori takes it, without JSX. */
type Node = { type: string; props: Record<string, unknown> };
function el(type: string, style: Record<string, unknown>, ...children: (Node | string | null | false)[]): Node {
  const kept = children.filter((c) => c !== null && c !== false);
  // A single child is given as itself: satori counts an array as many.
  return { type, props: { style, children: kept.length === 1 ? kept[0] : kept } };
}
const img = (src: string, size: number, style: Record<string, unknown>): Node =>
  ({ type: "img", props: { src, width: size, height: size, style } });

/* The dark ground, the icon's glow in the top left, and its mark large and dim at the right. */
function backdrop(...children: (Node | null | false)[]): Node {
  return el("div", {
    width: "100%", height: "100%", display: "flex", position: "relative", backgroundColor: BG, color: TEXT, fontFamily: "Inter",
    backgroundImage: "radial-gradient(circle 560px at 0px 0px, rgba(240,106,42,0.59) 0%, rgba(160,64,24,0.18) 45%, rgba(0,0,0,0) 100%)",
  }, img(load().mark, MARK_SIZE, { position: "absolute", left: MARK_X, top: MARK_Y, opacity: 0.24 }), ...children);
}

const wordmark = (style: Record<string, unknown>) =>
  el("div", { display: "flex", ...style }, el("span", {}, "bytecode"), el("span", { color: ACCENT }, "."), el("span", {}, "news"));

async function draw(card: Node): Promise<Uint8Array> {
  const svg = await satori(card as never, { width: WIDTH, height: HEIGHT, fonts: load().fonts });
  return new Resvg(svg, { fitTo: { mode: "width", value: WIDTH } }).render().asPng();
}

/** A post's card. */
export function postCard(lines: CardLines): Promise<Uint8Array> {
  // A long title takes three lines, and leaves the dek two.
  const longTitle = lines.title.length > 64;
  return draw(backdrop(
    el("div", { position: "absolute", left: PAD, top: 62, display: "flex", alignItems: "center" },
      img(load().icon, 60, { borderRadius: 12 }),
      wordmark({ marginLeft: 16, fontSize: 34, fontWeight: 600 })),
    el("div", { position: "absolute", left: PAD, top: 164, width: TEXT_WIDTH, display: "flex", flexDirection: "column" },
      el("div", { display: "block", fontSize: 54, fontWeight: 700, lineHeight: "63px", lineClamp: 3 }, lines.title),
      lines.dek && el("div", { display: "block", marginTop: 39, fontSize: 29, fontWeight: 400, lineHeight: "41px", color: MUTED, lineClamp: longTitle ? 2 : 3 }, lines.dek)),
    lines.date && el("div", { position: "absolute", left: PAD, top: 543, fontSize: 25, fontWeight: 600, color: MUTED }, lines.date),
  ));
}

/** The site's card: the icon, the name, a rule and the tagline. */
export function siteCard(): Promise<Uint8Array> {
  return draw(backdrop(
    img(load().icon, 112, { position: "absolute", left: PAD, top: 168, borderRadius: 22 }),
    wordmark({ position: "absolute", left: PAD, top: 300, fontSize: 84, fontWeight: 700, letterSpacing: "-0.02em" }),
    el("div", { position: "absolute", left: PAD, top: 414, width: 72, height: 3, backgroundColor: ACCENT, display: "flex" }),
    el("div", { display: "flex", position: "absolute", left: PAD, top: 444, fontSize: 21, fontWeight: 600, letterSpacing: "0.18em", color: MUTED }, TAGLINE),
  ));
}
