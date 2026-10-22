/* Authors' pages (#88): an author is known by their user id, the UUID the API gives a post as
   authorId (streampack#273), which stays the same when their display name changes. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether [id] is a user id: a UUID. */
export function isUserId(id: string | null | undefined): id is string {
  return !!id && UUID.test(id);
}

/** The address of the author with [id]'s page, or null when there's no id (an older API). */
export function authorHref(id: string | null | undefined): string | null {
  return isUserId(id) ? `/authors/${id.toLowerCase()}` : null;
}
