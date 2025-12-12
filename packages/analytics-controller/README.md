# `@metamask/analytics-controller`

Common Analytics controller for event tracking across MetaMask client platforms.

## Installation

`yarn add @metamask/analytics-controller`

or

`npm install @metamask/analytics-controller`

## Overview

The AnalyticsController provides a unified interface for tracking analytics events, identifying users, and managing analytics preferences. It delegates client platform-specific implementation to an `AnalyticsPlatformAdapter` and integrates with the MetaMask messenger system for inter-controller communication.

## Client Platform-Managed Storage

> [!NOTE]
> "Client platform" means mobile or extension

The controller does not persist state internally. The client platform is responsible for loading and persisting analytics settings. This design enables:

- **Early access**: The client platform can read the `analyticsId` before the controller is initialized, useful for other controllers or early startup code
- **Resilience**: Storing analytics settings separately from main state protects them from state corruption, allowing analytics to continue working even when main state is corrupted

Load settings from storage **before** initializing the controller, then subscribe to `AnalyticsController:stateChange` events to persist any state changes.

## State

| Field         | Type      | Description                                   | Persisted |
| ------------- | --------- | --------------------------------------------- | --------- |
| `analyticsId` | `string`  | UUIDv4 identifier (client platform-generated) | No        |
| `optedIn`     | `boolean` | User opt-in status                            | Yes       |

### Why `analyticsId` Has No Default

The `analyticsId` uniquely identifies the user. If the controller generated a new ID on each boot, the ID would be ineffective. The client platform must generate a UUID on first run, persist it, and provide it to the controller constructor.

### Client Platform Responsibilities

1. **Generate UUID on first run**: Use `uuid` package or client platform equivalent
2. **Load state before controller init**: Read from storage, provide to constructor
3. **Subscribe to state changes**: Persist changes to isolated storage
4. **Persist to isolated storage**: Keep analytics settings separate from main state (protects against state corruption)

## Anonymous Events Feature

When `isAnonymousEventsFeatureEnabled` is enabled in the constructor, events with sensitive properties are split into separate events:

- **Regular properties event**: Tracked first with only `properties` (uses user ID)
- **Sensitive properties event**: Tracked separately with both `properties` and `sensitiveProperties` (uses anonymous ID)

This allows sensitive data to be tracked anonymously while maintaining user identification for regular properties. When disabled (default), all properties are tracked in a single event.

## Lifecycle Hooks

### `onSetupCompleted`

Called once after controller initialization with a guaranteed valid `analyticsId`. Use this for client platform-specific setup that requires the analytics ID (e.g., adding plugins). Errors in `onSetupCompleted` are caught and logged—they don't break the controller.

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
