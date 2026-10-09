import marko from "@primate/marko";
import tailwind from "@primate/tailwind";
import config from "primate/config";
import assetCache from "../src/lib/asset-cache.ts";

export default config({
  modules: [
    // First, so it's around everything: how long browsers keep Primate's own files.
    assetCache as never,
    // Pages are rendered on the server, and the client runtime takes over from there: following a
    // link, or going back, fetches the next page's data and redraws the body in place, without
    // loading a new document. The page's interactive parts are small scripts in client/, which set
    // up each page shown that way as well as the first (client/each-page.ts).
    marko(),
    // Watched for live reload; Tailwind v4 finds the classes in these itself.
    tailwind({ content: ["./views/**/*.marko", "./client/**/*.ts"] }),
  ],
  http: {
    host: "0.0.0.0",
    port: Number.parseInt(process.env.PORT || "3000", 10),
  },
  // Fonts that client/ CSS points at are emitted as files, fingerprinted, and preloaded on every
  // page (Primate preloads each woff2 it bundles): the faces every page uses (tools/fonts.mjs).
  loaders: { ".woff2": "file" },
  // Bundled from client/, fingerprinted in production, and placed by templates/app.html.
  entrypoints: {
    css: "master.css",
    theme: "theme.ts",
    masthead: "masthead.ts",
    read: "read.ts",
    highlight: "highlight.ts", editor: "editor.ts", confirm: "confirm.ts", atlas: "atlas.ts", tagAsk: "tag-ask.ts", rate: "rate.ts",
  },
});
