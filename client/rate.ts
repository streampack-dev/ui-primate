/* An admin's rating of an RSS item (#27, views/Rss.marko), made in place: the button's form is
   posted as it would be, asking for JSON, and the item's three buttons and its words are redrawn
   from the answer, without a new page. Without script, the form posts and comes back to the item. */

type Answer = { rating?: string | null; said?: string; error?: string };

/** The item's buttons and words as [rating] says, each button ready to set its rating or clear it;
   [refused], the reason is said before the words as they were. */
function draw(group: HTMLElement, rating: string | null, said: string, refused = false) {
  for (const button of group.querySelectorAll<HTMLButtonElement>("button[data-rating]")) {
    const pressed = button.dataset.rating === rating;
    button.setAttribute("aria-pressed", String(pressed));
    button.value = pressed ? "NONE" : button.dataset.rating!;
    const glyph = button.querySelector(".rss-rate-glyph");
    if (glyph) glyph.textContent = pressed ? "✓" : "○";
  }
  const now = group.querySelector<HTMLElement>(".rss-rating-now");
  if (now) {
    now.textContent = refused ? `${said} ${now.dataset.said ?? ""}`.trim() : said;
    if (!refused) now.dataset.said = said;
    now.classList.toggle("is-refused", refused);
  }
}

// Before Primate's own form handling (on window), which would draw the redirect's page.
document.addEventListener("submit", async (event) => {
  const form = event.target as HTMLFormElement | null;
  if (!form?.matches?.("form.rss-rate")) return;
  const group = form.closest<HTMLElement>("[data-rss-rating]");
  const submitter = (event as SubmitEvent).submitter as HTMLButtonElement | null;
  if (!group || !submitter) return;
  event.preventDefault();
  const buttons = [...group.querySelectorAll<HTMLButtonElement>("button[data-rating]")];
  if (buttons.some((b) => b.disabled)) return;
  const pressedBefore = buttons.find((b) => b.getAttribute("aria-pressed") === "true")?.dataset.rating ?? null;
  const now = group.querySelector<HTMLElement>(".rss-rating-now");
  if (now && now.dataset.said === undefined) now.dataset.said = now.textContent?.trim() ?? "";
  const body = new URLSearchParams(new FormData(form, submitter) as unknown as Record<string, string>);
  for (const b of buttons) b.disabled = true;
  try {
    const answer = await fetch(form.action, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const said = await answer.json().catch(() => ({})) as Answer;
    if (!answer.ok) throw new Error(said.error || "The rating wasn't saved. Try again.");
    draw(group, said.rating ?? null, said.said || "");
  } catch (e) {
    const reason = e instanceof Error && e.message && !e.message.startsWith("Failed") ? e.message : "The rating wasn't saved. Try again.";
    draw(group, pressedBefore, reason, true);
  } finally {
    for (const b of buttons) b.disabled = false;
    submitter.focus();
  }
});
