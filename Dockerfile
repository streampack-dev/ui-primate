# Node 26. Primate 0.41 died under load on Node 24 and 26 (an internal assertion in Node's web
# streams when clients hang up mid-response, primate-bugs/09), which kept the image on 22. Retested
# 2026-10-07: primate 0.42.1 on Node 24.21.0 and 26.10.0 held through ten rounds of the same load
# (autocannon -c 20 -d 5), where 0.41.0 on Node 24 died in the first. 26 is what development runs,
# and has Uint8Array.toHex, which Primate's UUIDs need (primate-bugs/10).

# Build: Primate compiles the routes, Marko views and client assets (fingerprinted) into build/.
FROM node:26-alpine AS build
USER node
WORKDIR /app
COPY --chown=node:node package.json package-lock.json .npmrc ./
RUN npm ci
COPY --chown=node:node . .
# primate build can fail and still exit 0 (primate-bugs/01), so the build is known good only by
# what it leaves.
RUN npx primate build && test -f build/server.js || { echo "The build failed: no build/server.js" >&2; exit 1; }

# The link-preview cards' renderers (#67). src/og/cards.ts loads satori (WebAssembly) and
# @resvg/resvg-js (a native add-on, its musl binary chosen here, on Alpine) from node_modules at run
# time, not from the bundle, so the runner needs these two and nothing else: at the versions the
# lockfile pins, with package.json's overrides.
FROM node:26-alpine AS cards
USER node
WORKDIR /app
COPY --chown=node:node package.json package-lock.json ./
RUN mkdir cards && node -e ' \
      const pkg = require("./package.json"), locked = require("./package-lock.json").packages; \
      const names = ["satori", "@resvg/resvg-js"]; \
      const dependencies = Object.fromEntries(names.map((n) => [n, locked["node_modules/" + n].version])); \
      require("fs").writeFileSync("cards/package.json", JSON.stringify({ private: true, dependencies, overrides: pkg.overrides || {} }))' \
    && cd cards && npm install --omit=dev --no-audit --no-fund && npm cache clean --force

# Run: the build and the cards' renderers, no sources, as an unprivileged user. Everything
# that varies (BCN_API_BASE, BCN_ACCEPT_VERSION, PORT) is read at run time.
FROM node:26-alpine AS runner
USER nobody
WORKDIR /app
ARG UI_COMMIT=unknown
ARG UI_BRANCH=unknown
ENV NODE_ENV=production PORT=3000 UI_COMMIT=${UI_COMMIT} UI_BRANCH=${UI_BRANCH}
COPY --from=build --chown=nobody:nobody /app/build ./build
COPY --from=build --chown=nobody:nobody /app/config ./config
# The link-preview cards' fonts and images (src/og/cards.ts reads them at run time).
COPY --from=build --chown=nobody:nobody /app/assets ./assets
COPY --from=cards --chown=nobody:nobody /app/cards/node_modules ./node_modules
EXPOSE 3000
# Under the permission model, node_modules must be readable and resvg's add-on allowed (#67).
CMD ["node", "--permission", "--allow-fs-read=build", "--allow-fs-read=config", "--allow-fs-read=assets", "--allow-fs-read=node_modules", "--allow-addons", "--allow-fs-read=.env.local", "--allow-fs-read=.env", "--allow-fs-read=.env.production.local", "--allow-fs-read=.env.production", "--allow-net", "build/server.js"]
