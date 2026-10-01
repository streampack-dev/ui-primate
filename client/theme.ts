/* The theme toggle: light or dark, remembered for this reader. The page starts in the right one
   (templates/app.html), so this only answers the button. Without script there's no button. */
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-theme-toggle]")) {
  button.hidden = false;
  button.addEventListener("click", () => {
    const dark = document.documentElement.classList.toggle("dark");
    try { localStorage.setItem("theme", dark ? "dark" : "light"); } catch { /* not kept */ }
  });
}
