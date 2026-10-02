import route from "primate/route";
import { cachedGet, send } from "#api/client.ts";
import type { components } from "#api/schema.d.ts";
import { csrfOk } from "#auth/readers.ts";
import { bearer } from "#auth/signed-in.ts";
import { act, admin, confirmPage, notFound } from "#lib/admin.ts";
import { categoriesPage } from "../../categories.ts";

type Category = components["schemas"]["CategorySummary"];
const ID = /^[0-9a-f-]{36}$/i;

export default route({
  async get(request) {
    const id = request.path.get("id");
    if (!admin() || !ID.test(id)) return notFound();
    const category = ((await cachedGet<Category[]>("/categories").catch(() => null)) || []).find((c) => c.id === id);
    if (!category) return notFound();
    return confirmPage({
      title: `Delete the “${category.name}” category?`,
      body: "Posts filed under it keep their place; the category stops being offered.",
      action: `/admin/categories/${id}/delete`, button: "Delete", back: "/admin/categories",
    });
  },

  async post(request) {
    const id = request.path.get("id");
    if (!admin() || !ID.test(id)) return notFound();
    const form = await request.body.form() as Record<string, string>;
    if (!csrfOk(form.csrf)) return new Response("Forbidden", { status: 403 });
    return act((a) => send("DELETE", `/admin/categories/${id}`, undefined, bearer(a)), "/admin/categories?done=deleted",
      (error, status) => categoriesPage({ error }, status), "The category wasn't deleted.");
  },
});
