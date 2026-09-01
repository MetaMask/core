# `@metamask/analytics-controller`

Common Analytics controller for event tracking across MetaMask client platforms.

## Installation

`yarn add @metamask/analytics-controller`

or

`npm install @metamask/analytics-controller`

## Overview

The AnalyticsController provides a unified interface for tracking analytics events, identifying users, and managing analytics preferences. It delegates client platform-specific implementation to an `AnalyticsPlatformAdapter` and integrates with the MetaMask messenger system for inter-controller communication.

## State

| Field            | Type      | Description                                   | Persisted |
| ---------------- | --------- | --------------------------------------------- | --------- |
| `analyticsId`    | `string`  | UUIDv4 identifier (client platform-generated) | Yes       |
| `optedIn`        | `boolean` | User opt-in status                            | Yes       |
| `eventQueue`     | `object`  | Optional persisted delivery queue             | Yes       |
| `eventFragments` | `object`  | Optional in-progress event fragments          | Yes       |

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

## Event Fragments

When `isEventFragmentsEnabled` is enabled in the constructor, clients can accumulate analytics properties across a user journey instead of re-deriving them for every event in that journey.

A fragment is a persisted bag of `properties` and `sensitiveProperties` that any part of the client can contribute to while the journey is in progress. It supports two shapes, and the difference is only which event names it declares:

- **Funnel.** Declare `initialEvent`, `successEvent` and `failureEvent`. The initial event is emitted as soon as the fragment is created, and `finalizeEventFragment` emits the success event, or the failure event when called with `{ abandoned: true }`. A signature request is the canonical example: the request, approval and rejection events all carry the properties that the confirmation UI attached while the user was deciding.
- **Property bag.** Declare no event names. Nothing is ever emitted. The client reads the fragment back with `getEventFragmentById` at the moment it emits its own event and merges the accumulated properties in. A transaction confirmation is the canonical example.

```ts
controller.createEventFragment({
  id: `signature-${requestId}`,
  initialEvent: 'Signature Requested',
  successEvent: 'Signature Approved',
  failureEvent: 'Signature Rejected',
  properties: { signature_type: 'personal_sign' },
  context: { referrer: { url: origin } },
  persist: true,
});

// Any number of contributors, at any later point.
controller.updateEventFragment(`signature-${requestId}`, {
  properties: { alert_triggered_count: 1 },
});

// Emits 'Signature Approved' with every accumulated property, then discards
// the fragment. Pass `{ abandoned: true }` to emit 'Signature Rejected'.
controller.finalizeEventFragment(`signature-${requestId}`);
```

Use `upsertEventFragment` when a contributor cannot know whether the journey has been started yet. It merges into an existing fragment, or creates a property bag when none exists.

Emission goes through `trackEvent`, so consent gating, anonymous event splitting, the pre-consent queue and geolocation enrichment all apply to a fragment's events exactly as they do to a direct call.

The consent gate also applies to accumulation, not just to emission, so a fragment never stores data for an event that could not be delivered. A fragment only holds data while the user is opted in, or while they are still undecided and `isPreConsentQueueEnabled` is holding their events until they decide. In any other consent state, and in particular after an explicit opt-out, every fragment method is a logged no-op.

Fragments are removed when they are finalized, deleted, or when the user opts out. `resetConsentDecision` keeps them only while the now-undecided user can still accumulate them. On `init`, any fragment that did not set `persist: true` is discarded, since the journey it belonged to cannot be resumed, and all of them are discarded when the consent state no longer allows accumulation. Nothing is emitted for a discarded fragment: a journey that never reached its own finalization is unfinished, not failed.

This feature is disabled by default. When disabled, every fragment method is a logged no-op and no fragment is written to state.

## Lifecycle Hooks

### `onSetupCompleted`

Called once after controller initialization with a guaranteed valid `analyticsId`. Use this for client platform-specific setup that requires the analytics ID (e.g., adding plugins). Errors in `onSetupCompleted` are caught and logged—they don't break the controller.

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
