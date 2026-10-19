/* Comments on a passage (#65, streampack#256), as Medium, Google Docs and Substack show them, and as
   ui-pudl's bcn-anchors.js does: callouts in the margin, not highlights in the text. The finding
   and placing is the shared clientjs anchors module (streampack-dev/clientjs); this is the site's
   part, on a post's page:

     writing   a selection in the post shows "Comment on this passage" beside it, a real button
               that comes after the post in the tab order. It puts the passage in the comment
               form's hidden fields, shows the quote above the box, and moves focus to the box.
               "Don't quote it" takes the quote out again.
     reading   each comment on a passage that is still in the post gets a light mark on the
               passage. With room beside the post, it gets a callout in the margin, level with
               the passage; comments on one passage share a callout that says how many there are.
               Without room (a phone, a narrow window), a marker after the passage's paragraph
               goes to its comments. The callout or marker and the comment link to each other.
               The comment's own quote is hidden where its callout shows it.

   A comment whose passage an edit removed is left to the server, which marks it "no longer in the
   post". Without script, nothing here happens: the form takes no quote, and the thread shows each
   quote as the API rendered it. */
import { anchorFrom, locate, mark, MAX_EXACT, place, textOf, type Anchor, type Passage } from "@streampack-dev/clientjs/anchors";
import { eachPage } from "./each-page.ts";

/* What this script adds inside a post body, which isn't the post's text. */
const IGNORE = ".anchor-marker";
/* The room, in rem, that the callouts need to the right of the post: 14rem of callout and a rem
   either side. The post never moves to make room: it stays centred, its lines as they were, and
   the callouts use the space beside it, or it gets markers. */
const MARGIN_REM = 16;
const EXCERPT = 140;

const remPx = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;

/* ---- Writing: from a selection to the comment form ---- */

type Asking = { article: HTMLElement; body: HTMLElement; range: Range };
let asking: Asking | null = null;

function articleOf(node: Node | null) {
  const el = node && (node.nodeType === 1 ? (node as Element) : node.parentElement);
  const body = el?.closest<HTMLElement>("[data-anchor-body]");
  const article = body?.closest<HTMLElement>(".post-article");
  return body && article ? { article, body } : null;
}

function hideAsk() {
  if (!asking) return;
  const ask = asking.article.querySelector<HTMLElement>(".anchor-ask");
  if (ask) ask.hidden = true;
  say(asking.article, "");
  asking = null;
}

function say(article: HTMLElement, text: string) {
  const note = article.querySelector("[data-anchor-note]");
  if (note) note.textContent = text;
}

function offer() {
  const sel = document.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
    // Focus on the button itself (the keyboard's way to it) keeps the offer open.
    if (!document.activeElement?.matches("[data-anchor-ask]")) hideAsk();
    return;
  }
  const range = sel.getRangeAt(0);
  const start = articleOf(range.startContainer);
  const end = articleOf(range.endContainer);
  if (!start || !end || start.body !== end.body) return hideAsk();
  const ask = start.article.querySelector<HTMLElement>(".anchor-ask");
  if (!ask || !start.article.querySelector("form.comment-form")) return;
  if (asking && asking.article !== start.article) hideAsk();
  if (asking) say(asking.article, "");
  asking = { article: start.article, body: start.body, range: range.cloneRange() };
  const rects = range.getClientRects();
  const last = rects.length ? rects[rects.length - 1] : range.getBoundingClientRect();
  const box = start.article.getBoundingClientRect();
  ask.hidden = false;
  ask.style.top = `${last.bottom - box.top + 4}px`;
  const left = Math.min(last.right - box.left, box.width - ask.offsetWidth);
  ask.style.left = `${Math.max(0, left - ask.offsetWidth / 2)}px`;
}

let offerQueued = false;
document.addEventListener("selectionchange", () => {
  if (offerQueued) return;
  offerQueued = true;
  requestAnimationFrame(() => { offerQueued = false; offer(); });
});

// Pressing the button mustn't clear the selection it's about.
document.addEventListener("pointerdown", (e) => {
  if ((e.target as Element).closest?.("[data-anchor-ask]")) e.preventDefault();
});

function setQuote(form: HTMLFormElement, anchor: Anchor | null) {
  for (const k of ["exact", "prefix", "suffix"] as const) {
    const field = form.querySelector<HTMLInputElement>(`[data-anchor-field="${k}"]`);
    if (field) field.value = anchor ? (anchor[k] ?? "") : "";
  }
  const quote = form.querySelector<HTMLElement>("[data-comment-quote]");
  if (!quote) return;
  quote.hidden = !anchor;
  const text = quote.querySelector("[data-comment-quote-text]");
  if (text) text.textContent = anchor ? anchor.exact : "";
}

document.addEventListener("click", (e) => {
  const target = e.target as Element;
  if (target.closest?.("[data-anchor-ask]") && asking) {
    const at = asking;
    const made = anchorFrom(at.range, at.body, { ignore: IGNORE });
    if ("refused" in made) {
      say(at.article, made.refused === "empty"
        ? "Select some of the post's text to comment on."
        : `Select at most ${MAX_EXACT} characters to quote; this is ${made.length}.`);
      return;
    }
    const form = at.article.querySelector<HTMLFormElement>("form.comment-form")!;
    setQuote(form, made.anchor);
    hideAsk();
    form.scrollIntoView({ block: "center" });
    form.querySelector<HTMLTextAreaElement>("textarea[name=markdownSource]")?.focus({ preventScroll: true });
    return;
  }
  const remove = target.closest?.("[data-comment-quote-remove]");
  if (remove) {
    const form = remove.closest("form")!;
    setQuote(form, null);
    form.querySelector<HTMLTextAreaElement>("textarea[name=markdownSource]")?.focus();
  }
});

/* ---- Reading: marks, callouts and markers ---- */

function commentsOn(article: HTMLElement) {
  return [...article.querySelectorAll<HTMLElement>(".comment-list > article.comment")]
    .filter((c) => c.querySelector(":scope > .comment-anchor-data")?.getAttribute("data-found") === "true");
}

function anchorOf(comment: HTMLElement): Anchor {
  const data = comment.querySelector(":scope > .comment-anchor-data")!;
  return {
    exact: data.getAttribute("data-exact") ?? "",
    prefix: data.getAttribute("data-prefix") || null,
    suffix: data.getAttribute("data-suffix") || null,
  };
}

/* The comment's own words, without its quote, cut to a line or two. */
function excerpt(comment: HTMLElement) {
  const body = comment.querySelector(":scope > .comment-body");
  if (!body) return "";
  const copy = body.cloneNode(true) as HTMLElement;
  copy.querySelector(":scope > blockquote.comment-anchor")?.remove();
  const text = (copy.textContent ?? "").replace(/\s+/g, " ").trim();
  return text.length > EXCERPT ? `${text.slice(0, EXCERPT - 1).trimEnd()}…` : text;
}

const authorOf = (comment: HTMLElement) => comment.querySelector(":scope > .meta .comment-author")?.textContent?.trim() || "A reader";
const countLabel = (n: number) => (n === 1 ? "1 comment" : `${n} comments`);
const idOf = (comment: HTMLElement) => comment.id.replace(/^comment-/, "");

/* Moves to [el] and focuses it. */
function go(el: HTMLElement) {
  if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
  el.scrollIntoView({ block: "center" });
  el.focus({ preventScroll: true });
}

function linkTo(target: HTMLElement, className: string) {
  const link = document.createElement("a");
  link.className = className;
  link.href = `#${target.id}`;
  link.addEventListener("click", (e) => { e.preventDefault(); go(target); });
  return link;
}

function clear(article: HTMLElement) {
  article.querySelectorAll(".anchor-margin, .anchor-marker, .comment-anchor-link").forEach((el) => el.remove());
  article.querySelectorAll(".comment.anchor-callout-shown").forEach((c) => c.classList.remove("anchor-callout-shown"));
}

function linkBack(comment: HTMLElement, target: HTMLElement) {
  const link = linkTo(target, "comment-anchor-link form-helper");
  link.textContent = "Show the passage";
  comment.querySelector(":scope > .meta")?.append(" ", link);
}

function callout(passage: Passage, group: HTMLElement[]) {
  const aside = document.createElement("aside");
  aside.className = "anchor-callout";
  aside.id = `anchor-callout-${passage.ids[0]}`;
  aside.setAttribute("aria-label", `${countLabel(group.length)} on a passage`);
  for (const comment of group.slice(0, 2)) {
    const link = linkTo(comment, "anchor-callout-link");
    const who = document.createElement("strong");
    who.textContent = authorOf(comment);
    link.append(who, ` ${excerpt(comment)}`);
    aside.append(link);
  }
  if (group.length > 1) {
    const count = linkTo(group[0], "anchor-callout-count");
    count.textContent = countLabel(group.length);
    aside.append(count);
  }
  return aside;
}

function marker(passage: Passage, exact: string, group: HTMLElement[]) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "anchor-marker";
  button.id = `anchor-marker-${passage.ids[0]}`;
  button.setAttribute("aria-label", `${countLabel(group.length)} on the passage “${exact}”`);
  button.textContent = String(group.length);
  button.addEventListener("click", () => go(group[0]));
  return button;
}

/* The block in [body] that the passage ends in, for its marker to follow. */
function blockOf(range: Range, body: HTMLElement) {
  let block: Element | null = range.endContainer.nodeType === 1 ? (range.endContainer as Element) : range.endContainer.parentElement;
  while (block && block.parentElement !== body) block = block.parentElement;
  return block ?? body.lastElementChild;
}

function draw(article: HTMLElement, body: HTMLElement) {
  clear(article);
  const comments = commentsOn(article);
  const byId = new Map(comments.map((c) => [idOf(c), c]));
  const passages = locate(comments.map((c) => ({ id: idOf(c), anchor: anchorOf(c) })), body, { ignore: IGNORE }).found;
  mark(passages.map((p) => p.range));
  if (!passages.length) return;

  const text = textOf(body, { ignore: IGNORE });
  const groupOf = (p: Passage) => p.ids.map((id) => byId.get(id)!);
  const beside = article.parentElement ? article.parentElement.getBoundingClientRect().right - article.getBoundingClientRect().right : 0;
  if (beside >= MARGIN_REM * remPx()) {
    const margin = document.createElement("div");
    margin.className = "anchor-margin";
    article.append(margin);
    const items = passages.map((p) => {
      const group = groupOf(p);
      const el = callout(p, group);
      margin.append(el);
      for (const comment of group) {
        comment.classList.add("anchor-callout-shown");
        linkBack(comment, el);
      }
      return { el, range: p.range };
    });
    const top = margin.getBoundingClientRect().top;
    const spots = place(items.map((it, i) => ({ key: String(i), top: it.range.getBoundingClientRect().top - top, height: it.el.offsetHeight })), { gap: remPx() / 2 });
    spots.forEach((s, i) => { items[i].el.style.top = `${s.top}px`; });
  } else {
    for (const p of passages) {
      const group = groupOf(p);
      const el = marker(p, text.slice(p.start, p.end), group);
      blockOf(p.range, body)?.insertAdjacentElement("afterend", el);
      for (const comment of group) linkBack(comment, el);
    }
  }
}

/* Each post's page is set up once; a new page (Primate's navigation replaces the body) anew. */
const watched = new WeakSet<HTMLElement>();
let pending = 0;

eachPage(() => {
  const body = document.querySelector<HTMLElement>(".post-article > [data-anchor-body]");
  const article = body?.closest<HTMLElement>(".post-article");
  if (!body || !article || watched.has(article)) return;
  watched.add(article);
  asking = null;
  if (!article.querySelector(".comment-list .comment-anchor-data")) return mark([]);

  const redraw = () => {
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(() => { if (article.isConnected) draw(article, body); });
  };
  redraw();
  // The room beside the post decides callouts or markers; the body's place and height move the
  // passages. What's above the body (the title, the tags) can grow as fonts load and push it down.
  let last = "";
  const watcher = new ResizeObserver(() => {
    if (!article.isConnected) return watcher.disconnect();
    const key = [article.parentElement?.clientWidth ?? 0, body.offsetTop, body.offsetHeight].join(" ");
    if (key === last) return;
    last = key;
    redraw();
  });
  watcher.observe(body);
  watcher.observe(article);
  if (article.parentElement) watcher.observe(article.parentElement);
  document.fonts?.ready.then(redraw);
});
