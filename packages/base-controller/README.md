# `@metamask/base-controller`

The `@metamask/base-controller` package provides the foundational building blocks for creating controllers in the MetaMask ecosystem. It offers a robust state management system with features like state immutability, subscription capabilities, and state metadata handling.

## Features

- **State Management**: Provides immutable state handling with controlled update mechanisms
- **Event System**: Built-in messaging system for inter-controller communication
- **State Metadata**: Support for state persistence and anonymization through metadata
- **Type Safety**: Written in TypeScript for enhanced type safety and developer experience
- **Immer Integration**: Uses Immer for immutable state updates with a mutable API style

## Installation

```bash
yarn add @metamask/base-controller
```

or

```bash
npm install @metamask/base-controller
```

## Usage

Here's a basic example of creating a controller:

```typescript
import { BaseController } from '@metamask/base-controller';

// Define your controller's state type
interface CounterState {
  count: number;
}

// Define your controller's state metadata
const counterStateMetadata = {
  count: {
    persist: true,
    anonymous: true,
  },
};

// Create your controller
class CounterController extends BaseController<
  'CounterController',
  CounterState
> {
  constructor(messenger) {
    super({
      name: 'CounterController',
      metadata: counterStateMetadata,
      state: { count: 0 },
      messenger,
    });
  }

  // Add methods to update state
  increment() {
    this.update((state) => {
      state.count += 1;
    });
  }

  decrement() {
    this.update((state) => {
      state.count -= 1;
    });
  }
}
```

### State Updates

The controller provides a safe way to update state using the `update` method:

```typescript
controller.update((draft) => {
  draft.count = 10; // Modify the draft state
});
```

### Subscribing to State Changes

Controllers emit state change events that you can subscribe to:

```typescript
messenger.subscribe('CounterController:stateChange', (state, patches) => {
  console.log('New state:', state);
  console.log('What changed:', patches);
});
```

## API Reference

### BaseController

The main class that provides state management functionality.

#### Constructor Options

- `name`: The name of the controller (used for namespacing events)
- `state`: Initial state of the controller
- `metadata`: State metadata for persistence and anonymization
- `messenger`: Instance of the messaging system

#### Methods

- `update(callback)`: Updates the controller state
- `destroy()`: Cleans up controller resources
- `state`: Getter for accessing current state (readonly)

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
