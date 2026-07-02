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
# `yarn install` and the addon may be absent from the filesystem. Reproduce
# better-sqlite3's own install step (`prebuild-install || node-gyp rebuild
# --release`): fetch a matching prebuild for the active Node version and
# platform, and fall back to compiling from source when no prebuild is
# published for that ABI/libc combination (e.g. some Linux CI runners).
BETTER_SQLITE3_DIR="${MONOREPO_ROOT}/node_modules/better-sqlite3"
if [ ! -f "${BETTER_SQLITE3_DIR}/build/Release/better_sqlite3.node" ]; then
  (
    cd "${BETTER_SQLITE3_DIR}"
    if ! "${MONOREPO_ROOT}/node_modules/.bin/prebuild-install"; then
      echo "wallet-cli: prebuild-install failed (see its output above); compiling better-sqlite3 from source. This needs a C/C++ toolchain and Python." >&2
      "${MONOREPO_ROOT}/node_modules/.bin/node-gyp" rebuild --release
    fi
  )
fi
