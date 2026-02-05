# `@metamask/client-state-controller`

Manages client lifecycle state (client open/closed) for cross-platform MetaMask applications.

## Overview

The `ClientStateController` provides a centralized way for controllers to respond to application lifecycle changes. Platform code calls `ClientStateController:setClientOpen` via messenger, and other controllers subscribe to `stateChange` events.

### The Problem It Solves

Previously, lifecycle management was scattered across platform code:

```typescript
// In MetamaskController (extension)
set isClientOpen(open) {
  this._isClientOpen = open;
  // Manually call each controller/service
  this.controllerMessenger.call('SnapController:setClientActive', open);
  if (open) {
    this.controllerMessenger.call('BackendWebSocketService:connect');
  } else {
    this.controllerMessenger.call('BackendWebSocketService:disconnect');
  }
}
```

### The Solution

With `ClientStateController`, controllers manage themselves:

```typescript
// Platform code calls the controller via messenger
set isClientOpen(open) {
  this.controllerMessenger.call('ClientStateController:setClientOpen', open);
}

// Controllers subscribe to stateChange and manage themselves
class MyController extends BaseController {
  constructor({ messenger }) {
    messenger.subscribe('ClientStateController:stateChange', (newState) => {
      if (newState.isClientOpen) {
        this.start();
      } else {
        this.stop();
      }
    });
  }
}
```

## Installation

`yarn add @metamask/client-state-controller`

or

`npm install @metamask/client-state-controller`

## Usage

### Basic Setup

```typescript
import { Messenger } from '@metamask/messenger';
import {
  ClientStateController,
  ClientStateControllerActions,
  ClientStateControllerEvents,
} from '@metamask/client-state-controller';

const rootMessenger = new Messenger<
  'Root',
  ClientStateControllerActions,
  ClientStateControllerEvents
>({ namespace: 'Root' });

const controllerMessenger = new Messenger({
  namespace: 'ClientStateController',
  parent: rootMessenger,
});

const clientStateController = new ClientStateController({
  messenger: controllerMessenger,
});
```

### Platform Integration (Extension)

```typescript
// In MetamaskController
class MetamaskController {
  // Platform calls this when UI opens/closes
  set isClientOpen(open) {
    this.controllerMessenger.call(
      'ClientStateController:setClientOpen',
      open,
    );
  }
}
```

### Platform Integration (React Native)

```typescript
import { AppState } from 'react-native';

// In Engine initialization
AppState.addEventListener('change', (nextAppState) => {
  if (nextAppState !== 'active' && nextAppState !== 'background') {
    return;
  }
  controllerMessenger.call(
    'ClientStateController:setClientOpen',
    nextAppState === 'active',
  );
});
```

### Consumer Controller

```typescript
class TokenBalancesController extends BaseController {
  constructor({ messenger }) {
    super({ messenger, ... });

    // Subscribe to lifecycle state changes
    this.messenger.subscribe(
      'ClientStateController:stateChange',
      (newState) => {
        if (newState.isClientOpen) {
          this.startPolling();
        } else {
          this.stopPolling();
        }
      },
    );
  }

  startPolling() {
    // Start polling when client opens
  }

  stopPolling() {
    // Stop polling when client closes
  }
}
```

### WebSocket Controller Example

```typescript
class WebSocketController extends BaseController {
  #socket: WebSocket | null = null;

  constructor({ messenger }) {
    super({ messenger, ... });

    messenger.subscribe(
      'ClientStateController:stateChange',
      (newState) => {
        if (newState.isClientOpen) {
          this.connect();
        } else {
          this.disconnect();
        }
      },
    );
  }

  connect() {
    if (!this.#socket) {
      this.#socket = new WebSocket('wss://example.com');
    }
  }

  disconnect() {
    if (this.#socket) {
      this.#socket.close();
      this.#socket = null;
    }
  }
}
```

## API Reference

### State

| Property       | Type      | Description                                |
| -------------- | --------- | ------------------------------------------ |
| `isClientOpen` | `boolean` | Whether the client (UI) is currently open. |

Note: State is not persisted. It always starts as `false`.

### Actions

| Action                                    | Parameters      | Description                      |
| ----------------------------------------- | --------------- | -------------------------------- |
| `ClientStateController:getState`       | none            | Returns current state.           |
| `ClientStateController:setClientOpen` | `open: boolean` | Sets whether the client is open. |

### Events

| Event                                  | Payload            | Description                  |
| -------------------------------------- | ------------------ | ---------------------------- |
| `ClientStateController:stateChange` | `[state, patches]` | Standard state change event. |

### Selectors

```typescript
import { selectIsClientOpen } from '@metamask/client-state-controller';

const state = messenger.call('ClientStateController:getState');
const isOpen = selectIsClientOpen(state);
```

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
