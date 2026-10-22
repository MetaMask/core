#!/bin/bash
# Autoresearch benchmark: builds the Hermes bundle from the CURRENT
# MulticallClient.ts source and measures encodeAggregate3 +
# decodeAggregate3Response. Emits `METRIC name=value` lines.
# Exit 0 only if build + parity self-checks + runs all succeed.
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

HERMES="${HERMES_BIN:-/Users/prithpalsooriya/.kandev/quick-chat/c1b1839c-62b5-4776-9d7e-5eb1ae664862/hermes/build/bin/hermes}"

# 1) Build (includes fast failure on syntax errors / marker drift)
.auto/bench/build.sh > /dev/null

# 2) Run under Hermes (3 invocations; in-process adaptive timing + medians)
RUNS=3
HERMES_ARGS=('-O')
for i in $(seq 1 $RUNS); do
  if ! "$HERMES" "${HERMES_ARGS[@]}" .auto/bench/bundle.js > ".auto/bench/run_$i.out" 2>&1; then
    echo "--- hermes crash (run $i) ---" >&2
    tail -5 ".auto/bench/run_$i.out" >&2
    echo "METRIC status=crash"
    exit 1
  fi
done

# 3) Parity self-check gate (all invocations must pass)
if ! grep -q '^SELF_CHECK=OK$' .auto/bench/run_*.out; then
  echo "--- parity self-check failed ---" >&2
  grep -h '^SELF_CHECK=FAIL' .auto/bench/run_*.out || tail -5 .auto/bench/run_1.out >&2
  echo "METRIC status=self_check_failed"
  exit 1
fi

# 4) Median across invocations
node .auto/bench/median.mjs .auto/bench/run_1.out .auto/bench/run_2.out .auto/bench/run_3.out
