import response from "primate/response";
import route from "primate/route";
import { meta } from "#lib/meta.ts";

export default route({
  get() {
    return response.view("ProfileDeleted.marko", {}, { placeholders: { meta: meta({ title: "Account deleted" }) } });
  },
});
