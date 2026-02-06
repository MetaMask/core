# External Controller Dependencies

The following controllers from other packages depend on `@metamask/assets-controllers` state.

## Summary

| External Controller | Assets-Controllers Consumed | Primary Use Case |
|--------------------|---------------------------|------------------|
| **`transaction-pay-controller`** | `TokenBalancesController`, `AccountTrackerController`, `TokensController`, `TokenRatesController`, `CurrencyRateController` | Pay gas fees with alternative tokens - needs balances, metadata, and rates |
| **`bridge-controller`** | `CurrencyRateController`, `TokenRatesController`, `MultichainAssetsRatesController` | Cross-chain bridging - needs exchange rates for EVM + non-EVM assets for quote calculations |

## State Properties Used

| Assets-Controller | Key State Properties | How It's Used | External Controller |
|-------------------|---------------------|---------------|---------------------|
| `TokenBalancesController` | `tokenBalances[account][chainId][token]` | Get ERC-20 token balances to check available funds for gas payment | `transaction-pay-controller` |
| `AccountTrackerController` | `accountsByChainId[chainId][account].balance` | Get native currency balance when paying with native token | `transaction-pay-controller` |
| `TokensController` | `allTokens[chainId][*]` → `decimals`, `symbol` | Get token metadata to format amounts and display token info | `transaction-pay-controller` |
| `TokenRatesController` | `marketData[chainId][token].price`, `currency` | Get token-to-native price for fiat calculations | `transaction-pay-controller`, `bridge-controller` |
| `CurrencyRateController` | `currencyRates[ticker].conversionRate` | Get native-to-fiat rate for USD/local currency display | `transaction-pay-controller`, `bridge-controller` |
| `CurrencyRateController` | `currencyRates[ticker].usdConversionRate` | Get native-to-USD rate for standardized value comparison | `transaction-pay-controller`, `bridge-controller` |
| `CurrencyRateController` | `currentCurrency` | Get user's selected fiat currency for fetching rates | `bridge-controller` |
| `MultichainAssetsRatesController` | `conversionRates[assetId].rate` | Get non-EVM asset prices (Solana, Bitcoin) for cross-chain quotes | `bridge-controller` |

## Detailed Usage

### `transaction-pay-controller`

Handles gas fee payment with alternative tokens (pay for transactions with tokens other than the native currency).

**Call Chain to `TokenBalancesController` and `AccountTrackerController`:**

```
TransactionPayController (constructor)
    │
    └─► pollTransactionChanges()              // subscribes to TransactionController events
            │
            └─► onTransactionChange()         // triggered when tx is new/updated
                    │
                    └─► parseRequiredTokens()      // in required-tokens.ts
                            │
                            └─► buildRequiredToken()
                                    │
                                    └─► getTokenBalance()      // in token.ts (line 29-67)
                                            │
                                            ├─► messenger.call('TokenBalancesController:getState')
                                            │       ↳ tokenBalances[account][chainId][token] → ERC-20 balance
                                            │
                                            └─► messenger.call('AccountTrackerController:getState')
                                                    ↳ accountsByChainId[chainId][account].balance → native balance
```

**Call Chain to `TokensController`:**

```
TransactionPayController (constructor)
    │
    └─► pollTransactionChanges()
            │
            └─► onTransactionChange()
                    │
                    └─► parseRequiredTokens()
                            │
                            └─► buildRequiredToken()
                                    │
                                    └─► getTokenInfo()      // in token.ts (line 126-159)
                                            │
                                            └─► messenger.call('TokensController:getState')
                                                    ↳ allTokens[chainId][*] → decimals, symbol
```

**Call Chain to `TokenRatesController` and `CurrencyRateController`:**

```
TransactionPayController (constructor)
    │
    └─► pollTransactionChanges()
            │
            └─► onTransactionChange()
                    │
                    └─► parseRequiredTokens()
                            │
                            └─► buildRequiredToken()
                                    │
                                    └─► getTokenFiatRate()      // in token.ts (line 169-222)
                                            │
                                            ├─► messenger.call('TokenRatesController:getState')
                                            │       ↳ marketData[chainId][token].price → token-to-native rate
                                            │
                                            └─► messenger.call('CurrencyRateController:getState')
                                                    ├─► currencyRates[ticker].conversionRate → native-to-fiat
                                                    └─► currencyRates[ticker].usdConversionRate → native-to-USD
```

**State accessed:**

- **`TokenBalancesController`**: `tokenBalances[account][chainId][token]` → ERC-20 balances
- **`AccountTrackerController`**: `accountsByChainId[chainId][account].balance` → native balance
- **`TokensController`**: `allTokens[chainId][*]` → token metadata (decimals, symbol)
- **`TokenRatesController`**: `marketData[chainId][token].price` → token-to-native price
- **`CurrencyRateController`**: `currencyRates[ticker].conversionRate` → native-to-fiat rate

### `bridge-controller`

Handles cross-chain token bridging and swapping, fetching quotes from bridge providers.

**Call Chain to `CurrencyRateController`, `TokenRatesController`, and `MultichainAssetsRatesController`:**

```
BridgeController
    │
    ├─► #getExchangeRateSources()             // in bridge-controller.ts (line 394-401)
    │       │
    │       ├─► messenger.call('MultichainAssetsRatesController:getState')
    │       │       ↳ conversionRates[assetId].rate → non-EVM asset prices (Solana, Bitcoin)
    │       │
    │       ├─► messenger.call('CurrencyRateController:getState')
    │       │       ↳ currencyRates[ticker].conversionRate → native-to-fiat rate
    │       │       ↳ currencyRates[ticker].usdConversionRate → native-to-USD rate
    │       │
    │       └─► messenger.call('TokenRatesController:getState')
    │               ↳ marketData[chainId][token].price → EVM token-to-native price
    │
    └─► #fetchAssetExchangeRates()            // in bridge-controller.ts (line 413-464)
            │
            └─► messenger.call('CurrencyRateController:getState')
                    ↳ currentCurrency → user's selected fiat currency
```

**How Clients Use Bridge Selectors:**

The exchange rate logic is consumed by UI code via exported selectors:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  CLIENT CODE                                         │
│                                                                             │
│  useSelector(state => selectBridgeQuotes(state, { sortOrder, selectedQuote }))
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │
                                    ▼
selectBridgeQuotes (exported)
    └─► selectSortedBridgeQuotes
          └─► selectBridgeQuotesWithMetadata
                │
                ├─► selectExchangeRateByChainIdAndAddress(srcChainId, srcTokenAddress)
                │       └─► getExchangeRateByChainIdAndAddress(...)
                │
                ├─► selectExchangeRateByChainIdAndAddress(destChainId, destTokenAddress)
                │       └─► getExchangeRateByChainIdAndAddress(...)
                │
                └─► selectExchangeRateByChainIdAndAddress(srcChainId, AddressZero)
                        └─► getExchangeRateByChainIdAndAddress(...)  // for gas fees
```

**Exchange Rate Resolution Logic (getExchangeRateByChainIdAndAddress):**

```
getExchangeRateByChainIdAndAddress()          // in selectors.ts (line 119-189)
    │
    ├─► Check BridgeController.assetExchangeRates[assetId]
    │       ↳ Use if available (fetched when not in assets controllers)
    │
    ├─► If non-EVM chain (Solana, Bitcoin, etc.):
    │       └─► MultichainAssetsRatesController.conversionRates[assetId].rate
    │
    ├─► If EVM native token:
    │       └─► CurrencyRateController.currencyRates[symbol].conversionRate
    │               ↳ Also uses .usdConversionRate for USD values
    │
    └─► If EVM ERC-20 token:
            ├─► TokenRatesController.marketData[chainId][token].price
            │       ↳ Gets token-to-native rate
            │
            └─► CurrencyRateController.currencyRates[currency].conversionRate
                    ↳ Multiplies to get fiat value
```

**State accessed:**

- **`MultichainAssetsRatesController`**: `conversionRates[assetId].rate` → Non-EVM asset prices (Solana SOL, Bitcoin BTC, etc.)
- **`CurrencyRateController`**: `currencyRates[ticker].conversionRate` → Native currency to fiat rates
- **`CurrencyRateController`**: `currencyRates[ticker].usdConversionRate` → Native currency to USD rates
- **`CurrencyRateController`**: `currentCurrency` → User's selected fiat currency
- **`TokenRatesController`**: `marketData[chainId][token].price` → EVM token prices relative to native currency
- **`TokenRatesController`**: `marketData[chainId][token].currency` → Currency denomination of the price


