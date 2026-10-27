# .env is the running app's configuration, so it's loaded only where the app runs, never for builds
# or tests: tests must not see it (as ui-pudl).
app_env := 'set -a; if [ -f .env ]; then . ./.env; fi; set +a;'

default:
    @just --list

clean:
    rm -rf build node_modules

# Install the packages package-lock.json pins (#84): `npm ci`, when node_modules is missing or older
# than package.json or the lockfile. Without it, a fresh checkout or worktree fails, or, worse, Node
# finds a parent directory's node_modules and runs on its versions. npm ci deletes and reinstalls
# everything, so it isn't run when nothing changed; `just clean` forces it.
_deps:
    #!/usr/bin/env sh
    set -eu
    installed=node_modules/.package-lock.json
    if [ ! -f "$installed" ] || [ package-lock.json -nt "$installed" ] || [ package.json -nt "$installed" ]; then
      npm ci
    fi

# Pages are drawn in the browser here; a production build renders them on the server (config/app.ts).
# Run locally with live reload, against BCN_API_BASE (default the live API, read-only)
dev: _deps
    {{app_env}} UI_DEV=1 npx primate

# Build for production: server-rendered pages, fingerprinted assets, in build/.
build: _deps
    npx primate build

# Run the production build locally, against BCN_API_BASE (default the live API, read-only).
run: build
    {{app_env}} npx primate serve

# The Node the image runs (the Dockerfile's FROM), which the tests run the app on.
node_major := `sed -n 's/^FROM node:\([0-9]*\)-alpine.*/\1/p' Dockerfile | head -1`

# Run the tests, the app on the Node the image ships with. They start their own Postgres
# (Testcontainers), so Docker must be running.
test: _deps
    UI_TEST_NODE="$(npx -y node@{{node_major}} -p process.execPath | tail -1)" npm test

# Run every test and report coverage (#43): the target is 70% of lines, reported, not enforced. The
# served app's coverage is mapped back to the sources through the build's source map; the browser
# scripts in client/ run in the browser and aren't counted. The report is in coverage/.
coverage: _deps
    rm -rf coverage coverage-raw
    UI_TEST_NODE="$(npx -y node@{{node_major}} -p process.execPath | tail -1)" NODE_V8_COVERAGE="$PWD/coverage-raw" npm test
    node tools/coverage-report.mjs

# Create ui-primate's own database for development, on streampack's local Postgres
# (streampack's `docker compose up -d db`), as BCN_DB_URL in .env.default names it.
create-db:
    docker compose -f ../streampack/docker-compose.yml exec -T db psql -U nevet -d nevet -c 'CREATE DATABASE ui_primate'

# Fetch the site's fonts again from Google Fonts and self-host them (tools/fonts.mjs): the faces
# every page uses into client/fonts (bundled and preloaded), the rest into static/fonts.
fonts:
    node tools/fonts.mjs

# The fonts Mermaid diagrams are drawn in (#61): IBM Plex Sans, and the Plex Mono faces the site
# doesn't load from Google, as IBM ships them, into static/diagram-fonts/. Keep them at the versions
# streampack bundles (its just update-plex), whose metrics the API measured every label with.
# npm pack runs no package scripts.
diagram-fonts sans="1.1.0" mono="2.5.0":
    #!/usr/bin/env bash
    set -euo pipefail
    work="$(mktemp -d)"
    trap 'rm -rf "$work"' EXIT
    target="static/diagram-fonts"
    mkdir -p "$work/sans" "$work/mono"
    (cd "$work/sans" && npm pack "@ibm/plex-sans@{{sans}}" --silent >/dev/null && tar xzf ibm-plex-sans-*.tgz)
    (cd "$work/mono" && npm pack "@ibm/plex-mono@{{mono}}" --silent >/dev/null && tar xzf ibm-plex-mono-*.tgz)
    rm -rf "$target"
    mkdir -p "$target"
    for face in Regular Bold Italic BoldItalic; do
      cp "$work/sans/package/fonts/complete/woff2/IBMPlexSans-$face.woff2" "$target/"
    done
    for face in Bold Italic BoldItalic; do
      cp "$work/mono/package/fonts/complete/woff2/IBMPlexMono-$face.woff2" "$target/"
    done
    cp "$work/sans/package/LICENSE.txt" "$target/IBM-Plex-OFL.txt"
    echo "IBM Plex Sans {{sans}} and IBM Plex Mono {{mono}} into $target"

# Refresh the committed OpenAPI snapshot from the API, and the types generated from it.
refresh-spec:
    {{app_env}} curl -sSf "${BCN_API_BASE:-https://api.bytecode.news}/v3/api-docs" | python3 -m json.tool --indent 2 > spec/openapi.json
    npx openapi-typescript spec/openapi.json -o src/api/schema.d.ts

# Move to a release of streampack-dev/masthead from Nexus: the newest by default, or the version
# given. Kept in package.json as ^version, as ui-pudl keeps masthead.version.
# Update the masthead animations
update-masthead version="":
    #!/usr/bin/env bash
    set -euo pipefail
    version="{{version}}"
    version="${version#v}"
    npm install --save "@streampack-dev/masthead@${version:-latest}"
    echo "Updated masthead to $(node -p "require('./node_modules/@streampack-dev/masthead/package.json').version")"
    git status --short package.json package-lock.json

# Log in to the Docker registry. Uses DOCKER_USERNAME/DOCKER_PASSWORD first, then ~/.m2/settings.xml.
docker-login:
    #!/usr/bin/env bash
    set -euo pipefail

    registry="${IMAGE_REGISTRY:-nexus.streampack.dev}"
    username="${DOCKER_USERNAME:-}"
    password="${DOCKER_PASSWORD:-}"

    if [[ -z "$username" || -z "$password" ]]; then
      settings="${MAVEN_SETTINGS:-$HOME/.m2/settings.xml}"
      server_id="${MAVEN_DOCKER_SERVER_ID:-nexus-streampack}"

      if [[ ! -f "$settings" ]]; then
        echo "No Maven settings file found at $settings; set DOCKER_USERNAME and DOCKER_PASSWORD instead." >&2
        exit 1
      fi
      if ! command -v xmllint >/dev/null 2>&1; then
        echo "xmllint is required to read $settings; set DOCKER_USERNAME and DOCKER_PASSWORD instead." >&2
        exit 1
      fi

      username="$(xmllint --xpath "string(/*[local-name()='settings']/*[local-name()='servers']/*[local-name()='server'][*[local-name()='id']='$server_id']/*[local-name()='username'])" "$settings")"
      password="$(xmllint --xpath "string(/*[local-name()='settings']/*[local-name()='servers']/*[local-name()='server'][*[local-name()='id']='$server_id']/*[local-name()='password'])" "$settings")"

      if [[ -z "$username" || -z "$password" ]]; then
        echo "No credentials found for Maven server '$server_id' in $settings; set MAVEN_DOCKER_SERVER_ID or DOCKER_USERNAME/DOCKER_PASSWORD." >&2
        exit 1
      fi
      if [[ "$password" == \{* ]]; then
        echo "Maven server '$server_id' appears to use an encrypted password; set DOCKER_PASSWORD or run docker login manually." >&2
        exit 1
      fi
    fi

    printf '%s' "$password" | docker login "$registry" --username "$username" --password-stdin

# The tag, if given, must match package.json's version. DOCKER_PUSH_LATEST=false skips latest;
# DOCKER_PUSH=false builds a local image instead of pushing (as ui-pudl).
# IMAGE_REGISTRY/IMAGE_REPOSITORY override where it goes.
# Build the multi-platform image and push it to Nexus as the package version and as latest
image tag="":
    #!/usr/bin/env bash
    set -euo pipefail

    version="{{tag}}"
    pkg_version="$(node -p "require('./package.json').version")"
    if [[ -z "$version" ]]; then
      version="$pkg_version"
    elif [[ "$version" != "$pkg_version" ]]; then
      echo "Tag '$version' does not match package.json version '$pkg_version'. Update package.json first." >&2
      exit 1
    fi

    registry="${IMAGE_REGISTRY:-nexus.streampack.dev}"
    repository="${IMAGE_REPOSITORY:-images/ui-primate}"
    image="${registry}/${repository}"
    platforms="${DOCKER_PLATFORMS:-linux/amd64,linux/arm64}"
    builder="${DOCKER_BUILDX_BUILDER:-streampack-builder}"
    commit="${UI_COMMIT:-$(git rev-parse --short HEAD 2>/dev/null || printf unknown)}"
    branch="${UI_BRANCH:-$(git rev-parse --abbrev-ref HEAD 2>/dev/null || printf unknown)}"

    build_args=(--build-arg "UI_COMMIT=$commit" --build-arg "UI_BRANCH=$branch")
    labels=(
      --label "org.opencontainers.image.title=ui-primate"
      --label "org.opencontainers.image.version=${version}"
      --label "org.opencontainers.image.revision=${commit}"
      --label "org.opencontainers.image.source=https://github.com/streampack-dev/ui-primate"
    )
    tags=(-t "${image}:${version}")
    if [[ "${DOCKER_PUSH_LATEST:-true}" == "true" ]]; then
      tags+=(-t "${image}:latest")
    fi

    if [[ "${DOCKER_PUSH:-true}" != "true" ]]; then
      docker build "${build_args[@]}" "${labels[@]}" "${tags[@]}" .
      exit 0
    fi

    if [[ "${DOCKER_LOGIN:-true}" == "true" ]]; then
      just docker-login
    fi

    if ! docker buildx inspect "$builder" >/dev/null 2>&1; then
      docker buildx create --name "$builder" --use >/dev/null
    else
      docker buildx use "$builder" >/dev/null
    fi
    docker buildx inspect --bootstrap >/dev/null

    docker buildx build --platform "$platforms" "${build_args[@]}" "${labels[@]}" "${tags[@]}" --push .
    echo "Pushed ${image}:${version}$([[ "${DOCKER_PUSH_LATEST:-true}" == "true" ]] && printf ' and :latest')"

# Build the image locally (not pushed) and check that it serves a link-preview card (#67). The
# tests run the app with the repository's node_modules, so only the image itself shows what it
# lacks. Run it before a release that touches the Dockerfile.
smoke-image:
    #!/usr/bin/env bash
    set -euo pipefail
    docker build -q -t ui-primate:smoke . >/dev/null
    id="$(docker run -d --rm -p 127.0.0.1::3000 ui-primate:smoke)"
    trap 'docker stop "$id" >/dev/null' EXIT
    port="$(docker port "$id" 3000/tcp | head -1 | sed 's/.*://')"
    for _ in $(seq 1 60); do curl -s -o /dev/null "http://127.0.0.1:$port/og/site.png" && break; sleep 0.5; done
    answer="$(curl -s -o /dev/null -w '%{http_code} %{content_type}' "http://127.0.0.1:$port/og/site.png")"
    if [[ "$answer" != "200 image/png" ]]; then
      echo "The image's /og/site.png answered: $answer" >&2
      docker logs "$id" 2>&1 | tail -20 >&2
      exit 1
    fi
    echo "The image serves link-preview cards: $answer"

# Releases come from main, up to date with origin's: never from a feature branch.
_on-main:
    #!/usr/bin/env bash
    set -euo pipefail
    branch="$(git branch --show-current)"
    if [[ "$branch" != "main" ]]; then
      echo "Release from main, not ${branch:-a detached HEAD}." >&2
      exit 1
    fi
    git fetch -q origin main
    if [[ -n "$(git rev-list HEAD..origin/main)" ]]; then
      echo "main is behind origin/main. Pull first." >&2
      exit 1
    fi

# A -SNAPSHOT version releases as itself first (0.1.0-SNAPSHOT -> 0.1.0); after that, level is
# patch, minor or major. Refuses an uncommitted package.json, and puts it back if anything fails,
# so a retry doesn't bump again (as ui-pudl).
# Release: bump the version in package.json and push its image (just image)
release level="patch": _on-main
    #!/usr/bin/env bash
    set -euo pipefail
    level="{{level}}"
    files=(package.json package-lock.json)
    case "$level" in
      patch|minor|major) ;;
      *) echo "release level must be one of: patch, minor, major" >&2; exit 1 ;;
    esac

    if ! git diff --quiet -- "${files[@]}"; then
      echo "package.json or package-lock.json has uncommitted changes (a failed release?). Commit or restore it first." >&2
      exit 1
    fi

    current="$(node -p "require('./package.json').version")"
    if [[ "$current" == *-SNAPSHOT ]]; then
      next="${current%-SNAPSHOT}"
    else
      IFS=. read -r major minor patch <<<"$current"
      if [[ -z "${major:-}" || -z "${minor:-}" || -z "${patch:-}" ]]; then
        printf 'current version is not semantic: <%s>\n' "$current" >&2
        exit 1
      fi
      case "$level" in
        patch) next="${major}.${minor}.$((patch + 1))" ;;
        minor) next="${major}.$((minor + 1)).0" ;;
        major) next="$((major + 1)).0.0" ;;
      esac
    fi

    echo "Releasing $current -> $next"
    trap 'status=$?; if [[ $status -ne 0 ]]; then git checkout -- "${files[@]}"; echo "Release failed; package.json restored to $current." >&2; fi' EXIT
    npm version "$next" --no-git-tag-version >/dev/null
    just image "$next"
    echo "Released $next. Commit package.json and package-lock.json."

# The whole release, as it's done from the shell: release, then commit the new version in
# package.json and package-lock.json and push it. Each step runs only if the one before it worked.
full-release level="patch":
    just release {{level}}
    git add package*.json
    git commit -m "Updating version"
    git push

