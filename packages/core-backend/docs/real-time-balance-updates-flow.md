# Real-Time Balance Updates and Status Management Flow

This document describes the architecture and flow for real-time balance updates and WebSocket status management in MetaMask Core, specifically focusing on the `AccountActivityService:balanceUpdated` and `AccountActivityService:statusChanged` events.

## Overview

The system provides real-time balance updates and intelligent polling management through a multi-layered architecture that combines WebSocket streaming with fallback HTTP polling. The key components work together to ensure users receive timely balance updates while optimizing network usage and battery consumption.

## Architecture Components

### 1. BackendWebSocketService

- **Purpose**: Low-level WebSocket connection management
- **Responsibilities**:
  - Maintains WebSocket connection with automatic reconnection
  - Handles subscription management
  - Routes incoming messages to registered callbacks
  - Publishes connection state changes

### 2. AccountActivityService

- **Purpose**: High-level account activity monitoring
- **Responsibilities**:
  - Subscribes to selected account activity
  - Processes transaction and balance updates
  - Emits `balanceUpdated` and `statusChanged` events
  - Manages chain status based on WebSocket connectivity and system notifications

### 3. TokenBalancesController

- **Purpose**: Token balance state management and intelligent polling
- **Responsibilities**:
  - Maintains token balance state for all accounts
  - Implements per-chain configurable polling intervals
  - Responds to real-time balance updates from AccountActivityService
  - Dynamically adjusts polling based on WebSocket availability
  - Imports newly detected tokens via TokenDetectionController

## Event Flow

### Balance Update Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        BALANCE UPDATE FLOW                               │
└─────────────────────────────────────────────────────────────────────────┘

1. WebSocket receives account activity message
   ↓
2. BackendWebSocketService routes message to registered callback
   ↓
3. AccountActivityService processes AccountActivityMessage
   {
     address: "0x123...",
     tx: { hash: "0x...", chain: "eip155:1", status: "completed", ... },
     updates: [
       {
         asset: { fungible: true, type: "eip155:1/erc20:0x...", unit: "USDT" },
         postBalance: { amount: "1254.75" },
         transfers: [{ from: "0x...", to: "0x...", amount: "500.00" }]
       }
     ]
   }
   ↓
4. AccountActivityService publishes separate events:
   - AccountActivityService:transactionUpdated (transaction data)
   - AccountActivityService:balanceUpdated (balance updates)
   ↓
5. TokenBalancesController receives balanceUpdated event
   ↓
6. TokenBalancesController processes balance updates:
   a. Parses CAIP chain ID (e.g., "eip155:1" → "0x1")
   b. Parses asset types:
      - ERC20 tokens: "eip155:1/erc20:0x..." → token address
      - Native tokens: "eip155:1/slip44:60" → zero address
   c. Validates addresses and checksums them
   d. Checks if tokens are tracked (imported or detected)
   ↓
7. For tracked tokens:
   - Updates tokenBalances state immediately
   - Updates AccountTrackerController for native balances
   ↓
8. For untracked ERC20 tokens:
   - Queues tokens for import via TokenDetectionController
   - Triggers fallback polling to fetch newly imported token balances
   ↓
9. On errors:
   - Falls back to HTTP polling for the affected chain
```

### Status Change Flow

The system manages chain status through two primary mechanisms:

#### A. WebSocket Connection State Changes

```
┌─────────────────────────────────────────────────────────────────────────┐
│              WEBSOCKET CONNECTION STATUS FLOW                            │
└─────────────────────────────────────────────────────────────────────────┘

1. BackendWebSocketService detects connection state change
   (CONNECTING → CONNECTED | DISCONNECTED | ERROR)
   ↓
2. BackendWebSocketService publishes:
   BackendWebSocketService:connectionStateChanged
   ↓
3. AccountActivityService receives connection state change
   ↓
4. AccountActivityService determines affected chains:
   - Fetches list of supported chains from backend API
   - Example: ["eip155:1", "eip155:137", "eip155:56"]
   ↓
5. AccountActivityService publishes status based on connection state:

   IF state === CONNECTED:
     → Publishes: statusChanged { chainIds: [...], status: 'up' }
     → Triggers resubscription to selected account

   IF state === DISCONNECTED || ERROR:
     → Publishes: statusChanged { chainIds: [...], status: 'down' }
   ↓
6. TokenBalancesController receives statusChanged event
   ↓
7. TokenBalancesController applies debouncing (5 second window)
   - Accumulates status changes to prevent excessive updates
   - Latest status wins for each chain
   ↓
8. After debounce period, processes accumulated changes:
   - Converts CAIP format to hex (e.g., "eip155:1" → "0x1")
   - Calculates new polling intervals:
     * status = 'down' → Uses default interval (30 seconds)
     * status = 'up' → Uses extended interval (5 minutes)
   ↓
9. Adds jitter delay (0 to default interval)
   - Prevents synchronized requests across instances
   ↓
10. Updates chain polling configurations
    - Triggers immediate balance fetch
    - Restarts polling with new intervals
```

#### B. System Notifications (Per-Chain Status)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                SYSTEM NOTIFICATION STATUS FLOW                           │
└─────────────────────────────────────────────────────────────────────────┘

1. WebSocket receives system notification message
   {
     type: 'system',
     chainIds: ['eip155:1'],  // Specific affected chains
     status: 'down'            // or 'up'
   }
   ↓
2. BackendWebSocketService routes to AccountActivityService
   ↓
3. AccountActivityService validates notification:
   - Ensures chainIds array is present and valid
   - Ensures status is present
   ↓
4. AccountActivityService publishes delta update:
   AccountActivityService:statusChanged
   {
     chainIds: ['eip155:1'],  // Only affected chains
     status: 'down'
   }
   ↓
5. TokenBalancesController processes (same as WebSocket flow above)
```

#### Status Change Event Format

```typescript
// Event published by AccountActivityService
AccountActivityService:statusChanged
Payload: {
  chainIds: string[];       // Array of CAIP chain IDs (e.g., ["eip155:1", "eip155:137"])
  status: 'up' | 'down';   // Connection status
}
```

## Polling Strategy

The TokenBalancesController implements intelligent polling that adapts based on WebSocket availability:

### Polling Intervals

| Scenario                                  | Interval             | Reason                                              |
| ----------------------------------------- | -------------------- | --------------------------------------------------- |
| WebSocket Connected (`status: 'up'`)      | 5 minutes            | Real-time updates available, polling is backup only |
| WebSocket Disconnected (`status: 'down'`) | 30 seconds (default) | Primary update mechanism, needs faster polling      |
| Per-chain custom configuration            | Configurable         | Allows fine-tuning per chain requirements           |

### Debouncing Strategy

To prevent excessive HTTP calls during unstable connections:

1. **Accumulation Window**: 5 seconds

   - All status changes within this window are accumulated
   - Latest status wins for each chain

2. **Jitter Addition**: Random delay (0 to default interval)

   - Prevents synchronized requests across multiple instances
   - Reduces backend load spikes

3. **Batch Processing**: After debounce + jitter
   - All accumulated changes applied at once
   - Single polling configuration update
   - Immediate balance fetch triggered

### Per-Chain Polling Configuration

TokenBalancesController supports per-chain polling intervals:

```typescript
// Configure custom intervals for specific chains
tokenBalancesController.updateChainPollingConfigs({
  '0x1': { interval: 30000 }, // Ethereum: 30 seconds (default)
  '0x89': { interval: 15000 }, // Polygon: 15 seconds (faster)
  '0xa4b1': { interval: 60000 }, // Arbitrum: 1 minute (slower)
});
```

## Token Discovery Flow

When balance updates include previously unknown tokens:

```
1. TokenBalancesController receives balance update for unknown token
   ↓
2. Checks if token is tracked (in allTokens or allIgnoredTokens)
   ↓
3. If NOT tracked:
   a. Queues token for import
   b. Calls TokenDetectionController:addDetectedTokensViaWs
   c. Token is added to detected tokens list
   ↓
4. Triggers balance fetch for the chain
   ↓
5. New token balance is fetched and state is updated
```

## References

- [`TokenBalancesController.ts`](../packages/assets-controllers/src/TokenBalancesController.ts) - Main controller implementation
- [`AccountActivityService.ts`](../packages/core-backend/src/AccountActivityService.ts) - Account activity monitoring
- [`BackendWebSocketService.ts`](../packages/core-backend/src/BackendWebSocketService.ts) - WebSocket connection management
- [`types.ts`](../packages/core-backend/src/types.ts) - Type definitions
- [Core Backend README](../packages/core-backend/README.md) - Package overview
