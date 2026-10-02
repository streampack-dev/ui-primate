# .env is the running app's configuration, so it's loaded only where the app runs, never for builds
# or tests: tests must not see it (as ui-pudl).
app_env := 'set -a; if [ -f .env ]; then . ./.env; fi; set +a;'

default:
    @just --list

clean:
    rm -rf build node_modules

# Pages are drawn in the browser here; a production build renders them on the server (config/app.ts).
# Run locally with live reload, against BCN_API_BASE (default the live API, read-only)
dev:
    {{app_env}} UI_DEV=1 npx primate

# Build for production: server-rendered pages, fingerprinted assets, in build/.
build:
    npx primate build
    @# primate build can fail and still exit 0 (primate-bugs/01): known good only by what it leaves.
    @test -f build/server.js || { echo "The build failed: no build/server.js" >&2; exit 1; }

# Run the production build locally, against BCN_API_BASE (default the live API, read-only).
run: build
    {{app_env}} npx primate serve

# The Node the image runs (the Dockerfile's FROM), which the tests run the app on.
node_major := `sed -n 's/^FROM node:\([0-9]*\)-alpine.*/\1/p' Dockerfile | head -1`

# Run the tests, the app on the Node the image ships with. They start their own Postgres
# (Testcontainers), so Docker must be running.
test:
    UI_TEST_NODE="$(npx -y node@{{node_major}} -p process.execPath | tail -1)" npm test

# Create ui-primate's own database for development, on streampack's local Postgres
# (streampack's `docker compose up -d db`), as BCN_DB_URL in .env.default names it.
create-db:
    docker compose -f ../streampack/docker-compose.yml exec -T db psql -U nevet -d nevet -c 'CREATE DATABASE ui_primate'

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
