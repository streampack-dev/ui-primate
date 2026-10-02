/* The profile page, drawn for a visit and again for a refused form, with what was typed. */
import response from "primate/response";
import { csrf, current } from "#auth/readers.ts";
import { meta } from "#lib/meta.ts";

export const SIGN_IN = "/login?return=%2Fprofile";

export type ProfileState = {
  status?: string;
  nameError?: string;
  nameDraft?: string;
  deleteOpen?: boolean;
  deleteError?: string;
  confirmDraft?: string;
  exportError?: string;
};

export function profilePage(state: ProfileState = {}, status = 200) {
  const reader = current()!;
  return response.view("Profile.marko", {
    reader,
    csrf: csrf(),
    ...state,
    nameDraft: state.nameDraft ?? reader.displayName,
  }, {
    status,
    headers: { "Cache-Control": "private, no-store" },
    placeholders: { meta: meta({ title: "Profile" }) },
  });
}
