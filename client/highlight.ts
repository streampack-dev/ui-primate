/* Code in a post or comment, highlighted, as ui-pudl's bcn-highlight.js does it: highlight.js is
   loaded only on a page that has code, and the page reads fine without it. */
import { eachPage } from "./each-page.ts";

eachPage(async () => {
  // highlight.js marks what it has done.
  const blocks = document.querySelectorAll<HTMLElement>(".post-body pre code:not([data-highlighted])");
  if (!blocks.length) return;
  const { default: hljs } = await import("highlight.js/lib/common");
  blocks.forEach((block) => block.isConnected && !block.dataset.highlighted && hljs.highlightElement(block));
});
