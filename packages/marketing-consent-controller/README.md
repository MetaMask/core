# `@metamask/marketing-consent-controller`

Keeps marketing consent in sync with Authenticated User Storage

## Installation

`yarn add @metamask/marketing-consent-controller`

or

`npm install @metamask/marketing-consent-controller`

## Usage

`MarketingConsentController` keeps the user's marketing consent, held locally by `AnalyticsController`, in sync with their Authenticated User Storage (AUS) profile. AUS is the source of truth.

### Setup

Construct it, then call `initialize()` once `AnalyticsController`, `AuthenticationController` and `KeyringController` are registered. The constructor doesn't call other controllers; `initialize()` reads their state, subscribes to their changes and starts syncing.

```ts
const controller = new MarketingConsentController({
  messenger,
  state, // persisted state, if any
  clientType: 'extension', // or 'mobile'
});

// After every controller is registered:
controller.initialize();
```

Before `initialize()`, the controller doesn't sync: `setMarketingConsent` applies the choice locally and saves it once `initialize()` has run and the user is signed in.

The messenger must allow these actions and events:

- Actions:
  - `AuthenticatedUserStorageService:invalidateQueries`, `getMarketingConsent`, `putMarketingConsent`, `getNotificationPreferences`, `putNotificationPreferences`
  - `AnalyticsController:getState`, `optInToMarketing`, `optOutOfMarketing`
  - `AuthenticationController:getState`
  - `KeyringController:getState`
- Events:
  - `AnalyticsController:stateChanged` and `AuthenticationController:stateChanged` (not the deprecated `stateChange`)
  - `KeyringController:lock`, `KeyringController:unlock`

### Changing consent

Call `MarketingConsentController:setMarketingConsent(enabled)` for every user choice.

- It resolves once AUS has saved the change.
- Turning consent off also turns off the AUS marketing notification channels.
- Before sign-in finishes (for example during onboarding), the change is applied locally and saved once the wallet is unlocked and signed in; the call resolves without waiting. A change still unsaved when the wallet locks is saved after the next unlock and sign-in.
- If AUS does not save the change, the call rejects and local consent is re-read from AUS.
- If a newer choice is made while it waits (another call, or other code changing consent in `AnalyticsController`), the call resolves without an error; the newer choice is saved on its own.

### Re-reading AUS

Call `MarketingConsentController:refresh()` when the wallet UI opens or the app returns to the foreground. It also retries a change whose save failed. The controller re-reads AUS by itself on sign-in and unlock.

### Notification preferences

To turn a marketing notification channel on, save consent first, then turn the channel on through `NotificationServicesController:updateNotificationPreferences`. That method rejects updates that turn a marketing channel on without consent, with an error whose `code` is `MARKETING_CONSENT_REQUIRED_ERROR_CODE` (exported by `@metamask/notification-services-controller`).

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for how the controller syncs consent with AUS.

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
