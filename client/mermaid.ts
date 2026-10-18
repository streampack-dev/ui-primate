/* Mermaid diagrams in the editor's preview (#61), as ui-pudl's bcn-mermaid.js draws them. A
   published post's come from the API already drawn (streampack#252); the preview is rendered here
   (src/lib/preview.ts), so its ```mermaid blocks are still code. This draws them with Pele, into
   the markup the API writes: <figure class="mermaid">, the SVG, and the source in a closed
   <details>; or, for a diagram Pele refuses, the source and a caption saying why. It uses the
   API's options (links and images off, the same limits) and fonts, IBM Plex Sans and Mono, and
   waits for them, so the browser measures labels in them as the API does. Pele is loaded only when
   a preview has a diagram; each new preview is drawn as it arrives. Without script, the preview
   shows the diagram's source. */
import { eachPage } from "./each-page.ts";

const BLOCKS = ".editor-preview pre > code.language-mermaid:not([data-mermaid])";
const MAX_DIAGRAMS = 50;
const OPTIONS = {
  limit: 20_000,
  outputLimit: 1_000_000,
  links: false,
  images: false,
  fontFamily: '"IBM Plex Sans", sans-serif',
  fontFamilyMono: '"IBM Plex Mono", monospace',
};
const FACES = [
  '16px "IBM Plex Sans"', 'bold 16px "IBM Plex Sans"', 'italic 16px "IBM Plex Sans"', 'italic bold 16px "IBM Plex Sans"',
  '16px "IBM Plex Mono"', 'bold 16px "IBM Plex Mono"', 'italic 16px "IBM Plex Mono"', 'italic bold 16px "IBM Plex Mono"',
];

type Pele = typeof import("pele");
let ready: Promise<Pele> | undefined;
let drawn = 0;

/* Pele and the diagram fonts, once: a face that won't load leaves its labels in the fallback. */
function start(): Promise<Pele> {
  ready ??= Promise.all([import("pele"), Promise.all(FACES.map((f) => document.fonts.load(f).catch(() => undefined)))]).then(([pele]) => pele);
  return ready;
}

function codeBlock(source: string) {
  const pre = document.createElement("pre");
  const code = document.createElement("code");
  code.className = "language-mermaid";
  code.dataset.mermaid = "source";
  code.textContent = source;
  pre.append(code);
  return pre;
}

/* Pele's message as one line, as the API gives it: where, then what was expected. */
function reason(err: unknown) {
  const lines = String((err as Error)?.message ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return "It isn't a diagram Pele can draw.";
  const first = lines[0].replace(/^PeleError: /, "");
  return lines.length < 3 ? first : `${first.replace(/:$/, "")}: ${lines[lines.length - 1]}`;
}

function drawnFigure(svgText: string, source: string) {
  const parsed = new DOMParser().parseFromString(svgText, "image/svg+xml").documentElement;
  if (parsed.nodeName.toLowerCase() !== "svg") return null;
  const svg = document.importNode(parsed, true);
  if (!svg.hasAttribute("aria-labelledby") && !svg.hasAttribute("aria-label")) {
    svg.setAttribute("aria-label", `Diagram (${svg.getAttribute("aria-roledescription") || "diagram"})`);
  }
  const figure = document.createElement("figure");
  figure.className = "mermaid";
  const details = document.createElement("details");
  const summary = document.createElement("summary");
  summary.textContent = "Diagram source";
  details.append(summary, codeBlock(source));
  figure.append(svg, details);
  return figure;
}

function refusedFigure(source: string, why: string) {
  const figure = document.createElement("figure");
  figure.className = "mermaid mermaid-refused";
  const caption = document.createElement("figcaption");
  caption.textContent = `This diagram wasn't drawn: ${why}`;
  figure.append(codeBlock(source), caption);
  return figure;
}

function figureFor(pele: Pele, code: HTMLElement, index: number) {
  const source = code.textContent ?? "";
  try {
    const result = pele.render(source.trimEnd(), { idPrefix: `preview-${++drawn}-${index}`, ...OPTIONS });
    return drawnFigure(result.svg, source) ?? refusedFigure(source, "The drawing was empty.");
  } catch (err) {
    if ((err as Error)?.name === "PeleError") return refusedFigure(source, reason(err));
    console.error("mermaid", err);
    return refusedFigure(source, "The renderer failed.");
  }
}

async function draw() {
  const blocks = [...document.querySelectorAll<HTMLElement>(BLOCKS)].filter((b) => !b.closest("figure.mermaid"));
  if (!blocks.length) return;
  // Claimed now, so a pass while Pele loads doesn't take them again.
  blocks.forEach((b) => (b.dataset.mermaid = "pending"));
  let pele: Pele;
  try {
    pele = await start();
  } catch {
    blocks.forEach((b) => (b.dataset.mermaid = "unavailable"));
    return;
  }
  blocks.forEach((code, index) => {
    const pre = code.parentElement;
    if (!pre?.isConnected) return;
    if (index >= MAX_DIAGRAMS) return void (code.dataset.mermaid = "skipped");
    pre.replaceWith(figureFor(pele, code, index));
  });
}

let watching = false;
eachPage(() => {
  void draw();
  // Each preview the editor swaps in (client/editor.ts) is drawn as it arrives.
  if (watching) return;
  watching = true;
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; void draw(); });
  }).observe(document.body, { childList: true, subtree: true });
});
