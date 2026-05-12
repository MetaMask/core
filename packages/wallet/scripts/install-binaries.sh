#!/usr/bin/env bash

set -e
set -o pipefail

# Pin cwd to the package root so all paths are predictable regardless of how
# this script is invoked.
PACKAGE_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${PACKAGE_ROOT}"

# Run foundryup's TypeScript entry point directly via tsx. This avoids having
# to build @metamask/foundryup first, which matters in CI where workspace deps
# aren't built before tests run.
if ! output=$(yarn tsx ../foundryup/src/cli.ts --binaries anvil 2>&1); then
  echo "$output" >&2
  exit 1
fi
