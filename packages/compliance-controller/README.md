# `@metamask/compliance-controller`

Manages OFAC compliance checks for wallet addresses by interfacing with the Compliance API.

## Overview

This package provides:

- **`ComplianceService`** — A data service that communicates with the Compliance API to check whether wallet addresses are sanctioned under OFAC regulations.
- **`ComplianceController`** — A controller that manages compliance state, caching wallet compliance results and blocked wallet lists.

## Installation

`yarn add @metamask/compliance-controller`

or

`npm install @metamask/compliance-controller`

## Usage

```typescript
import { Messenger } from '@metamask/messenger';
import {
  ComplianceController,
  ComplianceService,
} from '@metamask/compliance-controller';
import type {
  ComplianceControllerActions,
  ComplianceControllerEvents,
  ComplianceServiceActions,
  ComplianceServiceEvents,
} from '@metamask/compliance-controller';

// Set up the root messenger
const rootMessenger = new Messenger<
  'Root',
  ComplianceServiceActions | ComplianceControllerActions,
  ComplianceServiceEvents | ComplianceControllerEvents
>({ namespace: 'Root' });

// Create service messenger and service
const serviceMessenger = new Messenger({
  namespace: 'ComplianceService',
  parent: rootMessenger,
});
new ComplianceService({
  messenger: serviceMessenger,
  fetch,
  env: 'production',
});

// Create controller messenger and controller
const controllerMessenger = new Messenger({
  namespace: 'ComplianceController',
  parent: rootMessenger,
});
const controller = new ComplianceController({
  messenger: controllerMessenger,
});

// Check a single wallet
await rootMessenger.call(
  'ComplianceController:checkWalletCompliance',
  '0x1234...',
);

// Check multiple wallets
await rootMessenger.call('ComplianceController:checkWalletsCompliance', [
  '0x1234...',
  '0x5678...',
]);

// Fetch the full blocked wallets list
await rootMessenger.call('ComplianceController:updateBlockedWallets');
```

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
