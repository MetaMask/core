#!/bin/bash
# Hermes playground benchmark. Emits `METRIC name=value` lines.
# Exit 0 only when the bundle is freshly rebuilt from the current production
# source AND the parity self-check passes on EVERY run AND primary_ms is a
# real number. Generated artifacts are git-ignored (see .auto/.gitignore).
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

HERMES="${HERMES_BIN:-/Users/prithpalsooriya/Desktop/projects/metamask-mobile/ios/Pods/hermes-engine/destroot/bin/hermes}"
BUNDLE=".auto/bench/bundle.js"

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

# Always rebuild: the candidate is bundled from the live production source on
# every invocation, so a stale bundle can never be measured. The build also
# fails if the immutable original snapshot was tampered with.
node .auto/bench/build.mjs >&2

mkdir -p .auto/bench
RUNS=3
for i in $(seq 1 $RUNS); do
  if ! "$HERMES" -O "$BUNDLE" > ".auto/bench/run_$i.out" 2>&1; then
    echo "--- hermes crash (run $i) ---" >&2
    tail -20 ".auto/bench/run_$i.out" >&2
    echo "METRIC status=crash"
    exit 1
  fi
  # Parity guard: EVERY run must self-check OK. A single passing run is not
  # enough, and a missing verdict fails closed.
  if ! grep -q '^SELF_CHECK=OK$' ".auto/bench/run_$i.out"; then
    echo "--- parity self-check failed (run $i) ---" >&2
    grep -h '^SELF_CHECK=\|^  - \|reason:' ".auto/bench/run_$i.out" >&2 || tail -20 ".auto/bench/run_$i.out" >&2
    exit 1
  fi
  # Metric guard: every run must produce a numeric primary metric.
  if ! grep -Eq '^METRIC primary_ms=[0-9]+(\.[0-9]+)?$' ".auto/bench/run_$i.out"; then
    echo "--- primary_ms missing or non-numeric (run $i) ---" >&2
    tail -5 ".auto/bench/run_$i.out" >&2
    exit 1
  fi
done

node .auto/bench/median.mjs .auto/bench/run_1.out .auto/bench/run_2.out .auto/bench/run_3.out
