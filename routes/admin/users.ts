import route from "primate/route";
import type { components } from "#api/schema.d.ts";
import { getAsReader } from "#auth/signed-in.ts";
import { admin, adminPage, doneSaying, notFound } from "#lib/admin.ts";

type User = components["schemas"]["UserPrincipal"];

export const STATUSES = ["ACTIVE", "SUSPENDED", "ERASED"] as const;
export type Status = (typeof STATUSES)[number];
export const ROLES = ["USER", "ADMIN", "SUPER_ADMIN"] as const;

const SAID = {
  role: (who: string) => `Changed ${who}'s role.`,
  suspended: (who: string) => `Suspended ${who}.`,
  unsuspended: (who: string) => `Unsuspended ${who}.`,
  erased: (who: string) => `Erased ${who}.`,
  purged: (who: string) => `Purged ${who}'s content.`,
};

/** The users with [status], read as the admin, with [error] said at the top. */
export async function usersPage(status: Status, extra: { said?: string; error?: string } = {}, code = 200) {
  let users: User[] | null = null;
  try {
    users = await getAsReader<User[]>("/admin/users", { status });
  } catch {
    users = null;
  }
  return adminPage("AdminUsers.marko", {
    status: status,
    tabs: STATUSES.map((s) => ({ status: s, href: s === "ACTIVE" ? "/admin/users" : `/admin/users?status=${s}`, current: s === status })),
    users: (users || []).map((u) => ({ username: u.username || "", displayName: u.displayName || u.username || "", role: u.role || "USER" })),
    failed: users === null,
    roles: ROLES,
    ...extra,
  }, "Users", "/admin/users", code);
}

export default route({
  get(request) {
    if (!admin()) return notFound();
    const asked = request.query.try("status");
    const status = (STATUSES as readonly string[]).includes(asked || "") ? asked as Status : "ACTIVE";
    return usersPage(status, { said: doneSaying(request.query.try("done"), request.query.try("who"), SAID) });
  },
});
