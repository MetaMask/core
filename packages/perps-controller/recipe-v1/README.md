# Recipe v1 — headless verification example (ADR-58)

A self-contained, **zero-dependency** Recipe v1 runner that proves the recipe
contract works for **non-UI / backend** verification — here, MetaMask core with
**zero UI**.

It wraps the existing perps-controller `e2e/` scripts (from PR #8893) in a
Recipe v1 workflow graph and emits the standard portable artifact package:

- `recipe.json` — copy of the executed recipe
- `summary.json` — run status, counts, harness + runner provenance
- `trace.json` — per-node execution trace (stdout/stderr captured, truncated)
- `artifact-manifest.json` — index of the artifacts above

**No Farmslot dependency.** The runner uses only Node built-ins
(`node:child_process`, `node:fs`, `node:path`). Any compliant runner can execute
the same contract — this one is just a reference implementation living next to
the code it verifies.

## Run

From `packages/perps-controller/`:

```bash
# read-only, no wallet, hits the live HyperLiquid public API
npx tsx recipe-v1/runner.ts recipe-v1/recipes/market-data.recipe.json

# or via package scripts
yarn recipe:market-data
yarn recipe:run recipe-v1/recipes/market-data.recipe.json
```

Artifacts land in `recipe-v1/runs/<recipe-slug>-<timestamp>/`. Exit code is `0`
on pass, `1` on fail.

## Recipes

| Recipe                          | Wallet?                       | Proves                                                  |
| ------------------------------- | ----------------------------- | ------------------------------------------------------- |
| `market-data.recipe.json`       | No                            | reads live HyperLiquid market data correctly            |
| `trading-lifecycle.recipe.json` | Yes — `HL_E2E_PRIVATE_KEY`    | can open and close a BTC position end-to-end            |

The trading-lifecycle recipe requires `HL_E2E_PRIVATE_KEY` pointing at a funded
HyperLiquid testnet wallet (see `../e2e/README.md`).

## How it works

The runner reads the recipe's `validate.workflow`, walks the linear graph from
`entry` following each node's `next`, and supports exactly the actions declared
in `manifests/perps.action-manifest.json`:

- `command` — spawns a shell command from the package root, capturing
  stdout/stderr/exitCode
- `assert_exit_code` — checks a prior command's exit code
- `assert_output` — checks a prior command's stdout/stderr for a substring
- `end` — terminal node carrying the declared pass/fail status

The controller logic itself is **not** reimplemented; it is exercised by the
`e2e/` scripts, and this runner only orchestrates them and packages the result
as evidence.
