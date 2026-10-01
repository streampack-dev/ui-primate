/* A reader opened a post: say so (routes/read), toward Popular Reads. Without script, it isn't
   counted, as with any reader who blocks it. */
const post = document.querySelector<HTMLElement>("[data-read-post]")?.dataset.readPost;
if (post) {
  const path = `/read/${encodeURIComponent(post)}`;
  if (!navigator.sendBeacon?.(path)) void fetch(path, { method: "POST", keepalive: true });
}
