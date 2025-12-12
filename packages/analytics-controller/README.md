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
  onSetupCompleted: (analyticsId: string) => {
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
  const [savedAnalyticsId, savedOptedIn] = await Promise.all([
    storage.getItem('analytics.id'),
    storage.getItem('analytics.optedIn'),
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
  const optedIn =
    savedOptedIn !== null ? savedOptedIn === 'true' : defaults.optedIn;

  return {
    analyticsId,
    optedIn,
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
  storage.setItem('analytics.optedIn', String(state.optedIn));
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
    isAnonymousEventsFeatureEnabled: false, // Optional: enables anonymous event tracking (default: false)
  });

  // 3. Initialize the controller (calls platform adapter's onSetupCompleted hook)
  controller.init();

  // 4. Subscribe to state changes for persistence
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

// Events are filtered when analytics is disabled (optedIn is false)
```

#### Anonymous Events Feature

When `isAnonymousEventsFeatureEnabled` is enabled in the constructor, events with sensitive properties are split into separate events:

- **Regular properties event**: Tracked first with only `properties` (uses user ID)
- **Sensitive properties event**: Tracked separately with both `properties` and `sensitiveProperties` (uses anonymous ID)

This allows sensitive data to be tracked anonymously while maintaining user identification for regular properties.

When `isAnonymousEventsFeatureEnabled` is disabled (default), all properties are tracked in a single event.

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
// Opt in/out
controller.optIn();
controller.optOut();

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

messenger.call('AnalyticsController:optIn');
```

## State Management

### Default State

Use `getDefaultAnalyticsControllerState()` to get default values for opt-in preferences:

```typescript
import { getDefaultAnalyticsControllerState } from '@metamask/analytics-controller';

const defaults = getDefaultAnalyticsControllerState();
// Returns: { optedIn: false }
// Note: analyticsId is NOT included - platform must provide it
```

### State Structure

| Field         | Type      | Description                            | Persisted |
| ------------- | --------- | -------------------------------------- | --------- |
| `analyticsId` | `string`  | UUIDv4 identifier (platform-generated) | No        |
| `optedIn`     | `boolean` | User opt-in status                     | Yes       |

**Note:** While `optedIn` is persisted by the controller, the platform should still subscribe to state changes and persist to isolated storage for resilience (see [Why Platform-Managed Storage?](#why-platform-managed-storage)).

### Why `analyticsId` Has No Default

The `analyticsId` is used to uniquely identify the user. If the controller generated a new ID each time the client booted, the ID would be ineffective. Instead, the ID must be pre-generated or retrieved from storage and then passed into the controller.

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
onSetupCompleted: (analyticsId: string) => {
  // analyticsId is guaranteed to be a valid UUIDv4
  client.add({ plugin: new PrivacyPlugin(analyticsId) });
},
```

Errors in `onSetupCompleted` are caught and logged—they don't break the controller.

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
