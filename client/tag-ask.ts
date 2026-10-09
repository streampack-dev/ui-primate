/* A tag question's preview as the admin types (views/AdminTagAsk.marko): the fields are checked by
   the API's dry run (through this app's .../preview, as JSON) after typing pauses, and Confirm,
   carrying what was checked, is offered only once a preview says it can be done. Typing takes it
   away again until the next preview. Without script, the Preview button does the same by GET. */
import { eachPage } from "./each-page.ts";

eachPage(() => {
  const check = document.querySelector<HTMLFormElement>("form.tag-ask-check[data-preview-url]:not([data-ready])");
  const confirm = document.querySelector<HTMLFormElement>("form.tag-ask-confirm");
  const said = document.querySelector<HTMLElement>("#tag-preview");
  const button = confirm?.querySelector<HTMLButtonElement>("button[type=submit]");
  if (!check || !confirm || !said || !button) return;
  check.dataset.ready = "";
  const fields = [...check.querySelectorAll<HTMLInputElement>("input:not([type=hidden])")];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let asked = 0;

  const offer = (ok: boolean) => {
    button.disabled = !ok;
    confirm.hidden = !ok;
  };

  const preview = async () => {
    const mine = ++asked;
    const values = Object.fromEntries(fields.map((f) => [f.name, f.value]));
    try {
      const answer = await fetch(`${check.dataset.previewUrl}?${new URLSearchParams(values)}`, { headers: { Accept: "application/json" } });
      if (mine !== asked) return;
      if (!answer.ok) throw new Error(String(answer.status));
      const body = await answer.json() as { ok: boolean; text: string; button: string };
      if (mine !== asked) return;
      said.textContent = body.text;
      said.classList.toggle("is-refused", !body.ok);
      for (const f of fields) {
        const carried = confirm.querySelector<HTMLInputElement>(`input[data-field="${f.name}"]`);
        if (carried) carried.value = f.value.trim();
      }
      if (body.button) button.textContent = body.button;
      offer(body.ok);
    } catch {
      if (mine !== asked) return;
      said.textContent = "This couldn't be checked just now. Use Preview to try again.";
      said.classList.add("is-refused");
      offer(false);
    }
  };

  for (const f of fields) {
    f.addEventListener("input", () => {
      offer(false);
      clearTimeout(timer);
      timer = setTimeout(preview, 300);
    });
  }
  // Preview without leaving the page.
  check.addEventListener("submit", (event) => {
    event.preventDefault();
    clearTimeout(timer);
    void preview();
  });
});
