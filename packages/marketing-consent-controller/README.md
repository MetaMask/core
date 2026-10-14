# `@metamask/marketing-consent-controller`

Keeps marketing consent in sync with Authenticated User Storage

## Installation

`yarn add @metamask/marketing-consent-controller`

or

`npm install @metamask/marketing-consent-controller`

## Usage

`MarketingConsentController` keeps the user's marketing consent, held locally by `AnalyticsController`, in sync with their Authenticated User Storage (AUS) profile. AUS is the source of truth.

### Setup

Construct it after `AnalyticsController`, `AuthenticationController` and `KeyringController` are registered: the constructor reads their state and starts syncing right away.

```ts
const controller = new MarketingConsentController({
  messenger,
  state, // persisted state, if any
  clientType: 'extension', // or 'mobile'
});
```

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
- While locked or signed out, the change is applied locally and saved at the next unlock and sign-in; the call resolves without waiting.
- If AUS does not save the change, the call rejects and local consent is re-read from AUS.

### Re-reading AUS

Call `MarketingConsentController:refresh()` when the wallet UI opens or the app returns to the foreground. It also retries a change whose save failed. The controller re-reads AUS by itself on sign-in and unlock.

### Notification preferences

To turn a marketing notification channel on, save consent first, then write the preferences through `NotificationServicesController:updateNotificationPreferences`. That method rejects marketing channels that are on without consent, with an error whose `code` is `MARKETING_CONSENT_REQUIRED_ERROR_CODE` (exported by `@metamask/notification-services-controller`).

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
