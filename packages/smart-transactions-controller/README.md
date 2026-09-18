# `@metamask/smart-transactions-controller`

Improves success rates for swaps by trialing transactions privately and finding minimum fees.

## Installation

`yarn add @metamask/smart-transactions-controller`

or

`npm install @metamask/smart-transactions-controller`

## Feature Flags

Smart transactions feature flags are managed via `RemoteFeatureFlagController` (LaunchDarkly). The configuration uses a `default` remote object for global settings and chain-specific overrides keyed by hex chain ID.

The flag in LaunchDarkly is named `smartTransactionsNetworks`.

### Adding a New Flag

1. **Add the field to the schema** in `src/utils/validators.ts`:

   ```typescript
   export const SmartTransactionsNetworkConfigSchema = type({
     // ... existing fields
     myNewFlag: optional(boolean()),
   });
   ```

   The `SmartTransactionsNetworkConfig` type is automatically inferred from this schema.

2. **Add default value** in `src/constants.ts` under `DEFAULT_DISABLED_SMART_TRANSACTIONS_FEATURE_FLAGS`:

   These values should be defensive. They are applied when the remote config is invalid or does not exist for a network.
   It disables smart transaction.

   ```typescript
   export const DEFAULT_DISABLED_SMART_TRANSACTIONS_FEATURE_FLAGS = {
     default: {
       // ... existing defaults
       myNewFlag: false,
     },
   };
   ```

3. **Use in clients** via the exported selectors:

   ```typescript
   import { selectSmartTransactionsFeatureFlagsForChain } from '@metamask/smart-transactions-controller';

   const chainConfig = selectSmartTransactionsFeatureFlagsForChain(
     state,
     '0x1',
   );
   if (chainConfig.myNewFlag) {
     // Feature is enabled
   }
   ```

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
