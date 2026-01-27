# `@metamask/config-registry-controller`

A controller that manages network configuration data from the MetaMask Config Registry API.

## Overview

This package provides:

- **ConfigRegistryApiService**: A service for fetching network configurations from the Config Registry API with support for HTTP caching.
- **ConfigRegistryController**: A polling controller that manages the lifecycle of fetching and storing network configurations, responding to wallet lock/unlock events.

## Installation

```bash
yarn add @metamask/config-registry-controller
```

Or:

```bash
npm install @metamask/config-registry-controller
```

## Usage

### Setting up the service and controller

```typescript
import { Messenger } from '@metamask/messenger';
import {
  ConfigRegistryApiService,
  ConfigRegistryController,
} from '@metamask/config-registry-controller';

// Create the root messenger
const rootMessenger = new Messenger({ namespace: 'Root' });

// Create the service messenger and instantiate the service
const serviceMessenger = new Messenger({
  namespace: 'ConfigRegistryApiService',
  parent: rootMessenger,
});
new ConfigRegistryApiService({
  messenger: serviceMessenger,
  fetch,
  env: 'api', // 'dev-api' | 'uat-api' | 'api'
});

// Create the controller messenger and instantiate the controller
const controllerMessenger = new Messenger({
  namespace: 'ConfigRegistryController',
  parent: rootMessenger,
});
const controller = new ConfigRegistryController({
  messenger: controllerMessenger,
  pollingInterval: 60000, // Poll every 60 seconds
  isFeatureFlagEnabled: () => true, // Function to check if the feature is enabled
});

// The controller will automatically start polling when the wallet is unlocked
// and stop when locked.
```

## API

### ConfigRegistryApiService

The service responsible for fetching network configurations from the Config Registry API.

#### Constructor options

- `messenger`: The messenger for the service.
- `fetch`: The fetch function to use for HTTP requests.
- `env`: The environment to use (`'dev-api'`, `'uat-api'`, or `'api'`).
- `policyOptions`: Optional options for the service policy (retry, circuit breaker, etc.).

#### Methods

- `fetchConfig()`: Fetches the network configuration from the API. Returns cached data if the server responds with 304 Not Modified.

### ConfigRegistryController

A polling controller that fetches network configurations and stores them in state.

#### Constructor options

- `messenger`: The messenger for the controller.
- `state`: Optional initial state.
- `pollingInterval`: The interval in milliseconds between polls (default: 60000).
- `isFeatureFlagEnabled`: Function that returns whether the feature is enabled.

#### State

The controller maintains the following state:

- `configs.networks`: A record of network configurations keyed by chain ID.
- `version`: The version of the configuration from the API.
- `lastFetched`: Timestamp of the last successful fetch.
- `fetchError`: Error message from the last failed fetch, if any.
- `etag`: The ETag from the last successful fetch for HTTP caching.

## Contributing

This package is part of a monorepo. Please see the [monorepo README](https://github.com/MetaMask/core#readme) for shared scripts and more information about contributing.
