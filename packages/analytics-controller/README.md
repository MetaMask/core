# `@metamask/analytics-controller`

Common Analytics controller for event tracking across MetaMask client platforms.

## Installation

`yarn add @metamask/analytics-controller`

or

`npm install @metamask/analytics-controller`

## Overview

The AnalyticsController provides a unified interface for tracking analytics events, identifying users, and managing analytics preferences. It delegates client platform-specific implementation to an `AnalyticsPlatformAdapter` and integrates with the MetaMask messenger system for inter-controller communication.

## State

| Field         | Type      | Description                                   | Persisted |
| ------------- | --------- | --------------------------------------------- | --------- |
| `analyticsId` | `string`  | UUIDv4 identifier (client platform-generated) | Yes       |
| `optedIn`     | `boolean` | User opt-in status                            | Yes       |
| `eventQueue`  | `object`  | Optional persisted delivery queue             | Yes       |

### Client Platform Responsibilities

1. **Generate or migrate an initial `analyticsId`**: Use the `uuid` package or client platform equivalent for new installs, or migrate an existing MetaMetrics identifier when available. The controller validates this value as a UUIDv4, but does not create a default ID.
2. **Load state before controller init**: Read from storage, provide to constructor
3. **Subscribe to state changes**: Persist changes to isolated storage
4. **Persist to isolated storage**: Keep analytics settings separate from main state (protects against state corruption)

## Anonymous Events Feature

When `isAnonymousEventsFeatureEnabled` is enabled in the constructor, events with sensitive properties are split into separate events:

- **Regular properties event**: Tracked first with only `properties` (uses user ID)
- **Sensitive properties event**: Tracked separately with both `properties` and `sensitiveProperties` (uses anonymous ID)

This allows sensitive data to be tracked anonymously while maintaining user identification for regular properties. When disabled (default), all properties are tracked in a single event.

## Persisted Event Queue

When `isEventQueuePersistenceEnabled` is enabled in the constructor, each final platform adapter payload is persisted until the adapter reports successful delivery through its callback.

This feature is disabled by default. Client platforms that already rely on SDK-level persistence, such as MetaMask Mobile through `@segment/analytics-react-native`'s `storePersistor` option, should leave it disabled.

Platforms without SDK-level persistence, such as MetaMask Extension, can enable it to replay queued payloads after restart. The queue stores the final adapter calls, so anonymous event splitting persists the identified and anonymous payloads separately.

## Lifecycle Hooks

### `onSetupCompleted`

Called once after controller initialization with a guaranteed valid `analyticsId`. Use this for client platform-specific setup that requires the analytics ID (e.g., adding plugins). Errors in `onSetupCompleted` are caught and logged—they don't break the controller.

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
