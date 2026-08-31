# `@metamask/money-account-subscription-controller`

Read-only controller that derives Money Account Plus subscription state from the
Profile JWT claim exposed through `AuthenticationController:getBearerToken`.

The controller:

- hydrates plan and entitlement flags from the namespaced
  `productEntitlements.moneyAccountPlus` JWT claim;
- listens to `AuthenticationController:stateChanged` and
  `SubscriptionController:stateChanged` to keep local state aligned with auth and
  subscription changes;
- exposes pure selectors for subscriber and entitlement gating; and
- refreshes the JWT on a polling interval while an interested trading surface is
  active.

## Installation

`yarn add @metamask/money-account-subscription-controller`

or

`npm install @metamask/money-account-subscription-controller`

## API

The main exports are:

- `MoneyAccountSubscriptionController`
- `getDefaultMoneyAccountSubscriptionControllerState()`
- `getProductEntitlementsClaimKey()`
- `decodeJwtPayload()`
- `getMoneyAccountPlusClaimFromBearerToken()`
- `selectIsActiveSubscriber()`
- `selectHasEntitlement()`
- `selectIsUsageAvailable()`
- `MoneyAccountFeature`

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
