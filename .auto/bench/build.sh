#!/bin/bash
# Playground build: prepare tree -> tsc -> single-file Hermes bundle.
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

node .auto/bench/prepare.mjs "$ROOT"

# Type errors do not block emit (noEmitOnError false); syntax errors kill the
# emit, caught below by the missing bench.js.
node_modules/.bin/tsc -p .auto/bench/tmp/tsconfig.json > .auto/bench/tsc.log 2>&1 || true

node .auto/bench/bundle.mjs "$ROOT"

# Syntax gate on the final bundle (Node parses, does not run it).
node --check .auto/bench/bundle.js
echo "build: OK (.auto/bench/bundle.js)"
