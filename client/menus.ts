/* The header's menus (#95) are <details>, so they open and shut without script. With it, opening one
   shuts the others, and a press outside the open one, or Escape, shuts it (Escape gives the focus back
   to its title). The header is drawn again with each page (client/each-page.ts), shut. */
const open = () => [...document.querySelectorAll<HTMLDetailsElement>("details[data-menu][open]")];

document.addEventListener("toggle", (event) => {
  const menu = event.target;
  if (!(menu instanceof HTMLDetailsElement) || !menu.matches("[data-menu]") || !menu.open) return;
  for (const other of open()) if (other !== menu) other.open = false;
}, true);

document.addEventListener("click", (event) => {
  for (const menu of open()) {
    if (!menu.contains(event.target as Node)) menu.open = false;
    // A choice in the menu shuts it, as the page drawn in place would; a Share to button (#98) opens
    // another tab, and leaves its menu open, saying whether it copied, for the reader's return.
    else if ((event.target as Element).closest?.(".hmenu-panel a:not([data-share-to])")) menu.open = false;
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  for (const menu of open()) {
    menu.open = false;
    if (menu.contains(document.activeElement)) menu.querySelector("summary")?.focus();
  }
});
