import route from "primate/route";
import { view } from "#lib/view.ts";

export default route({
  get() {
    return view("ProfileDeleted.marko", { meta: { title: "Account deleted" } });
  },
});
