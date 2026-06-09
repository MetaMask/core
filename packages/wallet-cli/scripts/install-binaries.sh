#!/usr/bin/env bash

set -e
set -o pipefail

# Pin cwd to the package root so all paths are predictable regardless of how
# this script is invoked. Also derive the monorepo root (two levels up).
PACKAGE_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MONOREPO_ROOT="$(cd "${PACKAGE_ROOT}/../.." && pwd)"
cd "${PACKAGE_ROOT}"

# Install the better-sqlite3 native addon if missing. Yarn has
# `enableScripts: false` globally, so install scripts never run during
# `yarn install` and the addon may be absent from the filesystem. Invoke the
# prebuild-install binary directly to fetch a matching prebuild for the active
# Node version and platform.
BETTER_SQLITE3_DIR="${MONOREPO_ROOT}/node_modules/better-sqlite3"
if [ ! -f "${BETTER_SQLITE3_DIR}/build/Release/better_sqlite3.node" ]; then
  (
    cd "${BETTER_SQLITE3_DIR}"
    "${MONOREPO_ROOT}/node_modules/.bin/prebuild-install"
  )
fi
