# Node 22, deliberately: on Node 24 and 26 the server dies under load, an internal assertion in Node's
# web streams (writableStreamDefaultControllerGetChunkSize) when clients hang up mid-response
# (primate-bugs/09). Checked 2026-10-01 with three rounds of load against each; 22 held, 24 and 26 didn't.

# Build: Primate compiles the routes, Marko views and client assets (fingerprinted) into build/.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY . .
# primate build can fail and still exit 0 (primate-bugs/01), so the build is known good only by
# what it leaves.
RUN npx primate build && test -f build/server.js || { echo "The build failed: no build/server.js" >&2; exit 1; }

# Run: the build and the production dependencies, no sources, as an unprivileged user. Everything
# that varies (BCN_API_BASE, BCN_ACCEPT_VERSION, PORT) is read at run time.
FROM node:22-alpine AS runner
WORKDIR /app
ARG UI_COMMIT=unknown
ARG UI_BRANCH=unknown
ENV NODE_ENV=production PORT=3000 UI_COMMIT=${UI_COMMIT} UI_BRANCH=${UI_BRANCH}
COPY package.json package-lock.json .npmrc ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/build ./build
COPY --from=build /app/config ./config
# The link-preview cards' fonts and images (src/og/cards.ts reads them at run time).
COPY --from=build /app/assets ./assets
USER node
EXPOSE 3000
CMD ["npx", "primate", "serve"]
