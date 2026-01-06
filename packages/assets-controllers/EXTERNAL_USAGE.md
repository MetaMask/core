# External Controller Dependencies

The following controllers from other packages depend on `@metamask/assets-controllers` state.

## Summary

| External Controller | Assets-Controllers Consumed | Primary Use Case |
|--------------------|---------------------------|------------------|
| **`transaction-pay-controller`** | `TokenBalancesController`, `AccountTrackerController`, `TokensController`, `TokenRatesController`, `CurrencyRateController` | Pay gas fees with alternative tokens - needs balances, metadata, and rates |
| **`bridge-controller`** | `CurrencyRateController`, `TokenRatesController`, `MultichainAssetsRatesController` | Cross-chain bridging - needs exchange rates for EVM + non-EVM assets for quote calculations |
| **`subscription-controller`** | `MultichainBalancesController` | Crypto subscription payments - needs multi-chain balances to offer payment options |
| **`core-backend`** | `TokenBalancesController` | Real-time balance coordination - adjusts polling based on WebSocket connection state |

## State Properties Used

| Assets-Controller | Key State Properties | How It's Used | External Controller |
|-------------------|---------------------|---------------|---------------------|
| `TokenBalancesController` | `tokenBalances[account][chainId][token]` | Get ERC-20 token balances to check available funds for gas payment | `transaction-pay-controller` |
| `TokenBalancesController` | `updateChainPollingConfigs` action | Coordinate polling intervals based on WebSocket connection status | `core-backend` |
| `AccountTrackerController` | `accountsByChainId[chainId][account].balance` | Get native currency balance (ETH, MATIC) when paying with native token | `transaction-pay-controller` |
| `TokensController` | `allTokens[chainId][*]` → `decimals`, `symbol` | Get token metadata to format amounts and display token info | `transaction-pay-controller` |
| `TokenRatesController` | `marketData[chainId][token].price`, `currency` | Get token-to-native price for fiat calculations | `transaction-pay-controller`, `bridge-controller` |
| `CurrencyRateController` | `currencyRates[ticker].conversionRate` | Get native-to-fiat rate for USD/local currency display | `transaction-pay-controller`, `bridge-controller` |
| `CurrencyRateController` | `currencyRates[ticker].usdConversionRate` | Get native-to-USD rate for standardized value comparison | `transaction-pay-controller`, `bridge-controller` |
| `CurrencyRateController` | `currentCurrency` | Get user's selected fiat currency for fetching rates | `bridge-controller` |
| `MultichainAssetsRatesController` | `conversionRates[assetId].rate` | Get non-EVM asset prices (Solana, Bitcoin) for cross-chain quotes | `bridge-controller` |
| `MultichainBalancesController` | Full state via `getState()` | Check user's crypto balances across all chains for subscription payment options | `subscription-controller` |
| `MultichainBalancesController` | `AccountBalancesUpdatesEvent` | Monitor real-time balance changes to update payment options | `subscription-controller` |

## Detailed Usage

### `transaction-pay-controller`

Handles gas fee payment with alternative tokens (pay for transactions with tokens other than the native currency).

- **`TokenBalancesController`**: Queries `tokenBalances[account][chainId][tokenAddress]` to get ERC-20 token balances for determining available funds
- **`AccountTrackerController`**: Queries `accountsByChainId[chainId][account].balance` to get native currency balance when the payment token is native (ETH, MATIC, etc.)
- **`TokensController`**: Queries `allTokens[chainId][*]` to get token metadata (decimals, symbol) for proper amount formatting
- **`TokenRatesController`**: Queries `marketData[chainId][tokenAddress].price` to calculate token-to-native conversion for fiat display
- **`CurrencyRateController`**: Queries `currencyRates[ticker].conversionRate` and `usdConversionRate` to convert native amounts to fiat

### `bridge-controller`

Handles cross-chain token bridging and swapping, fetching quotes from bridge providers.

- **`CurrencyRateController`**: Gets native currency rates for EVM chains and user's preferred currency via `currencyRates` and `currentCurrency`
- **`TokenRatesController`**: Gets EVM token prices relative to native currency via `marketData[chainId][tokenAddress]`
- **`MultichainAssetsRatesController`**: Gets non-EVM asset prices (Solana, Bitcoin, etc.) via `conversionRates[assetId]` for cross-chain quote calculations

### `subscription-controller`

Handles MetaMask subscription management, including crypto-based payments.

- **`MultichainBalancesController`**: Queries full state to check user's crypto balances across all chains to determine available payment options. Subscribes to `AccountBalancesUpdatesEvent` to update payment options in real-time.

### `core-backend`

Provides real-time data delivery via WebSocket for account activity and balance updates.

- **`TokenBalancesController`**: Calls `updateChainPollingConfigs` to coordinate polling intervals. When WebSocket is connected, reduces polling (10 min backup). When disconnected, increases polling frequency (30s) for HTTP fallback.

