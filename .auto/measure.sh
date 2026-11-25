#!/bin/bash
# Hermes playground benchmark. Emits `METRIC name=value` lines.
# Exit 0 only when the workload self-check passes on every invocation.
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

HERMES="${HERMES_BIN:-/Users/prithpalsooriya/Desktop/projects/metamask-mobile/ios/Pods/hermes-engine/destroot/bin/hermes}"
WORKLOAD=".auto/bench/workload.js"
if [ -f .auto/bench/bundle.js ]; then
  WORKLOAD=".auto/bench/bundle.js"
fi

node --input-type=module -e '
import fs from "node:fs";
const cfg = JSON.parse(fs.readFileSync(".auto/harness.json", "utf8"));
if (cfg.status !== "ready") {
  console.error("harness.json status is \"" + (cfg.status || "") + "\". Specialise workload.js, prompt.md, and checks_command, then set status to \"ready\".");
  process.exit(2);
}
if (!cfg.metric) {
  console.error("harness.json metric is empty");
  process.exit(2);
}
'

if [ ! -x "$HERMES" ]; then
  echo "Hermes binary is missing: $HERMES" >&2
  echo "Set HERMES_BIN to the MetaMask Mobile hermes CLI." >&2
  exit 1
fi

mkdir -p .auto/bench
# Always rebuild the bundle from the CURRENT production source so the bench
# tracks the live file, never an independently edited clone.
if ! node .auto/bench/build.mjs; then
  echo "--- bundle build failed ---" >&2
  echo "METRIC status=crash"
  exit 1
fi
WORKLOAD=".auto/bench/bundle.js"

RUNS=3
for i in $(seq 1 $RUNS); do
  if ! "$HERMES" -O "$WORKLOAD" > ".auto/bench/run_$i.out" 2>&1; then
    echo "--- hermes crash (run $i) ---" >&2
    tail -20 ".auto/bench/run_$i.out" >&2
    echo "METRIC status=crash"
    exit 1
  fi
done

# EVERY run must pass the self-check. (A grep across all run_*.out files
# would pass if any single run printed OK while another failed.)
ALL_OK=1
for i in $(seq 1 $RUNS); do
  if ! grep -q '^SELF_CHECK=OK$' ".auto/bench/run_$i.out" || \
     grep -qE 'SELF_CHECK=FAIL|PARITY_FAIL' ".auto/bench/run_$i.out"; then
    echo "--- parity self-check failed (run $i) ---" >&2
    grep -hE 'SELF_CHECK=|PARITY_FAIL' ".auto/bench/run_$i.out" | head -10 >&2
    ALL_OK=0
  fi
done
if [ "$ALL_OK" != "1" ]; then
  echo "METRIC status=crash"
  exit 1
fi

node .auto/bench/median.mjs .auto/bench/run_1.out .auto/bench/run_2.out .auto/bench/run_3.out
