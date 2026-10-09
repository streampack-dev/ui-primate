/* The feed list's Copy buttons (views/RssFeeds.marko): each copies its row's IRC command,
   `feed subscribe <url>`, and says so in words beside it. Without script the buttons stay hidden
   and the command is plain text to select. */
import { eachPage } from "./each-page.ts";

const SAID_FOR = 4000;

/** [text] on the clipboard: the Clipboard API where it's allowed, else a selection copied. */
async function copy(text: string, source: Element | null): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    if (!source) return false;
    const range = document.createRange();
    range.selectNodeContents(source);
    const selection = getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    }
  }
}

eachPage(() => {
  for (const button of document.querySelectorAll<HTMLButtonElement>("button.feed-copy[data-copy]:not([data-ready])")) {
    button.dataset.ready = "";
    button.hidden = false;
  }
});

document.addEventListener("click", async (event) => {
  const button = (event.target as Element | null)?.closest<HTMLButtonElement>("button.feed-copy[data-copy]");
  if (!button) return;
  const row = button.closest(".feed-command-row");
  const said = row?.querySelector<HTMLElement>(".feed-copied");
  const ok = await copy(button.dataset.copy!, row?.querySelector(".feed-command") ?? null);
  if (!said) return;
  said.textContent = ok ? "Copied" : "Couldn't copy: select the command instead";
  clearTimeout(Number(said.dataset.timer));
  said.dataset.timer = String(setTimeout(() => { said.textContent = ""; }, SAID_FOR));
});
