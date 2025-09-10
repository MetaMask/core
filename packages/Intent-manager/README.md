# `@metamask/intent-manager`

Manages intent-related functionality for MetaMask. This package provides a controller for handling user intents, intent validation, execution, and state management within the MetaMask ecosystem.

## Overview

The Intent Manager is responsible for:

- **Intent Creation**: Creating and validating user intents
- **Intent Execution**: Managing the execution lifecycle of intents
- **State Management**: Tracking intent states and history
- **Intent Validation**: Ensuring intents meet required criteria
- **Event Handling**: Emitting events for intent lifecycle changes

## Installation

```bash
yarn add @metamask/intent-manager
```

or

```bash
npm install @metamask/intent-manager
```

## Usage

```typescript
import { IntentManagerController } from '@metamask/intent-manager';

// Initialize the controller
const intentManager = new IntentManagerController({
  messenger, // Controller messenger
  state: {
    // Initial state
  },
});

// Create a new intent
const intent = await intentManager.createIntent({
  type: 'swap',
  data: {
    // Intent-specific data
  },
});

// Execute an intent
await intentManager.executeIntent(intent.id);

// Get intent status
const status = intentManager.getIntentStatus(intent.id);
```

## API Reference

### IntentManagerController

The main controller class that manages intent operations.

#### Methods

- `createIntent(intentData)` - Creates a new intent
- `executeIntent(intentId)` - Executes an existing intent
- `cancelIntent(intentId)` - Cancels a pending intent
- `getIntentStatus(intentId)` - Gets the current status of an intent
- `getIntentHistory()` - Retrieves intent history

#### Events

- `IntentCreated` - Emitted when a new intent is created
- `IntentExecuted` - Emitted when an intent is executed
- `IntentCancelled` - Emitted when an intent is cancelled
- `IntentFailed` - Emitted when an intent execution fails

## Types

### Intent

```typescript
interface Intent {
  id: string;
  type: IntentType;
  status: IntentStatus;
  data: IntentData;
  createdAt: number;
  updatedAt: number;
}
```

### IntentStatus

```typescript
enum IntentStatus {
  PENDING = 'pending',
  EXECUTING = 'executing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}
```

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).

## License

MIT
