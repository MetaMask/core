# Perps Controller E2E Tests

Standalone validation scripts that call real HyperLiquid APIs. No mocks.

## Read-Only Scenarios (no wallet needed)

```bash
npx tsx e2e/market-data.ts          # meta, prices, spotMeta
npx tsx e2e/account-state.ts        # clearinghouseState, orders, fundings
npx tsx e2e/order-validation.ts     # constants + live meta cross-check
npx tsx e2e/subscription-stream.ts  # WebSocket allMids stream
npx tsx e2e/error-codes.ts          # error code structure + edge cases
```

## Trading Scenarios (testnet wallet required)

Set environment variables:

```bash
export HL_E2E_PRIVATE_KEY=0x...   # funded testnet wallet
export HL_TESTNET=true            # default: true
```

Fund the wallet via [HyperLiquid Testnet Faucet](https://app.hyperliquid-testnet.xyz/drip).

### Trading Lifecycle

Opens a position, optionally sets TP/SL, then closes and verifies flat.

```bash
# BTC long with TP/SL
npx tsx e2e/trading-lifecycle.ts --coin BTC --size 0.001 --leverage 5 --side long --tp-pct 5 --sl-pct 3

# ETH short with TP/SL
npx tsx e2e/trading-lifecycle.ts --coin ETH --size 0.01 --leverage 3 --side short --tp-pct 10 --sl-pct 5

# Minimal $10 position, no TP/SL
npx tsx e2e/trading-lifecycle.ts --coin BTC --size 0.0001 --leverage 10 --side long
```

### Limit Orders

Places a limit order, verifies it's resting, then cancels.

```bash
# Buy limit 2% below market
npx tsx e2e/limit-orders.ts --coin BTC --size 0.001 --offset-pct -2 --leverage 5 --side long

# Sell limit 3% above market
npx tsx e2e/limit-orders.ts --coin ETH --size 0.01 --offset-pct 3 --leverage 3 --side short
```

## Parameters

### Common

| Flag         | Default | Description                  |
| ------------ | ------- | ---------------------------- |
| `--coin`     | BTC     | Asset symbol                 |
| `--size`     | 0.001   | Position size in asset units |
| `--leverage` | 5       | Leverage multiplier          |
| `--side`     | long    | `long` or `short`            |

### Trading Lifecycle

| Flag       | Default | Description                         |
| ---------- | ------- | ----------------------------------- |
| `--tp-pct` | none    | Take profit distance (% from entry) |
| `--sl-pct` | none    | Stop loss distance (% from entry)   |

### Limit Orders

| Flag           | Default | Description                              |
| -------------- | ------- | ---------------------------------------- |
| `--offset-pct` | -2      | Price offset from mid (negative = below) |

## Output

Each script outputs structured JSON to stdout:

```json
{
  "scenario": "trading-lifecycle-BTC-long",
  "status": "pass",
  "assertions": 12,
  "failed": 0,
  "durationMs": 5200,
  "details": [...]
}
```

Exit code 0 = pass, non-zero = fail. Diagnostic logs go to stderr.

## Farmslot Integration

These scripts are wrapped by recipes in `projects/core-farm/fixtures/agentic/recipes/` and executed via the headless recipe runner (`validate-recipe.js`). The runner captures stdout as log artifacts per the Recipe Runner Protocol.
