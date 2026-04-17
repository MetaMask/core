#!/usr/bin/env bash

set -e
set -o pipefail

# Pin cwd to the package root so all paths are predictable regardless of how
# this script is invoked. Also derive the monorepo root (two levels up).
PACKAGE_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MONOREPO_ROOT="$(cd "${PACKAGE_ROOT}/../.." && pwd)"
cd "${PACKAGE_ROOT}"

# Run foundryup's TypeScript entry point directly via tsx. This avoids having
# to build @metamask/foundryup first, which matters in CI where workspace deps
# aren't built before tests run.
if ! output=$(yarn tsx ../foundryup/src/cli.ts --binaries anvil 2>&1); then
  echo "$output" >&2
  exit 1
fi

# Rebuild better-sqlite3's native addon if it can't be loaded. This is
# necessary when switching Node versions or branches where the prebuilt binary
# is missing or incompatible.
if ! node -e "require('better-sqlite3')" 2>/dev/null; then
  echo "Rebuilding better-sqlite3 native addon..."
  (cd "${MONOREPO_ROOT}/node_modules/better-sqlite3" && "${MONOREPO_ROOT}/node_modules/.bin/prebuild-install")
fi
