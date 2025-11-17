# `@metamask/core-backend`

Core backend services for MetaMask, serving as the data layer between Backend services (REST APIs, WebSocket services) and Frontend applications (Extension, Mobile). Provides authenticated real-time data delivery including account activity monitoring, price updates, and WebSocket connection management with type-safe controller integration.

## Table of Contents

- [`@metamask/core-backend`](#metamaskcore-backend)
  - [Table of Contents](#table-of-contents)
  - [Installation](#installation)
  - [Quick Start](#quick-start)
    - [Basic Usage](#basic-usage)
    - [Integration with Controllers](#integration-with-controllers)
  - [Architecture \& Design](#architecture--design)
    - [Layered Architecture](#layered-architecture)
    - [Dependencies Structure](#dependencies-structure)
    - [Data Flow](#data-flow)
      - [Sequence Diagram: Real-time Account Activity Flow](#sequence-diagram-real-time-account-activity-flow)
      - [Key Flow Characteristics](#key-flow-characteristics)
  - [WebSocket Connection Management](#websocket-connection-management)
    - [Connection Requirements](#connection-requirements)
    - [Connection Behavior](#connection-behavior)
  - [API Reference](#api-reference)
    - [BackendWebSocketService](#backendwebsocketservice)
      - [Constructor Options](#constructor-options)
      - [Methods](#methods)
    - [AccountActivityService](#accountactivityservice)
      - [Constructor Options](#constructor-options-1)
      - [Methods](#methods-1)
      - [Events Published](#events-published)

## Installation

```bash
yarn add @metamask/core-backend
```

or

```bash
npm install @metamask/core-backend
```

## Quick Start

### Basic Usage

```typescript
import {
  BackendWebSocketService,
  AccountActivityService,
} from '@metamask/core-backend';

// Initialize Backend WebSocket service
const backendWebSocketService = new BackendWebSocketService({
  messenger: backendWebSocketServiceMessenger,
  url: 'wss://api.metamask.io/ws',
  timeout: 15000,
  requestTimeout: 20000,
});

// Initialize Account Activity service
const accountActivityService = new AccountActivityService({
  messenger: accountActivityMessenger,
});

// Connect and subscribe to account activity
await backendWebSocketService.connect();
await accountActivityService.subscribe({
  address: 'eip155:0:0x742d35cc6634c0532925a3b8d40c4e0e2c6e4e6',
});

// Listen for real-time updates
messenger.subscribe('AccountActivityService:transactionUpdated', (tx) => {
  console.log('New transaction:', tx);
});

messenger.subscribe(
  'AccountActivityService:balanceUpdated',
  ({ address, updates }) => {
    console.log(`Balance updated for ${address}:`, updates);
  },
);
```

### Integration with Controllers

```typescript
// Coordinate with TokenBalancesController for fallback polling
messenger.subscribe(
  'BackendWebSocketService:connectionStateChanged',
  (info) => {
    if (info.state === 'CONNECTED') {
      // Reduce polling when WebSocket is active
      messenger.call(
        'TokenBalancesController:updateChainPollingConfigs',
        { '0x1': { interval: 600000 } }, // 10 min backup polling
        { immediateUpdate: false },
      );
    } else {
      // Increase polling when WebSocket is down
      const defaultInterval = messenger.call(
        'TokenBalancesController:getDefaultPollingInterval',
      );
      messenger.call(
        'TokenBalancesController:updateChainPollingConfigs',
        { '0x1': { interval: defaultInterval } },
        { immediateUpdate: true },
      );
    }
  },
);

// Listen for account changes and manage subscriptions
messenger.subscribe(
  'AccountsController:selectedAccountChange',
  async (selectedAccount) => {
    if (selectedAccount) {
      await accountActivityService.subscribe({
        address: selectedAccount.address,
      });
    }
  },
);
```

## Architecture & Design

### Layered Architecture

```mermaid
graph TD
    subgraph "FRONTEND"
        subgraph "Presentation Layer"
            FE[Frontend Applications<br/>MetaMask Extension, Mobile, etc.]
        end

        subgraph "Integration Layer"
            IL[Controllers, State Management, UI]
        end

        subgraph "Data layer (core-backend)"
            subgraph "Domain Services"
                AAS[AccountActivityService]
                PUS[PriceUpdateService<br/>future]
                CS[Custom Services...]
            end

            subgraph "Transport Layer"
                WSS[WebSocketService<br/>• Connection management<br/>• Automatic reconnection<br/>• Message routing<br/>• Subscription management]
                HTTP[HTTP Service<br/>• REST API calls<br/>• Request/response handling<br/>• Error handling<br/>future]
            end
        end
    end

    subgraph "BACKEND"
        BS[Backend Services<br/>REST APIs, WebSocket Services, etc.]
    end

    %% Flow connections
    FE --> IL
    IL --> AAS
    IL --> PUS
    IL --> CS
    AAS --> WSS
    AAS --> HTTP
    PUS --> WSS
    PUS --> HTTP
    CS --> WSS
    CS --> HTTP
    WSS <--> BS
    HTTP <--> BS

    %% Styling
    classDef frontend fill:#e1f5fe
    classDef backend fill:#f3e5f5
    classDef service fill:#e8f5e8
    classDef transport fill:#fff3e0

    class FE,IL frontend
    class BS backend
    class AAS,PUS,CS service
    class WSS,HTTP transport
```

### Dependencies Structure

```mermaid
graph BT
    %% External Controllers
    AC["AccountsController<br/>(Auto-generated types)"]
    AuthC["AuthenticationController<br/>(Auto-generated types)"]
    TBC["TokenBalancesController<br/>(External Integration)"]

    %% Core Services
    AA["AccountActivityService"]
    WS["BackendWebSocketService"]

    %% Dependencies & Type Imports
    AC -.->|"Import types<br/>(DRY)" | AA
    AuthC -.->|"Import types<br/>(DRY)" | WS
    WS -->|"Messenger calls"| AA
    AA -.->|"Event publishing"| TBC

    %% Styling
    classDef core fill:#f3e5f5
    classDef integration fill:#fff3e0
    classDef controller fill:#e8f5e8

    class WS,AA core
    class TBC integration
    class AC,AuthC controller
```

### Data Flow

#### Sequence Diagram: Real-time Account Activity Flow

```mermaid
sequenceDiagram
    participant TBC as TokenBalancesController
    participant AA as AccountActivityService
    participant WS as BackendWebSocketService
    participant HTTP as HTTP Services<br/>(APIs & RPC)
    participant Backend as WebSocket Endpoint<br/>(Backend)

    Note over TBC,Backend: Initial Setup
    TBC->>HTTP: Initial balance fetch via HTTP<br/>(first request for current state)

    WS->>Backend: WebSocket connection request
    Backend->>WS: Connection established
    WS->>AA: WebSocket connection status notification<br/>(BackendWebSocketService:connectionStateChanged)<br/>{state: 'CONNECTED'}

    AA->>AA: call('AccountsController:getSelectedAccount')
    AA->>WS: subscribe({channels, callback})
    WS->>Backend: {event: 'subscribe', channels: ['account-activity.v1.eip155:0:0x123...']}
    Backend->>WS: {event: 'subscribe-response', subscriptionId: 'sub-456'}

    Note over WS,Backend: System notification sent automatically upon subscription
    Backend->>WS: {event: 'system-notification', data: {chainIds: ['eip155:1', 'eip155:137', ...], status: 'up'}}
    WS->>AA: System notification received
    AA->>AA: Track chains as 'up' internally
    AA->>TBC: Chain availability notification<br/>(AccountActivityService:statusChanged)<br/>{chainIds: ['0x1', '0x89', ...], status: 'up'}
    TBC->>TBC: Increase polling interval from 20s to 10min<br/>(.updateChainPollingConfigs({0x89: 600000}))

    Note over TBC,Backend: User Account Change

    par StatusChanged Event
      TBC->>HTTP: Fetch balances for new account<br/>(fill transition gap)
    and Account Subscription
      AA->>AA: User switched to different account<br/>(AccountsController:selectedAccountChange)
      AA->>WS: subscribe (new account)
      WS->>Backend: {event: 'subscribe', channels: ['account-activity.v1.eip155:0:0x456...']}
      Backend->>WS: {event: 'subscribe-response', subscriptionId: 'sub-789'}
      AA->>WS: unsubscribe (previous account)
      WS->>Backend: {event: 'unsubscribe', subscriptionId: 'sub-456'}
      Backend->>WS: {event: 'unsubscribe-response'}
    end


    Note over TBC,Backend: Real-time Data Flow

    Backend->>WS: {event: 'notification', channel: 'account-activity.v1.eip155:0:0x123...',<br/>data: {address, tx, updates}}
    WS->>AA: Direct callback routing
    AA->>AA: Validate & process AccountActivityMessage

    par Balance Update
        AA->>TBC: Real-time balance change notification<br/>(AccountActivityService:balanceUpdated)<br/>{address, chain, updates}
        TBC->>TBC: Update balance state directly<br/>(or fallback poll if error)
    and Transaction and Activity Update (Not yet implemented)
        AA->>AA: Process transaction data<br/>(AccountActivityService:transactionUpdated)<br/>{tx: Transaction}
        Note right of AA: Future: Forward to TransactionController<br/>for transaction state management<br/>(pending → confirmed → finalized)
    end

    Note over TBC,Backend: System Notifications

    Backend->>WS: {event: 'system-notification', data: {chainIds: ['eip155:137'], status: 'down'}}
    WS->>AA: System notification received
    AA->>AA: Process chain status change
    AA->>TBC: Chain status notification<br/>(AccountActivityService:statusChanged)<br/>{chainIds: ['eip155:137'], status: 'down'}
    TBC->>TBC: Decrease polling interval from 10min to 20s<br/>(.updateChainPollingConfigs({0x89: 20000}))
    TBC->>HTTP: Fetch balances immediately

    Backend->>WS: {event: 'system-notification', data: {chainIds: ['eip155:137'], status: 'up'}}
    WS->>AA: System notification received
    AA->>AA: Process chain status change
    AA->>TBC: Chain status notification<br/>(AccountActivityService:statusChanged)<br/>{chainIds: ['eip155:137'], status: 'up'}
    TBC->>TBC: Increase polling interval from 20s to 10min<br/>(.updateChainPollingConfigs({0x89: 600000}))

    Note over TBC,Backend: Connection Health Management

    Backend-->>WS: Connection lost
    WS->>AA: WebSocket connection status notification<br/>(BackendWebSocketService:connectionStateChanged)<br/>{state: 'DISCONNECTED'}
    AA->>AA: Mark all tracked chains as 'down'<br/>(flush internal tracking set)
    AA->>TBC: Chain status notification for all tracked chains<br/>(AccountActivityService:statusChanged)<br/>{chainIds: ['0x1', '0x89', ...], status: 'down'}
    TBC->>TBC: Decrease polling interval from 10min to 20s<br/>(.updateChainPollingConfigs({0x89: 20000}))
    TBC->>HTTP: Fetch balances immediately
    WS->>WS: Automatic reconnection<br/>with exponential backoff
    WS->>Backend: Reconnection successful

    Note over AA,Backend: Restart initial setup - resubscribe and get fresh chain status
    AA->>WS: subscribe (same account, new subscription)
    WS->>Backend: {event: 'subscribe', channels: ['account-activity.v1.eip155:0:0x123...']}
    Backend->>WS: {event: 'subscribe-response', subscriptionId: 'sub-999'}
    Backend->>WS: {event: 'system-notification', data: {chainIds: [...], status: 'up'}}
    WS->>AA: System notification received
    AA->>AA: Track chains as 'up' again
    AA->>TBC: Chain availability notification<br/>(AccountActivityService:statusChanged)<br/>{chainIds: [...], status: 'up'}
    TBC->>TBC: Increase polling interval back to 10min
```

#### Key Flow Characteristics

1. **Initial Setup**: BackendWebSocketService establishes connection, then AccountActivityService subscribes to selected account. Backend automatically sends a system notification with all chains that are currently up. AccountActivityService tracks these chains internally and notifies TokenBalancesController, which increases polling interval to 5 min
2. **Chain Status Tracking**: AccountActivityService maintains an internal set of chains that are 'up' based on system notifications. On disconnect, it marks all tracked chains as 'down' before clearing the set
3. **System Notifications**: Backend automatically sends chain status updates (up/down) upon subscription and when status changes. AccountActivityService forwards these to TokenBalancesController, which adjusts polling intervals (up: 5min, down: 30s + immediate fetch)
4. **User Account Changes**: When users switch accounts, AccountActivityService unsubscribes from old account and subscribes to new account. Backend sends fresh system notification with current chain status for the new account
5. **Connection Resilience**: On reconnection, AccountActivityService resubscribes to selected account and receives fresh chain status via system notification. Automatic reconnection with exponential backoff
6. **Real-time Updates**: Backend pushes data through: Backend → BackendWebSocketService → AccountActivityService → TokenBalancesController (+ future TransactionController integration)
7. **Parallel Processing**: Transaction and balance updates processed simultaneously - AccountActivityService publishes both transactionUpdated (future) and balanceUpdated events in parallel
8. **Direct Balance Processing**: Real-time balance updates bypass HTTP polling and update TokenBalancesController state directly

## WebSocket Connection Management

### Connection Requirements

The WebSocket connects when **ALL 3 conditions are true**:

1. ✅ **Feature enabled** - `isEnabled()` callback returns `true` (feature flag)
2. ✅ **User signed in** - `AuthenticationController.isSignedIn = true`
3. ✅ **Wallet unlocked** - `KeyringController.isUnlocked = true`

**Plus:** Platform code must call `connect()` when app opens/foregrounds and `disconnect()` when app closes/backgrounds.

### Connection Behavior

**Idempotent `connect()`:**

- Safe to call multiple times - validates conditions and returns early if already connected
- Multiple rapid calls reuse the same connection promise (no duplicate connections)
- No debouncing needed - handled automatically

**Auto-Reconnect:**

- ✅ **Unexpected disconnects** (network issues, server restart) → Auto-reconnect
- ❌ **Manual disconnects** (app backgrounds, wallet locks, user signs out) → Stay disconnected

## API Reference

### BackendWebSocketService

The core WebSocket client providing connection management, authentication, and message routing.

#### Constructor Options

```typescript
interface BackendWebSocketServiceOptions {
  messenger: BackendWebSocketServiceMessenger;
  url: string;
  timeout?: number;
  reconnectDelay?: number;
  maxReconnectDelay?: number;
  requestTimeout?: number;
  enableAuthentication?: boolean;
  enabledCallback?: () => boolean;
}
```

#### Methods

- `connect(): Promise<void>` - Establish authenticated WebSocket connection
- `disconnect(): Promise<void>` - Close WebSocket connection
- `subscribe(options: SubscriptionOptions): Promise<SubscriptionResult>` - Subscribe to channels
- `sendRequest(message: ClientRequestMessage): Promise<ServerResponseMessage>` - Send request/response messages
- `channelHasSubscription(channel: string): boolean` - Check subscription status
- `findSubscriptionsByChannelPrefix(prefix: string): SubscriptionInfo[]` - Find subscriptions by prefix
- `getConnectionInfo(): WebSocketConnectionInfo` - Get detailed connection state

### AccountActivityService

High-level service for monitoring account activity using WebSocket data.

#### Constructor Options

```typescript
interface AccountActivityServiceOptions {
  messenger: AccountActivityServiceMessenger;
  subscriptionNamespace?: string;
}
```

#### Methods

- `subscribe(subscription: SubscriptionOptions): Promise<void>` - Subscribe to account activity
- `unsubscribe(subscription: SubscriptionOptions): Promise<void>` - Unsubscribe from account activity

#### Events Published

- `AccountActivityService:balanceUpdated` - Real-time balance changes
- `AccountActivityService:transactionUpdated` - Transaction status updates
- `AccountActivityService:statusChanged` - Chain/service status changes
