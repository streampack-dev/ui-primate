/* Admins' ratings of RSS items (#27, streampack#187/#188): Rates, Might or Dull, set by a button on
   the reader and cleared by pressing the one already set. Only the admin's own label is ever shown:
   the API's items for admins never carry the model's guess, and nothing here asks for it. */

export const RATINGS = [
  { value: "RATES", label: "Rates" },
  { value: "MIGHT", label: "Might" },
  { value: "DULL", label: "Dull" },
] as const;

export type Rating = (typeof RATINGS)[number]["value"];

/** The value a button sends to clear the rating it shows. */
export const CLEAR = "NONE";

/** The reader's ?rating= filter, as the API takes it, for admins: "" (all), unrated, rates, might, dull. */
export const FILTERS = [
  { value: "", label: "All" },
  { value: "unrated", label: "Unrated" },
  { value: "rates", label: "Rates" },
  { value: "might", label: "Might" },
  { value: "dull", label: "Dull" },
] as const;

/** [asked] as a filter, or "" (all) for anything that isn't one. */
export function ratingFilter(asked: string | undefined): string {
  const v = (asked || "").trim().toLowerCase();
  return FILTERS.some((f) => f.value === v) ? v : "";
}

export const isRating = (v: unknown): v is Rating => RATINGS.some((r) => r.value === v);

/** What the reader says of an item's rating, in words: "Unrated", or "Rated Might by ed". */
export function ratingSaid(rating: string | null | undefined, ratedBy?: string | null): string {
  const r = RATINGS.find((x) => x.value === rating);
  if (!r) return "Unrated";
  return `Rated ${r.label}${ratedBy ? ` by ${ratedBy}` : ""}`;
}

/** The anchor an item is drawn with, to come back to after rating it. */
export const itemAnchor = (id: string) => `item-${id}`;

/** Where a rating form returns to: the reader's own address as given ([back]), else the reader. */
export function backTo(back: unknown): string {
  if (typeof back !== "string") return "/rss";
  const path = back.split("#")[0];
  return path === "/rss" || path.startsWith("/rss?") ? path : "/rss";
}
