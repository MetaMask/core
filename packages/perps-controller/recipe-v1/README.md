# Recipe v1 — headless controller verification example (ADR-58)

A self-contained Recipe v1 runner that proves the recipe contract works for a
**non-UI / core controller** package. It exercises **PerpsController public
methods** through a headless in-memory provider and emits the standard portable
artifact package:

- `recipe.json` — copy of the executed recipe
- `summary.json` — run status, counts, harness + runner provenance
- `trace.json` — per-node execution trace and controller method results
- `artifact-manifest.json` — index of the artifacts above

This intentionally does **not** call the PR #8893 HyperLiquid e2e scripts. Those
scripts hit HyperLiquid directly; this example is specifically for proving a
headless Recipe v1 integration around the actual controller/service/provider
path without requiring UI, a wallet, or live exchange credentials.

## Run

From `packages/perps-controller/`:

```bash
npx tsx recipe-v1/runner.ts recipe-v1/recipes/market-data.recipe.json
npx tsx recipe-v1/runner.ts recipe-v1/recipes/trading-lifecycle.recipe.json

# or via package scripts
yarn recipe:market-data
yarn recipe:trading-lifecycle
```

Artifacts land in `recipe-v1/runs/<recipe-slug>-<timestamp>/`. Exit code is `0`
on pass, `1` on fail.

## Recipes

| Recipe                          | Wallet? | Proves                                                                  |
| ------------------------------- | ------- | ----------------------------------------------------------------------- |
| `market-data.recipe.json`       | No      | `PerpsController.getMarkets` returns market data through controller API |
| `trading-lifecycle.recipe.json` | No      | open order → TP/SL update → close position via controller methods       |

## How it works

The runner reads the recipe's `validate.workflow`, walks the graph from `entry`
following each node's `next`, and supports the actions declared in
`manifests/perps.action-manifest.json`:

- `perps_controller.call` — custom action that invokes a public
  `PerpsController` method through a headless in-memory provider
- `assert_json` — checks a prior controller result at a dotted JSON path
- `command`, `assert_exit_code`, `assert_output` — generic headless actions kept
  for parity with Recipe v1 core/headless runners
- `end` — terminal node carrying the declared pass/fail status

No Farmslot runtime dependency is required; the runner is a small project-owned
adapter that writes the standard Recipe v1 artifact contract.
