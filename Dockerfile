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

# Run: the build, no sources or node_modules, as an unprivileged user. Everything that varies
# (BCN_API_BASE, BCN_ACCEPT_VERSION, PORT) is read at run time.
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
EXPOSE 3000
# Under the permission model, resvg's bundled native add-on must be allowed (#67).
CMD ["node", "--permission", "--allow-fs-read=build", "--allow-fs-read=config", "--allow-fs-read=assets", "--allow-addons", "--allow-fs-read=.env.local", "--allow-fs-read=.env", "--allow-fs-read=.env.production.local", "--allow-fs-read=.env.production", "--allow-net", "build/server.js"]
