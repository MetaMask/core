## MetaMask Swaps & Bridge – FAQ

Quick links
- PM Guide: `docs/swaps-bridge-pm-guide.md`
- Bridge Controller: `packages/bridge-controller/src/bridge-controller.ts`
- Bridge Status Controller: `packages/bridge-status-controller/src/bridge-status-controller.ts`
- Fetch (quotes/tokens/prices): `packages/bridge-controller/src/utils/fetch.ts`
- Status fetch/backoff: `packages/bridge-status-controller/src/utils/bridge-status.ts`
- Feature flags: `packages/bridge-controller/src/utils/feature-flags.ts`
- Selectors (sorting/metadata): `packages/bridge-controller/src/selectors.ts`
- Balance/allowance: `packages/bridge-controller/src/utils/balance.ts`
- Chain/token utils & constants: `packages/bridge-controller/src/utils/bridge.ts`, `packages/bridge-controller/src/constants/bridge.ts`, `packages/bridge-controller/src/constants/swaps.ts`

1) Where do quotes come from?
- Bridge API `GET /getQuote` (built in `fetchBridgeQuotes` in `utils/fetch.ts`).

2) Are API calls proxied or direct?
- Quotes/Tokens/Status: via Bridge API (`https://bridge.api.cx.metamask.io`).
- Prices: direct to Price API (`https://price.api.cx.metamask.io`).

3) How often do quotes refresh? Can we override per chain?
- Default 30s (`REFRESH_INTERVAL_MS` in `constants/bridge.ts`).
- Per-chain override via feature flags (`utils/feature-flags.ts` + `selectors.ts`).

4) When does quote polling stop?
- After `maxRefreshCount` (default 5) or when `insufficientBal` is true (`bridge-controller.ts`).

5) Where are feature flags stored and which keys are used?
- Source: `RemoteFeatureFlagController` state.
- Mobile uses `bridgeConfigV2`; Extension uses `bridgeConfig` (`utils/feature-flags.ts`).

6) What’s cached and for how long?
- Tokens: 10 minutes (`fetchBridgeTokens`, `cacheOptions`).
- Quotes: no cache (fresh; `cacheRefreshTime: 0`).
- Prices: 30 seconds per currency (`fetchAssetPrices`).

7) Which RPC methods do we use?
- Native balance: `eth_getBalance` via ethers `provider.getBalance`.
- ERC-20 balance: `eth_call` to `balanceOf` via ethers `Contract` (`utils/balance.ts`).
- ERC-20 allowance (USDT reset logic): `allowance(owner, spender)` (`bridge-controller.ts` + `bridge-status-controller/utils/transaction.ts`).

8) How is L1 gas fee (OP/Base) added to quotes?
- After fetching quotes, we call `TransactionController.getLayer1GasFee` for approval/trade and append `l1GasFeesInHexWei` when all quotes are on OP/Base (`bridge-controller.ts`).

9) How is status polled and retried?
- Status endpoint: Bridge API `GET /getTxStatus` (`bridge-status/utils/bridge-status.ts`).
- Exponential backoff: base interval * 2^(attempts-1), using `REFRESH_INTERVAL_MS` as base.

10) How do non‑EVM flows work (Solana, BTC, Tron)?
- Via Snaps using `SnapController:handleRequest`.
- Fee computation: unified `computeFee` (`bridge-controller/src/utils/snaps.ts`).
- Rent exemption (Solana): `getMinimumBalanceForRentExemption` (`utils/snaps.ts`).
- Non‑EVM tx submission handled in `bridge-status-controller.ts` and stored in history.

11) Mobile vs Extension differences to be aware of
- `X-Client-Id` header: `mobile` vs `extension` (`constants/bridge.ts`).
- Feature flags field: Mobile `bridgeConfigV2`, Extension `bridgeConfig`.
- Mobile hardware wallets: require approval gating and a small delay (`bridge-status-controller/utils/transaction.ts`).

12) Where are the base URLs defined?
- `BRIDGE_PROD_API_BASE_URL`, `BRIDGE_DEV_API_BASE_URL` in `constants/bridge.ts`.
- SWAPS v2 base (reference): `constants/swaps.ts`.

13) How do we fetch tokens for a destination network the user hasn’t imported?
- `fetchBridgeTokens` hits Bridge API `GET /getTokens?chainId=…` and caches for 10 minutes (`utils/fetch.ts`).

14) How are asset exchange rates sourced?
- Prefer existing controller state: `MultichainAssetsRatesController`, `CurrencyRateController`, `TokenRatesController`.
- If missing, fetch from Price API and store in `assetExchangeRates` (`bridge-controller.ts`).

15) How do we detect quote expiration on the client?
- Selector `selectIsQuoteExpired` compares `quotesLastFetched` vs refresh interval and whether another refresh is expected (`selectors.ts`).

16) How are quotes sorted and which is recommended?
- Default sorted by cost ascending; alternative ETA ascending.
- `selectRecommendedQuote` returns the top item (`selectors.ts`).

17) How do we validate responses and surface issues?
- Quotes and status responses validated with schemas.
- Validation failures are recorded and can be tracked/inspected (see `utils/fetch.ts` and `bridge-status/utils/bridge-status.ts`).

