/* The editor's live preview: as the admin types, the preview follows, rendered by the app
   (routes/edit/[id]/preview.ts). Without script, the Preview button does the same by posting the form. */
const body = document.querySelector<HTMLTextAreaElement>("textarea[data-preview-url]");
const shown = document.querySelector<HTMLElement>(".editor-preview");
if (body && shown) {
  const csrf = body.form?.querySelector<HTMLInputElement>("input[name=csrf]")?.value ?? "";
  let timer: ReturnType<typeof setTimeout> | undefined;
  let asked = 0;
  body.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const mine = ++asked;
      try {
        const answer = await fetch(body.dataset.previewUrl!, {
          method: "POST",
          body: new URLSearchParams({ csrf, markdownSource: body.value }),
        });
        // Only the latest keystroke's preview is shown.
        if (answer.ok && mine === asked) shown.innerHTML = await answer.text();
      } catch {
        // The last preview stays.
      }
    }, 300);
  });
}
