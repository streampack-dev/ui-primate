/* The editor's live preview: as the admin types, the preview follows, rendered by the app
   (routes/edit/[id]/preview.ts). Without script, the Preview button does the same by posting the form. */
import { eachPage } from "./each-page.ts";

eachPage(() => {
  const body = document.querySelector<HTMLTextAreaElement>("textarea[data-preview-url]:not([data-ready])");
  const shown = document.querySelector<HTMLElement>(".editor-preview");
  if (!body || !shown) return;
  body.dataset.ready = "";
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
});

/* A post's recording (#33): a file over the most the site takes is refused as it's chosen, rather
   than after minutes of uploading. Without script, the server refuses it. */
document.addEventListener("change", (e) => {
  const field = e.target as HTMLInputElement | null;
  if (!field?.matches?.("input[type=file][data-max-bytes]")) return;
  const file = field.files?.[0];
  field.setCustomValidity(file && file.size > Number(field.dataset.maxBytes) ? "The recording is over 100 MB, the most the site takes." : "");
  field.reportValidity();
});
