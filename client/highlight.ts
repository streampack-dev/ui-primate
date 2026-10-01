/* Code in a post or comment, highlighted, as ui-pudl's bcn-highlight.js does it: highlight.js is
   loaded only on a page that has code, and the page reads fine without it. */
const blocks = document.querySelectorAll<HTMLElement>(".post-body pre code");
if (blocks.length) {
  const { default: hljs } = await import("highlight.js/lib/common");
  blocks.forEach((block) => hljs.highlightElement(block));
}
