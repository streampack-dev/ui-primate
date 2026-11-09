/* resvg, left to node_modules while Primate checks the routes (#112). Primate 0.44 runs each route
   once at build time (build/server/validate-routes.js), bundled without its native-addons plugin,
   so the bundle tries to take in resvg's .node file and the build fails. Only that bundle leaves
   resvg out: it runs on the build host, beside node_modules. The real build still bundles resvg
   and its add-on, since the image carries no node_modules. Delete this module when Primate's route
   check handles native add-ons (primate-bugs/19). */

/** The entry Primate's route check bundles from; no other build has it. */
const VALIDATOR = "primate-validate-routes.ts";

/** The packages with native add-ons that routes import. */
const NATIVE = /^@resvg\/resvg-js$/;

type Build = {
  initialOptions: { stdin?: { sourcefile?: string } };
  onResolve(options: { filter: RegExp }, callback: (args: { path: string }) => { path: string; external: boolean }): void;
};

/** The esbuild plugin: in the route check alone, each NATIVE package is external. */
export const plugin = {
  name: "validate-externals",
  setup(build: Build) {
    if (build.initialOptions.stdin?.sourcefile !== VALIDATOR) return;
    build.onResolve({ filter: NATIVE }, args => ({ path: args.path, external: true }));
  },
};

export default {
  name: "validate-externals",
  setup({ onBuild }: { onBuild: (hook: (app: { plugin(type: string, plugin: unknown): void }) => void) => void }) {
    onBuild(app => app.plugin("server", plugin));
  },
};
