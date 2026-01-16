# RPC Datasource Architecture

The RPC Datasource is a modular system for fetching and managing blockchain asset data through RPC calls. It provides token detection, balance fetching, and event-driven state updates.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         AssetsController                             │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │                        RpcDatasource                            ││
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ ││
│  │  │ TokenDetector│  │BalanceFetcher│  │    RpcEventEmitter     │ ││
│  │  └──────┬──────┘  └──────┬──────┘  └───────────┬─────────────┘ ││
│  │         │                │                      │               ││
│  │         └────────┬───────┘                      │               ││
│  │                  ▼                              │               ││
│  │         ┌─────────────────┐                     │               ││
│  │         │ MulticallClient │                     │               ││
│  │         └────────┬────────┘                     │               ││
│  │                  │                              │               ││
│  │                  ▼                              ▼               ││
│  │         ┌─────────────────┐          ┌─────────────────────┐   ││
│  │         │   EthProvider   │          │   Event Handlers    │   ││
│  │         │  (RPC Calls)    │          │  (State Updates)    │   ││
│  │         └─────────────────┘          └─────────────────────┘   ││
│  └─────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
```

## Components

### 1. RpcDatasource

The main orchestrator that combines all components and manages polling.

**Responsibilities:**
- Manages polling lifecycle (start/stop/interval)
- Coordinates token detection and balance fetching
- Emits events for state changes
- Configures child components

**Key Methods:**
- `startPolling(input)` - Start polling for a chain/account
- `stopPollingByPollingToken(token)` - Stop specific poll
- `detectTokens(chainId, accountId)` - Manual token detection
- `fetchBalances(chainId, accountId)` - Manual balance fetch

### 2. TokenDetector

Detects new ERC-20 tokens by checking balances against the token list.

**Flow:**
1. Get tokens from `TokenListController` state
2. Filter out already known tokens (imported/detected/ignored)
3. Batch `balanceOf` calls via MulticallClient
4. Return tokens with non-zero balances

**Output:** `TokenDetectionResult` with detected assets and their balances

### 3. BalanceFetcher

Fetches balances for existing tokens (imported + detected).

**Flow:**
1. Get user's tokens from `UserTokensState`
2. Batch `balanceOf` calls via MulticallClient
3. Calculate formatted balances using token decimals
4. Return balance updates

**Output:** `BalanceFetchResult` with updated balances

### 4. MulticallClient

Low-level client for batching RPC calls.

**Features:**
- Batches multiple `balanceOf` calls
- Handles native token balance (`getBalance`)
- Per-chain provider support

### 5. RpcEventEmitter

Event emitter for notifying state changes.

**Events:**
- `assetsChanged` - New tokens detected
- `assetsBalanceChanged` - Balance updates
- `assetsPriceChanged` - Price updates (future)

## Data Flow

### Polling Cycle

```
┌──────────────────────────────────────────────────────────────────┐
│                      _executePoll(input)                          │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  1. Check isTokenDetectionEnabled() getter                        │
│                                                                   │
│  2. Token Detection (if isTokenDetectionEnabled() returns true)   │
│     ┌─────────────────────────────────────────────────────────┐  │
│     │ TokenDetector.detectTokens()                            │  │
│     │   → Get tokens from TokenListController                 │  │
│     │   → Filter out known tokens                             │  │
│     │   → Batch balanceOf calls                               │  │
│     │   → Return tokens with balance > 0                      │  │
│     └─────────────────────────────────────────────────────────┘  │
│              │                                                    │
│              ▼                                                    │
│     ┌─────────────────────────────────────────────────────────┐  │
│     │ Emit Events:                                            │  │
│     │   • assetsChanged (new token metadata)                  │  │
│     │   • assetsBalanceChanged (detected token balances)      │  │
│     └─────────────────────────────────────────────────────────┘  │
│                                                                   │
│  3. Balance Fetching (ALWAYS runs)                                │
│     ┌─────────────────────────────────────────────────────────┐  │
│     │ BalanceFetcher.fetchBalances()                          │  │
│     │   → Get tokens from UserTokensState                     │  │
│     │   → Batch balanceOf calls                               │  │
│     │   → Calculate formatted balances                        │  │
│     │   → Return updated balances                             │  │
│     └─────────────────────────────────────────────────────────┘  │
│              │                                                    │
│              ▼                                                    │
│     ┌─────────────────────────────────────────────────────────┐  │
│     │ Emit Events:                                            │  │
│     │   • assetsBalanceChanged (existing token balances)      │  │
│     └─────────────────────────────────────────────────────────┘  │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

## State Types

### AssetsControllerState

The `AssetsController` maintains a consolidated state with the following structure:

```typescript
type AssetsControllerState = {
  // Shared metadata stored once per asset
  assetsMetadata: Record<CaipAssetType, AssetMetadata>;
  
  // Price data per asset
  assetsPrice: Record<CaipAssetType, AssetPriceData>;
  
  // Per-account balances: AccountId -> AssetId -> BalanceData
  assetsBalance: Record<AccountId, Record<CaipAssetType, AssetBalanceData>>;
  
  // Assets ignored by user
  ignoredAssets: Record<AccountId, CaipAssetType[]>;
};
```

### AssetBalanceData (stored in controller state)

```typescript
type AssetBalanceData = {
  amount?: string;            // Raw balance in wei/smallest unit
  formattedBalance?: string;  // Human-readable (e.g., "1.5")
  decimals?: number;          // Token decimals used for formatting
  tokenIds?: string[];        // For NFTs
  lastUpdated: number;        // Timestamp
};
```

### AssetBalance (event payload)

```typescript
type AssetBalance = {
  assetId: CaipAssetType;     // e.g., "eip155:1/erc20:0xa0b..."
  accountId: AccountId;        // UUID
  chainId: ChainId;           // e.g., "0x1"
  balance: string;            // Raw balance in wei/smallest unit
  formattedBalance: string;   // Human-readable (e.g., "1.5")
  decimals: number;           // Token decimals used for formatting
  timestamp: number;          // When balance was fetched
};
```

### Asset

```typescript
type Asset = {
  assetId: CaipAssetType;     // CAIP-19 identifier
  chainId: ChainId;
  address: Address;
  type: 'native' | 'erc20' | 'erc721' | 'erc1155';
  symbol?: string;
  name?: string;
  decimals?: number;
  image?: string;
  isNative: boolean;
  aggregators?: string[];
};
```

## Usage Examples

### Basic Setup with AssetsController

```typescript
import { AssetsController } from '@metamask/assets-controller';

// Create controller with required dependencies
const assetsController = new AssetsController({
  messenger,
  state: {},
  
  // Required for auto-polling
  getSelectedAccount: () => {
    // Return the currently selected account
    const selectedAddress = preferencesController.state.selectedAddress;
    return accountsController.getAccountByAddress(selectedAddress);
  },
  
  getSelectedChainIds: () => {
    // Return enabled chain IDs
    return networkController.state.enabledChainIds;
  },
  
  // Dynamic token detection toggle (checked each poll cycle)
  isTokenDetectionEnabled: () => {
    // Return whether token detection should run
    return preferencesController.state.useTokenDetection;
  },
  
  // Optional: customize RPC behavior
  rpcDatasourceConfig: {
    pollingIntervalMs: 30000,      // 30 seconds
    detectionBatchSize: 100,
    balanceBatchSize: 100,
  },
});

// Access state
console.log(assetsController.state.assetsBalance);
// {
//   "account-uuid": {
//     "eip155:1/erc20:0xa0b...": {
//       amount: "1500000000",
//       formattedBalance: "1500",
//       decimals: 6,
//       lastUpdated: 1768494903308
//     }
//   }
// }
```

### Manual Token Detection

```typescript
// Trigger detection for a specific chain/account
const result = await assetsController.detectTokens('0x1', 'account-uuid');

console.log(result);
// {
//   chainId: '0x1',
//   accountId: 'account-uuid',
//   detectedAssets: [
//     {
//       assetId: 'eip155:1/erc20:0xa0b...',
//       symbol: 'USDC',
//       name: 'USD Coin',
//       decimals: 6,
//       ...
//     }
//   ],
//   detectedBalances: [
//     {
//       assetId: 'eip155:1/erc20:0xa0b...',
//       balance: '1500000000',
//       formattedBalance: '1500',
//       decimals: 6,
//       ...
//     }
//   ],
//   zeroBalanceAddresses: ['0x123...', '0x456...'],
//   failedAddresses: [],
// }
```

### Manual Balance Fetching

```typescript
// Fetch updated balances for existing tokens
await assetsController.fetchBalances('0x1', 'account-uuid');

// State is automatically updated via event handlers
console.log(assetsController.state.assetsBalance['account-uuid']);
```

### Controlling Polling

```typescript
// Start polling for additional accounts/chains
assetsController.startPolling({ chainId: '0xa', accountId: 'other-account' });

// Stop specific polling
assetsController.stopPollingByPollingToken(pollingToken);

// Stop all polling
assetsController.stopAllPolling();

// Change polling interval
assetsController.setPollingInterval(60000); // 1 minute

// Token detection is controlled via the isTokenDetectionEnabled getter
// passed during construction - no runtime toggle method needed
// Balance fetching is always enabled
```

### Direct RpcDatasource Usage (Advanced)

```typescript
import { RpcDatasource } from '@metamask/assets-controller/rpc-datasource';

// Create datasource directly (for advanced use cases)
const datasource = new RpcDatasource(
  // Dependencies
  {
    getAccount: (id) => accountsController.getAccount(id),
    getTokenListState: () => tokenListController.state,
    getUserTokensState: () => tokensController.state,
    
    // Dynamic token detection toggle (checked each poll)
    isTokenDetectionEnabled: () => preferencesController.state.useTokenDetection,
  },
  // Config (optional)
  {
    pollingIntervalMs: 30000,
    detectionBatchSize: 100,
    balanceBatchSize: 100,
  },
);

// Subscribe to events
datasource.onAssetsChanged((event) => {
  console.log('New tokens detected:', event.assets);
});

datasource.onAssetsBalanceChanged((event) => {
  console.log('Balances updated:', event.balances);
});

// Start polling
const pollingToken = datasource.startPolling({
  chainId: '0x1',
  accountId: 'account-uuid',
});

// Later: stop polling
datasource.stopPollingByPollingToken(pollingToken);

// Cleanup
datasource.destroy();
```

## Configuration Options

### RpcDatasourceConfig

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `pollingIntervalMs` | number | 30000 | Base polling loop interval (30s) |
| `balanceIntervalMs` | number | 30000 | How often to fetch balances (30s) |
| `detectionIntervalMs` | number | 180000 | How often to run token detection (3 min) |
| `detectionBatchSize` | number | 300 | Max tokens per detection batch |
| `balanceBatchSize` | number | 300 | Max tokens per balance batch |
| `rpcTimeoutMs` | number | 30000 | RPC call timeout |

### RpcDatasourceDependencies

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `getAccount` | function | Yes | Function to get account info by ID |
| `getTokenListState` | function | Yes | Function to get token list state |
| `getUserTokensState` | function | Yes | Function to get user tokens state |
| `isTokenDetectionEnabled` | function | No | Dynamic getter for token detection toggle (default: disabled) |
| `multicallClient` | IMulticallClient | No | Custom multicall client |
| `tokenDetector` | ITokenDetector | No | Custom token detector |
| `balanceFetcher` | IBalanceFetcher | No | Custom balance fetcher |

## Event Payloads

### AssetsChangedEvent

```typescript
{
  chainId: '0x1',
  accountId: 'account-uuid',
  assets: Asset[],
  timestamp: 1768494903308,
}
```

### AssetsBalanceChangedEvent

```typescript
{
  chainId: '0x1',
  accountId: 'account-uuid',
  balances: AssetBalance[],
  timestamp: 1768494903308,
}
```

## CAIP-19 Asset IDs

The system uses CAIP-19 identifiers for assets:

| Asset Type | Format | Example |
|------------|--------|---------|
| Native (ETH) | `eip155:{chainId}/slip44:60` | `eip155:1/slip44:60` |
| ERC-20 | `eip155:{chainId}/erc20:{address}` | `eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48` |

Note: `chainId` in CAIP format is decimal (e.g., `1` not `0x1`).

## Error Handling

- Failed RPC calls are tracked in `failedAddresses` arrays
- The system continues processing other tokens even if some fail
- Errors are logged but don't crash the polling cycle
- Individual token failures don't affect other tokens in the batch

## Best Practices

1. **Use AssetsController** for most use cases - it handles state management
2. **Configure appropriate batch sizes** based on RPC rate limits
3. **Use `isTokenDetectionEnabled` getter** to dynamically control token detection based on user preferences
4. **Monitor failed addresses** to identify problematic tokens
5. **Use `formattedBalance`** for UI display, `amount` for calculations
6. **Provide `getSelectedAccount` and `getSelectedChainIds`** for automatic polling based on user selection
7. **Call `destroy()`** when cleaning up to stop polling and remove listeners
