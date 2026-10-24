/* Share to (#98): a post's menu of BCN's text and a button per network. A button copies the text in
   the menu's box (as the reader may have edited it) and opens the network's own share page in a new
   tab, where they paste it: clientjs's share module (streampack-dev/clientjs#15), the same in
   ui-pudl. The copy starts in the click itself, as the clipboard needs; the menu says whether it
   copied. Without script, the buttons are plain links to the networks' pages. */
import { shareTo } from "@streampack-dev/clientjs/share";

document.addEventListener("click", (event) => {
  const link = (event.target as Element).closest?.<HTMLAnchorElement>("a[data-share-to][href]");
  if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const box = link.closest("[data-share]");
  const source = box?.querySelector<HTMLTextAreaElement>("[data-share-text]");
  if (!box || !source) return;
  event.preventDefault();
  const status = box.querySelector<HTMLElement>("[data-share-status]");
  if (status) status.textContent = "";
  const name = link.textContent?.trim() ?? "";
  shareTo(link.href, source.value, window).then((copied) => {
    if (!status) return;
    status.textContent = copied ? `Copied. Paste it into ${name}.` : "Couldn't copy the text: select it in the box and copy it.";
    status.dataset.kind = copied ? "positive" : "warn";
  });
});
