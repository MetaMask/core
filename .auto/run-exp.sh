#!/bin/bash
# Autoresearch experiment runner (manual mimic of run_experiment +
# log_experiment keep/discard with auto-commit / auto-revert).
#
# Usage: .auto/run-exp.sh "<idea description>" [asi key=value ...]
#
# - Runs .auto/measure.sh against the CURRENT working-tree MulticallClient.ts.
# - If the primary metric improves vs session best (and checks pass) -> keep:
#   commit the source change. Otherwise -> discard: revert it.
# - Every run is logged to .auto/log.jsonl with verdict + metrics + asi.
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

if [ $# -lt 1 ]; then
  echo "usage: .auto/run-exp.sh \"<idea description>\" [asi key=value ...]" >&2
  exit 2
fi
DESC="$1"; shift || true
ASI_JSON=$(node -e "
const parts = process.argv.slice(1).filter(Boolean);
const o = {};
for (const p of parts) { const i = p.indexOf('='); if (i > 0) o[p.slice(0, i)] = p.slice(i + 1); }
console.log(JSON.stringify(o));
" "$@")

SRCFILE=packages/assets-controller/src/data-sources/evm-rpc-services/clients/MulticallClient.ts

# Scope guard: only MulticallClient.ts (plus untracked .auto/*) may be dirty.
DIRTY=$(git status --porcelain | grep -v '^??' | grep -v "$SRCFILE" || true)
if [ -n "$DIRTY" ]; then
  echo "ABORT: unexpected dirty tracked files:" >&2
  echo "$DIRTY" >&2
  exit 2
fi

revert_source() {
  git checkout -- "$SRCFILE" 2>/dev/null || true
}

# Run the benchmark -----------------------------------------------------------
if ! OUT=$(.auto/measure.sh 2>&1); then
  echo "$OUT" | tail -10 >&2
  N=$(grep -c '"run":' .auto/log.jsonl 2>/dev/null || echo 0)
  node .auto/logrun.mjs append --run "$((N + 1))" --status crash --desc "$DESC" --metric 0 \
    --metrics '{}' --asi "$ASI_JSON"
  revert_source
  echo "VERDICT=crash"
  exit 1
fi

METRICS=$(echo "$OUT" | grep '^METRIC ' | sed 's/^METRIC //' | node -e "
const lines = require('fs').readFileSync(0, 'utf8').trim().split('\n');
const o = {};
for (const l of lines) { const i = l.indexOf('='); o[l.slice(0, i)] = Number(l.slice(i + 1)); }
console.log(JSON.stringify(o));
")
ENCDEC=$(echo "$OUT" | awk -F= '/^METRIC encdec_full_ms=/{print $2}')
if [ -z "$ENCDEC" ] || [ "$ENCDEC" = "null" ]; then
  echo "no encdec_full_ms in output:" >&2; echo "$OUT" >&2
  exit 1
fi

N=$(grep -c '"run":' .auto/log.jsonl 2>/dev/null || echo 0)
RUN_ID=$((N + 1))
BEST=$(node .auto/logrun.mjs best)
BEST_METRIC=$(node -e "const j=JSON.parse(process.argv[1]); console.log(j === null ? '' : j.metric)" "$BEST")

# Verdict: improved = strictly better by > 2% (noise guard) ------------------
KEEP_THRESHOLD=$(node -e "console.log(($BEST_METRIC || 1e18) * 0.98)")
IMPROVED=no
if [ "$(node -e "console.log($ENCDEC < $KEEP_THRESHOLD ? 'yes' : 'no')")" = "yes" ]; then
  IMPROVED=yes
fi

if [ "$IMPROVED" = "yes" ]; then
  if CHECKS_OUT=$(.auto/checks.sh 2>&1); then
    git add "$SRCFILE"
    git commit -q -m "autoresearch(exp $RUN_ID): $DESC — encdec_ms ${BEST_METRIC:-baseline} -> $ENCDEC"
    SHA=$(git rev-parse --short HEAD)
    node .auto/logrun.mjs append --run "$RUN_ID" --status keep --desc "$DESC" \
      --metric "$ENCDEC" --metrics "$METRICS" --asi "$ASI_JSON" --commit "$SHA"
    echo "$CHECKS_OUT" | tail -3
    echo "VERDICT=keep exp=$RUN_ID encdec_ms=$ENCDEC (prev best ${BEST_METRIC:-none}) commit=$SHA"
  else
    echo "$CHECKS_OUT" | tail -20 >&2
    node .auto/logrun.mjs append --run "$RUN_ID" --status checks_failed --desc "$DESC" \
      --metric "$ENCDEC" --metrics "$METRICS" --asi "$ASI_JSON"
    revert_source
    echo "VERDICT=checks_failed exp=$RUN_ID encdec_ms=$ENCDEC (reverted)"
  fi
else
  node .auto/logrun.mjs append --run "$RUN_ID" --status discard --desc "$DESC" \
    --metric "$ENCDEC" --metrics "$METRICS" --asi "$ASI_JSON"
  revert_source
  echo "VERDICT=discard exp=$RUN_ID encdec_ms=$ENCDEC (best ${BEST_METRIC:-none})"
fi
