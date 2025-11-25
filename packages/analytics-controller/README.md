# `@metamask/analytics-controller`

Common Analytics controller for event tracking.

## Features

- Unified interface for tracking analytics events, identifying users, and managing preferences
- Delegates platform-specific implementation to `AnalyticsPlatformAdapter`
- Integrates with the MetaMask messenger system for inter-controller communication
- Platform-managed storage: controller doesn't persist state internally

## Installation

`yarn add @metamask/analytics-controller`

or

`npm install @metamask/analytics-controller`

## Usage

### 1. Create a Platform Adapter

The controller delegates platform-specific analytics implementation to an `AnalyticsPlatformAdapter`:

```typescript
import type { AnalyticsPlatformAdapter } from '@metamask/analytics-controller';

const platformAdapter: AnalyticsPlatformAdapter = {
  track: (eventName: string, properties?: Record<string, unknown>) => {
    segment.track(eventName, properties);
  },
  identify: (userId: string, traits?: Record<string, unknown>) => {
    segment.identify(userId, traits);
  },
  view: (name: string, properties?: Record<string, unknown>) => {
    segment.page(name, properties);
  },
  onSetupCompleted: async (analyticsId: string) => {
    // Lifecycle hook called after controller initialization
    // The analyticsId is guaranteed to be set when this method is called
    // Use this for platform-specific setup that requires the analytics ID
    // For example, adding plugins that need the analytics ID:
    segment.add({
      plugin: new PrivacyPlugin(analyticsId),
    });
  },
};
```

### 2. Load Analytics Settings from Storage

The platform is responsible for loading and persisting analytics settings—the controller does not handle storage internally. This design allows:

- **Early access**: Platform can read the `analyticsId` before the controller is initialized (useful for other controllers or early startup code)
- **Resilience**: Storing analytics settings separately from main state protects them from state corruption, allowing analytics to continue working even when main state is corrupted

Load settings **before** initializing the controller:

```typescript
import { v4 as uuidv4 } from 'uuid';
import {
  getDefaultAnalyticsControllerState,
  type AnalyticsControllerState,
} from '@metamask/analytics-controller';

async function loadAnalyticsSettings(): Promise<AnalyticsControllerState> {
  // Load from platform storage (e.g., MMKV, AsyncStorage, localStorage)
  const [savedAnalyticsId, savedOptedInRegular, savedOptedInSocial] =
    await Promise.all([
      storage.getItem('analytics.id'),
      storage.getItem('analytics.optedInForRegularAccount'),
      storage.getItem('analytics.optedInForSocialAccount'),
    ]);

  const defaults = getDefaultAnalyticsControllerState();

  // Generate UUID on first run if not in storage
  let analyticsId = savedAnalyticsId;
  if (!analyticsId) {
    analyticsId = uuidv4();
    // Persist immediately - this ID must never change
    await storage.setItem('analytics.id', analyticsId);
  }

  // Parse boolean values (stored as strings)
  const optedInForRegularAccount =
    savedOptedInRegular !== null
      ? savedOptedInRegular === 'true'
      : defaults.optedInForRegularAccount;

  const optedInForSocialAccount =
    savedOptedInSocial !== null
      ? savedOptedInSocial === 'true'
      : defaults.optedInForSocialAccount;

  return {
    analyticsId,
    optedInForRegularAccount,
    optedInForSocialAccount,
  };
}
```

### 3. Initialize the Controller

Create the controller with loaded state and subscribe to state changes for persistence:

```typescript
import {
  AnalyticsController,
  type AnalyticsControllerState,
} from '@metamask/analytics-controller';

// Persist state changes to storage (fire-and-forget)
function persistAnalyticsSettings(state: AnalyticsControllerState): void {
  storage.setItem('analytics.id', state.analyticsId);
  storage.setItem(
    'analytics.optedInForRegularAccount',
    String(state.optedInForRegularAccount),
  );
  storage.setItem(
    'analytics.optedInForSocialAccount',
    String(state.optedInForSocialAccount),
  );
}

async function initializeAnalyticsController(
  messenger: AnalyticsControllerMessenger,
): Promise<AnalyticsController> {
  // 1. Load settings from storage
  const state = await loadAnalyticsSettings();

  // 2. Create controller with loaded state
  const controller = new AnalyticsController({
    messenger,
    platformAdapter,
    state, // Must include valid UUIDv4 analyticsId
  });

  // 3. Subscribe to state changes for persistence
  messenger.subscribe('AnalyticsController:stateChange', (newState) => {
    persistAnalyticsSettings(newState);
  });

  return controller;
}
```

### 4. Access Analytics ID Before Controller Init

One benefit of platform-managed storage is accessing the analytics ID before the controller is initialized:

```typescript
async function getAnalyticsId(): Promise<string | null> {
  return storage.getItem('analytics.id');
}

// Use in other controllers or early initialization
const analyticsId = await getAnalyticsId();
if (analyticsId) {
  // Use analyticsId before AnalyticsController is ready
}
```

### 5. Track Events

```typescript
// Track event with properties
controller.trackEvent({
  name: 'wallet_connected',
  properties: { network: 'ethereum', account_type: 'hd' },
  sensitiveProperties: {},
  hasProperties: true,
  saveDataRecording: true,
});

// Events are filtered when analytics is disabled (both opt-ins are false)
```

### 6. Identify Users

```typescript
controller.identify({
  ENABLE_OPENSEA_API: 'ON',
  NFT_AUTODETECTION: 'ON',
});

// Uses the analyticsId from controller state
```

### 7. Track Page Views

```typescript
controller.trackView('home', {
  referrer: 'google',
  campaign: 'summer-2024',
});
```

### 8. Manage Analytics Preferences

```typescript
// Opt in/out for regular account
controller.optInForRegularAccount();
controller.optOutForRegularAccount();

// Opt in/out for social account
controller.optInForSocialAccount();
controller.optOutForSocialAccount();

// Changes trigger stateChange event → platform persists to storage
```

### 9. Use Messenger Actions

```typescript
// From another controller
messenger.call('AnalyticsController:trackEvent', {
  name: 'wallet_created',
  properties: { wallet_type: 'hd' },
  sensitiveProperties: {},
  hasProperties: true,
  saveDataRecording: true,
});

messenger.call('AnalyticsController:optInForRegularAccount');
```

## State Management

### Default State

Use `getDefaultAnalyticsControllerState()` to get default values for opt-in preferences:

```typescript
import { getDefaultAnalyticsControllerState } from '@metamask/analytics-controller';

const defaults = getDefaultAnalyticsControllerState();
// Returns: { optedInForRegularAccount: false, optedInForSocialAccount: false }
// Note: analyticsId is NOT included - platform must provide it
```

### State Structure

| Field                      | Type      | Description                            |
| -------------------------- | --------- | -------------------------------------- |
| `analyticsId`              | `string`  | UUIDv4 identifier (platform-generated) |
| `optedInForRegularAccount` | `boolean` | User opt-in status for regular account |
| `optedInForSocialAccount`  | `boolean` | User opt-in status for social account  |

### Why `analyticsId` Has No Default

The `analyticsId` is an **identity** (unique per user), not a **preference** (static default). A default should return the same value each call (deterministic), but a UUID must be unique each time (non-deterministic). These are mutually exclusive.

**Solution:** Platform generates the UUID once on first run, persists it, and provides it to the controller.

### Platform Responsibilities

1. **Generate UUID on first run**: Use `uuid` package or platform equivalent
2. **Load state before controller init**: Read from storage, provide to constructor
3. **Subscribe to state changes**: Persist changes to storage
4. **Persist to isolated storage**: Keep analytics settings separate from main state (protects against state corruption)

### Why Platform-Managed Storage?

- **Access before controller init**: Other code can read analytics ID early
- **Protection from state corruption**: Analytics settings in separate storage survive main state corruption
- **Analytics during corruption**: Can still report issues even when main state is corrupted
- **Platform flexibility**: Each platform uses its preferred storage mechanism

## Lifecycle Hooks

### `onSetupCompleted`

Called once after controller initialization with guaranteed valid `analyticsId`:

```typescript
onSetupCompleted: async (analyticsId: string) => {
  // analyticsId is guaranteed to be a valid UUIDv4
  client.add({ plugin: new PrivacyPlugin(analyticsId) });
},
```

Errors in `onSetupCompleted` are caught and logged—they don't break the controller.

## Debugging

Enable debug logging:

```bash
export DEBUG="metamask:analytics-controller"
```

## Development

### Build

```bash
yarn install && yarn workspace @metamask/analytics-controller build
```

### Test

```bash
yarn install && yarn workspace @metamask/analytics-controller test
```

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
