/* The profile page, drawn for a visit and again for a refused form, with what was typed. */
import { csrf, current } from "#auth/readers.ts";
import { view } from "#lib/view.ts";

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
  return view("Profile.marko", {
    reader,
    csrf: csrf(),
    ...state,
    nameDraft: state.nameDraft ?? reader.displayName,
    meta: { title: "Profile" },
  }, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}
