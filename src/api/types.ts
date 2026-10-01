/* The API's shapes, by name, from its spec. */
import type { components } from "./schema.d.ts";

type S = components["schemas"];
export type Features = S["FeaturesResponse"];
export type ContentList = S["ContentListResponse"];
export type ContentSummary = S["ContentSummary"];
export type ContentDetail = S["ContentDetail"];
export type CommentThread = S["CommentThreadResponse"];
export type CommentNode = S["CommentNode"];
