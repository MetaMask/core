#!/bin/bash
# Autoresearch benchmark — VIEM VARIANT: what would MulticallClient's numbers
# look like if the Ethers usage were replaced with viem?
# Same structure as measure.sh; builds the bundle-viem.js entry.
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

HERMES="${HERMES_BIN:-/Users/prithpalsooriya/.kandev/quick-chat/c1b1839c-62b5-4776-9d7e-5eb1ae664862/hermes/build/bin/hermes}"

# 1) Build (prepare vendors the pruned viem ABI closure into tmp/vendor).
node .auto/bench/prepare.mjs "$ROOT"
node_modules/.bin/tsc -p .auto/bench/tmp/tsconfig.json > .auto/bench/tsc.log 2>&1 || true
BENCH_ENTRY=app/bench-viem.js node .auto/bench/bundle.mjs "$ROOT"
node --check .auto/bench/bundle-bench-viem.js

# 2) Run under Hermes (3 invocations)
RUNS=3
HERMES_ARGS=('-O')
for i in $(seq 1 $RUNS); do
  if ! "$HERMES" "${HERMES_ARGS[@]}" .auto/bench/bundle-bench-viem.js > ".auto/bench/viem_run_$i.out" 2>&1; then
    echo "--- hermes crash (viem run $i) ---" >&2
    tail -15 ".auto/bench/viem_run_$i.out" >&2
    exit 1
  fi
done

# 3) Parity self-check gate
if ! grep -q '^SELF_CHECK=OK$' .auto/bench/viem_run_*.out; then
  echo "--- parity self-check failed (viem) ---" >&2
  grep -h '^SELF_CHECK=FAIL' .auto/bench/viem_run_*.out >&2 || tail -5 ".auto/bench/viem_run_1.out" >&2
  exit 1
fi

# 4) Median across invocations
node .auto/bench/median.mjs .auto/bench/viem_run_1.out .auto/bench/viem_run_2.out .auto/bench/viem_run_3.out
