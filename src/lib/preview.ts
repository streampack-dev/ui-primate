/* The editor's preview, rendered here so writing a post puts no load on the API (as ui-pudl's
   MarkdownPreview does). streampack renders with flexmark, which JavaScript hasn't got, so this is
   markdown-it set up as near it as it goes: tables, bare links, strikethrough, task lists,
   footnotes, and [[factoid]] links; raw HTML shown as typed; and the API's sanitizer's safelist
   after. It's close, not exact (asides and admonitions aren't drawn); what's saved is always
   rendered by the API. */
import MarkdownIt from "markdown-it";
import footnote from "markdown-it-footnote";
import taskLists from "markdown-it-task-lists";
import sanitize from "sanitize-html";

const md = new MarkdownIt({ html: false, linkify: true, typographer: false })
  .use(footnote)
  .use(taskLists, { enabled: false });

/* [[name]]: a link to the factoid, as streampack's wiki links are (/factoids/name; +, /, < and >
   in the name become -). */
md.inline.ruler.before("link", "factoid", (state, silent) => {
  const src = state.src.slice(state.pos);
  const match = /^\[\[([^\]\n]+)\]\]/.exec(src);
  if (!match) return false;
  if (!silent) {
    const name = match[1].trim();
    const open = state.push("link_open", "a", 1);
    open.attrSet("href", `/factoids/${encodeURIComponent(name.replace(/[+/<>]/g, "-"))}`);
    state.push("text", "", 0).content = name;
    state.push("link_close", "a", -1);
  }
  state.pos += match[0].length;
  return true;
});

/* As the API's RenderedHtmlSanitizer: what the extensions produce, and only http, https and
   mailto links, http and https images, and relative addresses. */
const SAFELIST: sanitize.IOptions = {
  allowedTags: [
    "a", "b", "blockquote", "br", "caption", "cite", "code", "col", "colgroup", "dd", "div", "dl", "dt", "em",
    "h1", "h2", "h3", "h4", "h5", "h6", "i", "img", "li", "ol", "p", "pre", "q", "small", "span", "strike",
    "strong", "sub", "sup", "table", "tbody", "td", "tfoot", "th", "thead", "tr", "u", "ul",
    "hr", "del", "s", "ins", "aside", "input", "section", "details", "summary",
  ],
  allowedAttributes: {
    "*": ["class", "id"],
    a: ["href", "title", "rel", "target"],
    img: ["src", "alt", "title", "width", "height"],
    input: ["type", "checked", "disabled", "readonly"],
    th: ["align"],
    td: ["align"],
    ol: ["start", "type"],
  },
  allowedSchemesByTag: { a: ["http", "https", "mailto"], img: ["http", "https"] },
  allowProtocolRelative: false,
};

export function preview(markdown: string): string {
  if (!markdown.trim()) return "";
  return sanitize(md.render(markdown), SAFELIST).trim();
}
