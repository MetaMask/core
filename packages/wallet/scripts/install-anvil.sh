#!/usr/bin/env bash

set -e
set -o pipefail

# mm-foundryup installs anvil to `<cwd>/node_modules/.bin/anvil`. Pin cwd to the
# package root so the install location is predictable regardless of how this
# script is invoked.
cd "$(cd "$(dirname "$0")/.." && pwd)"

if ! output=$(mm-foundryup --binaries anvil 2>&1); then
  echo "$output" >&2
  exit 1
fi

if [ ! -e "node_modules/.bin/anvil" ]; then
  echo "mm-foundryup completed but node_modules/.bin/anvil is missing" >&2
  echo "cwd: $(pwd)" >&2
  echo "contents of node_modules/.bin:" >&2
  ls -la node_modules/.bin >&2 || true
  exit 1
fi
