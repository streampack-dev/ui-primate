import route from "primate/route";
import { cachedGet, send } from "#api/client.ts";
import type { components } from "#api/schema.d.ts";
import { csrfOk } from "#auth/readers.ts";
import { bearer } from "#auth/signed-in.ts";
import { act, admin, adminPage, doneSaying, notFound } from "#lib/admin.ts";

type Category = components["schemas"]["CategorySummary"];

const SAID = { created: () => "Category created.", deleted: () => "Category deleted." };

/** The categories, each with its subcategories, and the form for a new one, [form] shown again. */
export async function categoriesPage(extra: { said?: string; error?: string; name?: string; parentId?: string } = {}, status = 200) {
  let all: Category[] = [];
  let failed = false;
  try {
    all = (await cachedGet<Category[]>("/categories")) || [];
  } catch {
    failed = true;
  }
  const named = all.filter((c) => c.id && c.name);
  const top = named.filter((c) => !c.parentName || !named.some((p) => p.name === c.parentName));
  return adminPage("AdminCategories.marko", {
    failed,
    categories: top.map((c) => ({
      id: c.id!, name: c.name!, orphanOf: c.parentName || null,
      children: named.filter((s) => s.parentName === c.name).map((s) => ({ id: s.id!, name: s.name! })),
    })),
    parents: top.filter((c) => !c.parentName).map((c) => ({ id: c.id!, name: c.name! })),
    ...extra,
  }, "Categories", "/admin/categories", status);
}

export default route({
  get(request) {
    if (!admin()) return notFound();
    return categoriesPage({ said: doneSaying(request.query.try("done"), undefined, SAID) });
  },

  async post(request) {
    if (!admin()) return notFound();
    const form = await request.body.form() as Record<string, string>;
    if (!csrfOk(form.csrf)) return new Response("Forbidden", { status: 403 });
    const name = (form.name || "").trim();
    const parentId = /^[0-9a-f-]{36}$/i.test(form.parentId || "") ? form.parentId : null;
    if (!name) return categoriesPage({ error: "Give the category a name.", name: "", parentId: parentId ?? "" }, 400);
    return act((a) => send("POST", "/admin/categories", { name, parentId }, bearer(a)), "/admin/categories?done=created",
      (error, status) => categoriesPage({ error, name, parentId: parentId ?? "" }, status), "The category wasn't created.");
  },
});
