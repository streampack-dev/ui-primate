import route from "primate/route";
import { view } from "#lib/view.ts";

export default route({
  get() {
    return view("SubmitThanks.marko", { meta: { title: "Post submitted" } });
  },
});
