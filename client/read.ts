/* A reader opened a post: say so (routes/read), toward Popular Reads. A reader following an RSS
   item out: say so too (routes/rss/items). Without script, neither is counted, as with any reader
   who blocks it. */
import { eachPage } from "./each-page.ts";

function beacon(path: string) {
  if (!navigator.sendBeacon?.(path)) void fetch(path, { method: "POST", keepalive: true });
}

// Once for each post shown, however the reader got to it.
eachPage(() => {
  const shown = document.querySelector<HTMLElement>("[data-read-post]:not([data-read-sent])");
  if (!shown) return;
  shown.dataset.readSent = "";
  beacon(`/read/${encodeURIComponent(shown.dataset.readPost!)}`);
});

// Middle clicks and keyboard opens count as well as plain clicks.
for (const kind of ["click", "auxclick"] as const) {
  document.addEventListener(kind, (event) => {
    const link = (event.target as Element | null)?.closest<HTMLElement>("a[data-rss-access]");
    const id = link?.dataset.rssAccess;
    if (id) beacon(`/rss/items/${encodeURIComponent(id)}/access`);
  });
}
