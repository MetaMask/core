#!/bin/bash
# Correctness checks (run on candidate keeps): MulticallClient jest suite,
# which includes the "identical calldata to regular Ethers" golden test.
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

yarn workspace @metamask/assets-controller run jest --no-coverage \
  src/data-sources/evm-rpc-services/clients/MulticallClient.test.ts 2>&1 | tail -25
