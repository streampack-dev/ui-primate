/* Mermaid diagrams in the editor's preview (#61). A published post's come from the API already
   drawn (streampack#252); the preview is rendered here (src/lib/preview.ts), so its ```mermaid
   blocks are still code. The drawing is clientjs's mermaid module (streampack-dev/clientjs, #75):
   the API's Pele options, fonts and markup, the same in ui-pudl. This is the site's part: Pele,
   imported only when a preview has a diagram (pinned in package.json to the version streampack
   bundles); which blocks are the preview's; and each new preview, drawn as it arrives. Without
   script, the preview shows the diagram's source. */
import { draw } from "@streampack-dev/clientjs/mermaid";
import { eachPage } from "./each-page.ts";

const BLOCKS = ".editor-preview pre > code.language-mermaid:not([data-mermaid])";

const loadPele = () => import("pele");

function drawPreview() {
  const blocks = document.querySelectorAll<HTMLElement>(BLOCKS);
  if (blocks.length) void draw(blocks, loadPele, { bodyOf: (code) => code.closest(".editor-preview") });
}

let watching = false;
eachPage(() => {
  drawPreview();
  // Each preview the editor swaps in (client/editor.ts) is drawn as it arrives.
  if (watching) return;
  watching = true;
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; drawPreview(); });
  }).observe(document.body, { childList: true, subtree: true });
});
