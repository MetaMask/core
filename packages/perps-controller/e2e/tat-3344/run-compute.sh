#!/usr/bin/env bash
# TAT-3344 — run compute-max-order-amount.mjs against an UNBUILT core checkout.
#
# The workspace packages the perps controller imports at runtime resolve only to
# dist/ via their package "exports", which does not exist in a fresh checkout.
# The harness solves this for its own live adapters by pointing tsx at each
# package's src through a generated tsconfig paths map
# (harness src/live-adapter-contract.ts, platformAdapterEnv). This mirrors that
# so the proof's compute step runs on the same terms, without building or
# modifying the checkout.
set -euo pipefail

PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)}"
TSCONFIG="$(mktemp -t tat-3344-tsconfig.XXXXXX)"

python3 - "$PROJECT_ROOT" "$TSCONFIG" <<'PY'
import json, os, sys
root, out = sys.argv[1], sys.argv[2]
paths = {}
for pkg in ['base-controller', 'messenger', 'controller-utils', 'keyring-controller']:
    name = f'@metamask/{pkg}'
    pkg_dir = os.path.join(root, 'packages', pkg)
    if os.path.exists(os.path.join(pkg_dir, 'dist/index.cjs')):
        continue
    src = os.path.join(pkg_dir, 'src')
    if not os.path.exists(os.path.join(src, 'index.ts')):
        continue
    paths[name] = [os.path.join(src, 'index.ts')]
    paths[f'{name}/*'] = [os.path.join(src, '*')]
json.dump({'compilerOptions': {'baseUrl': root, 'paths': paths}}, open(out, 'w'), indent=2)
PY

trap 'rm -f "$TSCONFIG"' EXIT

TSX_TSCONFIG_PATH="$TSCONFIG" \
  "$PROJECT_ROOT/node_modules/.bin/tsx" \
  "$PROJECT_ROOT/packages/perps-controller/e2e/tat-3344/compute-max-order-amount.mjs" \
  --project-root="$PROJECT_ROOT" \
  "$@"
