# perps-controller e2e scripts

Scripted, repeatable proofs of provider contracts. These are **not** Jest tests
(Jest never picks them up); they are standalone `tsx` scripts that write evidence
artifacts.

## `advanced-orders.e2e.ts`

Proves the advanced order-type contract (TAT-3511) for every type in scope:
stop market, stop limit, take-profit market, take-profit limit, reduce-only, and
partial TP/SL. For each case it runs:

```
place -> read back from open orders -> assert round-trip -> cancel -> assert gone
```

The round-trip assertions cover the placement type, trigger price, execution mode
(market vs limit on trigger), the reduce-only flag, and the partial quantity. A
final case asserts that a trigger placement without a trigger price fails with the
typed `ORDER_TRIGGER_PRICE_REQUIRED` error rather than silently placing something
else.

Both modes exercise the same production mapping and read-back code
(`calculateOrderPriceAndSize`, `buildOrdersArray`, `adaptOrderFromSDK`,
`adaptPositionTriggerOrderFromSDK`); only the transport differs.

### Simulated mode (default — no credentials, clean checkout)

```bash
cd packages/perps-controller
npx tsx e2e/advanced-orders.e2e.ts --out=e2e/artifacts
```

The HyperLiquid exchange/info surface is replaced by an in-process double that
stores the submitted payloads and renders them back in HyperLiquid's
`frontendOpenOrders` shape.

### Testnet mode (real HyperLiquid testnet)

```bash
cd packages/perps-controller
export PERPS_E2E_PRIVATE_KEY=0x...   # funded HyperLiquid testnet key
export PERPS_E2E_ADDRESS=0x...       # address of that key
npx tsx e2e/advanced-orders.e2e.ts --mode=testnet --symbol=BTC --out=e2e/artifacts
```

Testnet runs place real (small) resting orders and cancel them at the end of each
case. Sizes must clear HyperLiquid's $10 minimum notional.

### Options

| Flag       | Default                              | Meaning                   |
| ---------- | ------------------------------------ | ------------------------- |
| `--mode`   | `simulated`                          | `simulated` or `testnet`  |
| `--out`    | `e2e/artifacts` (or `PERPS_E2E_OUT`) | Evidence output directory |
| `--symbol` | `BTC` (or `PERPS_E2E_SYMBOL`)        | Market to trade           |

### Regression guard

The case matrix, the exchange doubles, and the assertions live in
`e2e/lib/advancedOrders.ts` and are shared with
`tests/src/e2e/advanced-orders.contract.test.ts`, which runs the same matrix in
simulated mode as part of the normal package test suite. A mapping or read-back
regression therefore fails CI even if nobody runs this script by hand, and the
script cannot drift from the guard.

`e2e/recipes/advanced-orders.json` is the executable validation recipe: static
checks, the runtime steps above, direct assertions on the recorded evidence, and
a mutation step that breaks the adapter on purpose to prove the guard is not
vacuous.

### Output

- `<case>.json` — submitted payload, order IDs, read-back order, position-state
  trigger view, per-check results.
- `summary.json` / `summary.md` — the type → placed → visible → cancelled → result
  table.

Exit code is non-zero when any case fails.
