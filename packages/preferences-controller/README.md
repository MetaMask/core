# `@metamask/preferences-controller`

A controller that manages user-configurable settings and preferences in MetaMask. This controller handles various user settings including feature flags, identity management, IPFS configuration, security settings, and various feature toggles.

## Features

- **Feature Flag Management**: Enable/disable specific features
- **Identity Management**: Track and manage user identities and addresses
- **IPFS Integration**: Configure IPFS gateway settings
- **Security Settings**:
  - Security alerts configuration
  - Safe chains list validation
  - Privacy mode settings
- **Network Preferences**:
  - Test network visibility
  - Incoming transaction tracking
  - Multi-RPC configuration
- **Token Settings**:
  - Token detection configuration
  - NFT detection settings
  - Token sorting preferences
- **Transaction Features**:
  - Smart transaction opt-in
  - Transaction simulation settings
- **OpenSea Integration**: Toggle OpenSea API usage
- **Multi-Account Support**: Configure multi-account balance fetching
- **Type Safety**: Written in TypeScript with comprehensive type definitions

## Installation

```bash
yarn add @metamask/preferences-controller
```

or

```bash
npm install @metamask/preferences-controller
```

## Usage

Here's how to use the PreferencesController:

```typescript
import { PreferencesController } from '@metamask/preferences-controller';

// Initialize the controller
const controller = new PreferencesController({
  messenger,
  state: {
    featureFlags: {},
    identities: {},
    ipfsGateway: 'https://ipfs.io/ipfs/',
    isIpfsGatewayEnabled: true,
    isMultiAccountBalancesEnabled: false,
    lostIdentities: {},
    openSeaEnabled: true,
    securityAlertsEnabled: true,
    selectedAddress: '',
    showTestNetworks: false,
    showIncomingTransactions: {},
    useNftDetection: true,
    useTokenDetection: true,
    smartTransactionsOptInStatus: false,
    useTransactionSimulations: true,
    useMultiRpcMigration: false,
    useSafeChainsListValidation: true,
    tokenSortConfig: { sortBy: 'value', sortDirection: 'desc' },
    privacyMode: false,
  },
});

// Feature flag management
controller.setFeatureFlag('new-feature', true);

// IPFS configuration
controller.setIpfsGateway('https://ipfs.infura.io/ipfs/');
controller.setIsIpfsGatewayEnabled(true);

// Token detection settings
controller.setUseTokenDetection(true);
controller.setUseNftDetection(true);

// Security settings
controller.setSecurityAlertsEnabled(true);
controller.setUseSafeChainsListValidation(true);
controller.setPrivacyMode(true);

// Network preferences
controller.setShowTestNetworks(false);
controller.setIsMultiAccountBalancesEnabled(true);

// Transaction settings
controller.setSmartTransactionsOptInStatus(true);
controller.setUseTransactionSimulations(true);

// Token display preferences
controller.setTokenSortConfig({
  sortBy: 'value',
  sortDirection: 'desc',
});

// Subscribe to state changes
messenger.subscribe('PreferencesController:stateChange', (state) => {
  console.log('New preferences state:', state);
});
```

## State Management

The controller maintains state with the following structure:

```typescript
interface PreferencesState {
  // Feature flags
  featureFlags: { [feature: string]: boolean };

  // Identity management
  identities: { [address: string]: Identity };
  lostIdentities: { [address: string]: Identity };
  selectedAddress: string;

  // IPFS settings
  ipfsGateway: string;
  isIpfsGatewayEnabled: boolean;

  // Network settings
  showTestNetworks: boolean;
  showIncomingTransactions: { [chainId: string]: boolean };
  isMultiAccountBalancesEnabled: boolean;
  useMultiRpcMigration: boolean;

  // Token settings
  useTokenDetection: boolean;
  useNftDetection: boolean;
  openSeaEnabled: boolean;
  tokenSortConfig: TokenSortConfig;

  // Security settings
  securityAlertsEnabled: boolean;
  useSafeChainsListValidation: boolean;
  privacyMode: boolean;

  // Transaction settings
  smartTransactionsOptInStatus: boolean;
  useTransactionSimulations: boolean;
}

interface Identity {
  address: string;
  name: string;
  importTime?: number;
}

interface TokenSortConfig {
  sortBy: 'value' | 'name';
  sortDirection: 'asc' | 'desc';
}
```

## Error Handling

The controller provides standard error handling through the BaseController:

```typescript
try {
  controller.setFeatureFlag('invalid-feature', true);
} catch (error) {
  // Handle error
}

try {
  controller.setIpfsGateway('invalid-gateway');
} catch (error) {
  // Handle error
}
```

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
