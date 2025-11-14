# `@metamask/analytics-controller`

Common Analytics controller for event tracking.

## Features

- Provides a unified interface for:
  - Tracking analytics events
  - Identifying users
  - Managing analytics preferences (enable/disable, opt-in/opt-out)
- Delegates platform-specific implementation to `AnalyticsPlatformAdapter`
- Integrates with the MetaMask messenger system for inter-controller communication
- Supports state persistence and migrations

## Installation

`yarn add @metamask/analytics-controller`

or

`npm install @metamask/analytics-controller`

## Usage

### 1. Create a Platform Adapter

The controller delegates platform-specific analytics implementation to a `AnalyticsPlatformAdapter`. You must provide an adapter that implements the required methods:

```typescript
import type { AnalyticsPlatformAdapter } from '@metamask/analytics-controller';

const platformAdapter: AnalyticsPlatformAdapter = {
  trackEvent: (eventName: string, properties: Record<string, unknown>) => {
    // Platform-specific implementation (e.g., Segment, Mixpanel, etc.)
    segment.track(eventName, properties);
  },
  identify: (userId: string, traits?: Record<string, unknown>) => {
    segment.identify(userId, traits);
  },
  trackPage: (pageName: string, properties?: Record<string, unknown>) => {
    segment.page(pageName, properties);
  },
};
```

### 2. Initialize the Controller

#### Basic Initialization (Uses Defaults)

The controller uses default state values when no `state` parameter is provided:

```typescript
import { AnalyticsController } from '@metamask/analytics-controller';
import { Messenger } from '@metamask/messenger';

const messenger = new Messenger({ namespace: 'AnalyticsController' });

const controller = new AnalyticsController({
  messenger,
  platformAdapter,
  // State defaults to:
  // - enabled: true
  // - optedIn: false
  // - analyticsId: auto-generated UUIDv4 (if not provided)
});
```

#### Custom Initial State

You can provide partial state to override defaults:

```typescript
const controller = new AnalyticsController({
  messenger,
  platformAdapter,
  state: {
    enabled: false, // Override default (true)
    optedIn: true, // Override default (false)
    analyticsId: '550e8400-e29b-41d4-a716-446655440000', // Override default
  },
});
```

**Important:** The `state` parameter is the single source of truth for initial values. Any properties you provide will override the defaults from `getDefaultAnalyticsControllerState()`.

### 3. Track Events

```typescript
// Track a simple event
controller.trackEvent('wallet_connected', {
  network: 'ethereum',
  account_type: 'hd',
});

// Events are automatically filtered when analytics is disabled
controller.disable();
controller.trackEvent('some_event'); // This will not be tracked
```

### 4. Identify Users

```typescript
controller.identify('550e8400-e29b-41d4-a716-446655440000', {
  email: 'user@example.com',
  plan: 'premium',
});

// The analytics ID is automatically stored in controller state
console.log(controller.state.analyticsId); // '550e8400-e29b-41d4-a716-446655440000'
```

### 5. Track Page Views

```typescript
controller.trackPage('home', {
  referrer: 'google',
  campaign: 'summer-2024',
});
```

### 6. Manage Analytics State

```typescript
// Enable/disable analytics
controller.enable();
controller.disable();

// Opt in/out
controller.optIn();
controller.optOut();
```

### 7. Use Messenger Actions

The controller exposes methods as messenger actions for inter-controller communication:

```typescript
// From another controller
messenger.call('AnalyticsController:trackEvent', 'wallet_created', {
  wallet_type: 'hd',
});

messenger.call(
  'AnalyticsController:identify',
  '550e8400-e29b-41d4-a716-446655440000',
  {
    email: 'newuser@example.com',
  },
);

messenger.call('AnalyticsController:enable');
messenger.call('AnalyticsController:disable');
messenger.call('AnalyticsController:optIn');
messenger.call('AnalyticsController:optOut');
```

### 8. Subscribe to State Changes

```typescript
messenger.subscribe('AnalyticsController:stateChange', (state, prevState) => {
  console.log('Analytics state changed:', {
    enabled: state.enabled,
    optedIn: state.optedIn,
    analyticsId: state.analyticsId,
  });
});
```

## State Management

### Default State

The default state is provided by `getDefaultAnalyticsControllerState()`:

```typescript
import { getDefaultAnalyticsControllerState } from '@metamask/analytics-controller';

const defaultState = getDefaultAnalyticsControllerState();
// {
//   enabled: true,
//   optedIn: false,
//   analyticsId: auto-generated UUIDv4
// }
```

### Initialization Strategy

- **No `state` parameter**: Uses defaults from `getDefaultAnalyticsControllerState()` and auto-generates `analyticsId` as UUIDv4
- **Partial `state`**: Merges with defaults (user-provided values override defaults); `analyticsId` is auto-generated if not provided
- **Complete `state`**: Full control for migrations and advanced use cases

**Best Practice:** Use `state` as the single source of truth for initial values. Do not use convenience parameters—they have been removed to ensure consistency.

**Analytics ID:** The `analyticsId` is a UUIDv4 string. If not provided in the `state` parameter, the controller automatically generates one on initialization. This ID is persisted in state and remains consistent across restarts. If you provide an `analyticsId` in the `state` parameter, it will be used instead (useful for migrations).

## Debugging

To display analytics-controller logs in the mobile app, you can add the following to your `.js.env` file:

```bash
export DEBUG="metamask:analytics-controller"
```

This will enable debug logging for the analytics-controller, allowing you to see detailed logs of analytics events, state changes, and controller operations.

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
