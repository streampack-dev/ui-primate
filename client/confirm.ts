/* Steps asked first, asked in a dialog. A link with data-confirm goes to a page that asks the
   question (views/Confirm.marko); with script, that page is fetched and its question, form and
   links are shown in a dialog over the page that asked, which stays where it was. The form posts
   as the page's own would. Without script, or if the page can't be had, the link is followed. */
let dialog: HTMLDialogElement | null = null;
let opener: HTMLElement | null = null;

function closed() {
  dialog?.remove();
  dialog = null;
  opener?.focus();
  opener = null;
}

/** The dialog, made the first time it's needed. */
function theDialog(): HTMLDialogElement {
  if (dialog) return dialog;
  dialog = document.createElement("dialog");
  dialog.className = "confirm-dialog";
  dialog.setAttribute("aria-labelledby", "confirm-dialog-title");
  dialog.addEventListener("close", closed);
  // A click on the backdrop, outside the dialog's box, cancels.
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  document.body.append(dialog);
  return dialog;
}

/** The question at [href], shown in the dialog; false if it couldn't be had. */
async function ask(href: string): Promise<boolean> {
  let page: Document;
  try {
    const answer = await fetch(href, { headers: { Accept: "text/html" } });
    if (!answer.ok) return false;
    page = new DOMParser().parseFromString(await answer.text(), "text/html");
  } catch {
    return false;
  }
  const question = page.querySelector(".confirm-page");
  const title = question?.querySelector(".confirm-title");
  const form = question?.querySelector("form");
  if (!question || !title || !form) return false;

  const box = theDialog();
  const heading = document.createElement("h2");
  heading.id = "confirm-dialog-title";
  heading.className = "font-display text-2xl mb-3";
  heading.textContent = title.textContent;
  const body = question.querySelector(".confirm-body");
  const parts: Node[] = [heading];
  if (body) parts.push(document.importNode(body, true));
  const asked = document.importNode(form, true) as HTMLFormElement;
  // Cancel closes the dialog rather than leaving the page.
  const cancel = asked.querySelector<HTMLAnchorElement>(".confirm-cancel");
  if (cancel) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = cancel.className;
    button.textContent = cancel.textContent;
    button.addEventListener("click", () => box.close());
    cancel.replaceWith(button);
  }
  parts.push(asked);
  for (const onward of question.querySelectorAll(":scope > p:has(a[data-confirm])")) parts.push(document.importNode(onward, true));
  box.replaceChildren(...parts);
  if (!box.open) box.showModal();
  (asked.querySelector<HTMLElement>("input:not([type=hidden])") ?? asked.querySelector<HTMLElement>("button[type=submit]"))?.focus();
  return true;
}

document.addEventListener("click", async (event) => {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = (event.target as Element | null)?.closest<HTMLAnchorElement>("a[data-confirm]");
  if (!link) return;
  event.preventDefault();
  if (!dialog) opener = link;
  if (!(await ask(link.href))) location.href = link.href;
});
