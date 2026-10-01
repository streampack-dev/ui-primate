import marko from "@primate/marko";
import tailwind from "@primate/tailwind";
import config from "primate/config";

export default config({
  modules: [
    // Pages are rendered on the server and ship no framework runtime, as ui-pudl's do; the few
    // interactive parts are small scripts in client/. Under `just dev` (UI_DEV=1) the runtime is
    // on, because Primate's dev server renders Marko only in the browser, for live reload.
    marko({ csr: process.env.UI_DEV === "1" }),
    // Watched for live reload; Tailwind v4 finds the classes in these itself.
    tailwind({ content: ["./views/**/*.marko", "./client/**/*.ts"] }),
  ],
  http: {
    host: "0.0.0.0",
    port: Number.parseInt(process.env.PORT || "3000", 10),
  },
  // Bundled from client/, fingerprinted in production, and placed by templates/app.html.
  entrypoints: {
    css: "master.css",
    theme: "theme.ts",
    masthead: "masthead.ts",
    read: "read.ts",
    highlight: "highlight.ts",
  },
});
