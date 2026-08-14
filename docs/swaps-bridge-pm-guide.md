## MetaMask Swaps & Bridge: PM Guide

### Table of contents
- [Executive summary](#executive-summary)
- [Where core logic lives](#where-core-logic-lives)
- [APIs called (direct vs via Bridge API)](#apis-called-direct-vs-via-bridge-api)
- [Feature flags (LaunchDarkly via RemoteFeatureFlagController)](#feature-flags-launchdarkly-via-remotefeatureflagcontroller)
- [Caching, refresh rates, and timing](#caching-refresh-rates-and-timing)
- [RPC usage (what providers/methods we call)](#rpc-usage-what-providersmethods-we-call)
- [Non‑EVM (Snaps) integration](#non-evm-snaps-integration)
- [Mobile vs Extension differences](#mobile-vs-extension-differences)
- [FAQ (quick answers)](#faq-quick-answers)

### Executive summary
- The user-facing cross-chain Swaps experience is implemented by the Bridge Controller (quotes, UX timing/metrics) and the Bridge Status Controller (tx submission + tracking).
- Quotes/tokens/status use the Bridge API; price data uses the Price API directly. Caching: tokens 10m; prices 30s; quotes no cache.
- Feature flags come from the Remote Feature Flag Controller (LaunchDarkly-backed) and control refresh rates, overrides, etc.
- EVM operations use the selected provider (eth_getBalance, ERC-20 balanceOf, contract allowance); non-EVM use Snaps via SnapController.

### Where core logic lives
- Bridge Controller (quotes, metrics, polling, exchange rates, ERC20 allowance):
  - `packages/bridge-controller/src/bridge-controller.ts`
  - Selectors (quote sorting/metadata): `packages/bridge-controller/src/selectors.ts`
  - Fetch helpers (quotes/tokens/prices): `packages/bridge-controller/src/utils/fetch.ts`
  - Feature flags helpers: `packages/bridge-controller/src/utils/feature-flags.ts`
  - Balance/allowance helpers: `packages/bridge-controller/src/utils/balance.ts`
  - Chain/token utilities: `packages/bridge-controller/src/utils/bridge.ts`, `.../constants/bridge.ts`, `.../constants/swaps.ts`

- Bridge Status Controller (submit txs, poll status, build history, metrics):
  - `packages/bridge-status-controller/src/bridge-status-controller.ts`
  - Status fetch + backoff: `packages/bridge-status-controller/src/utils/bridge-status.ts`
  - Tx helpers (EVM batching/7702, non‑EVM handling): `packages/bridge-status-controller/src/utils/transaction.ts`
  - Received amount calc: `packages/bridge-status-controller/src/utils/swap-received-amount.ts`

### APIs called (direct vs via Bridge API)
- Bridge API (Swaps backend):
  - Quotes: `GET {BRIDGE_API}/getQuote?…`
    - Built in `packages/bridge-controller/src/utils/fetch.ts` (function `fetchBridgeQuotes`)
  - Tokens: `GET {BRIDGE_API}/getTokens?chainId=…`
    - Built in `fetchBridgeTokens`
  - Status: `GET {BRIDGE_API}/getTxStatus?…`
    - Built in `packages/bridge-status-controller/src/utils/bridge-status.ts` (function `fetchBridgeTxStatus`)

- Price API (direct, not proxied):
  - Spot prices: `GET https://price.api.cx.metamask.io/v3/spot-prices?assetIds=…&vsCurrency=…`
    - Built in `fetchAssetPrices`

- SWAPS v2 base (reference only):
  - `packages/bridge-controller/src/constants/swaps.ts` → `https://swap.api.cx.metamask.io`

Constants (env):
- `BRIDGE_PROD_API_BASE_URL` = `https://bridge.api.cx.metamask.io`
- `BRIDGE_DEV_API_BASE_URL` = `https://bridge.dev-api.cx.metamask.io`
- Client identity header: `X-Client-Id` set to `extension` or `mobile`

### Feature flags (LaunchDarkly via RemoteFeatureFlagController)
- Source: `RemoteFeatureFlagController` state
  - Mobile reads `bridgeConfigV2`; Extension reads `bridgeConfig`
  - Normalized by `processFeatureFlags` (`packages/bridge-controller/src/utils/feature-flags.ts`)
- Usage examples:
  - Refresh interval override per chain and defaults
  - Quote request overrides by feature (e.g., `FeatureId.PERPS` sorting tweak)

### Caching, refresh rates, and timing
- Quotes polling:
  - Default refresh: 30s (`REFRESH_INTERVAL_MS`), overridable by flags per chain
  - Stop after `maxRefreshCount` (default 5) or if `insufficientBal=true`
  - State tracks: `quotesRefreshCount`, `quotesLastFetched`, `quotesInitialLoadTime`
- Cache policy per endpoint:
  - Tokens: 10 minutes (via `cacheOptions`)
  - Quotes: no cache (always fresh)
  - Prices: 30 seconds per currency (merged across currencies)
- Status polling:
  - Interval base equals `REFRESH_INTERVAL_MS`, with exponential backoff on failures: `base * 2^(attempts-1)`

### RPC usage (what providers/methods we call)
- Balances:
  - Native: `eth_getBalance` via ethers `provider.getBalance`
  - ERC-20: `eth_call` to `balanceOf` via ethers `Contract`
- Allowance:
  - `erc20.allowance(owner, spender)` to check if USDT reset is needed
- L1 gas fees (OP/Base):
  - Uses `TransactionController.getLayer1GasFee` per approval/trade tx

### Non‑EVM (Snaps) integration
- Fee estimation and rent exemption:
  - `SnapController:handleRequest` with `computeFee` (unified) and Solana rent exemption call
- Tx submission for non‑EVM:
  - Unified `signAndSend` style flow through Snaps; response may include `transactionId`, `signature`, or structured result
- Stored in history with `isBridgeTx` and non‑EVM hints for UI/metrics

### Mobile vs Extension differences
- Client ID header: `mobile` vs `extension`
- Feature flags field: `bridgeConfigV2` (Mobile) vs `bridgeConfig` (Extension)
- Mobile hardware wallets: require pre-approval gating and a small delay between approval/trade to improve UX

### FAQ (quick answers)
- Where do we fetch quotes from?
  - Bridge API `/getQuote` (proxied Swaps backend).
- Do we hit token/price APIs directly?
  - Tokens: via Bridge API. Prices: direct Price API.
- How often do quotes refresh? Can I change it per chain?
  - Default 30s; per-chain overrides via feature flags.
- When do we stop refreshing quotes?
  - After max refreshes (default 5) or when balance is insufficient.
- How is balance checked?
  - Native via `eth_getBalance`; tokens via `balanceOf` contract call on the selected provider.
- How is L1 gas for OP/Base added?
  - Post-quote, we append L1 fees via `TransactionController.getLayer1GasFee`.
- Where do status updates come from?
  - Bridge API `/getTxStatus`, with exponential backoff on failures.
- How do non‑EVM flows work?
  - Through Snaps: fee computation, tx submission, signatures; tracked in history and polled when needed.

