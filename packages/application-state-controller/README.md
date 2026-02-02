# `@metamask/application-state-controller`

Manages application lifecycle state (client open/closed) for cross-platform MetaMask applications.

## Overview

The `ApplicationStateController` provides a centralized way for controllers to respond to application lifecycle changes. Platform code calls `ApplicationStateController:setClientState` via messenger, and other controllers subscribe to `stateChange` events.

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

With `ApplicationStateController`, controllers manage themselves:

```typescript
// Platform code calls the controller via messenger
set isClientOpen(open) {
  this.controllerMessenger.call('ApplicationStateController:setClientState', open);
}

// Controllers subscribe to stateChange and manage themselves
class MyController extends BaseController {
  constructor({ messenger }) {
    messenger.subscribe('ApplicationStateController:stateChange', (newState) => {
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

`yarn add @metamask/application-state-controller`

or

`npm install @metamask/application-state-controller`

## Usage

### Basic Setup

```typescript
import { Messenger } from '@metamask/messenger';
import {
  ApplicationStateController,
  ApplicationStateControllerActions,
  ApplicationStateControllerEvents,
} from '@metamask/application-state-controller';

const rootMessenger = new Messenger<
  'Root',
  ApplicationStateControllerActions,
  ApplicationStateControllerEvents
>({ namespace: 'Root' });

const controllerMessenger = new Messenger({
  namespace: 'ApplicationStateController',
  parent: rootMessenger,
});

const applicationStateController = new ApplicationStateController({
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
      'ApplicationStateController:setClientState',
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
    'ApplicationStateController:setClientState',
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
      'ApplicationStateController:stateChange',
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
      'ApplicationStateController:stateChange',
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

| Action                                      | Parameters      | Description                      |
| ------------------------------------------- | --------------- | -------------------------------- |
| `ApplicationStateController:getState`       | none            | Returns current state.           |
| `ApplicationStateController:setClientState` | `open: boolean` | Sets whether the client is open. |

### Events

| Event                                    | Payload            | Description                  |
| ---------------------------------------- | ------------------ | ---------------------------- |
| `ApplicationStateController:stateChange` | `[state, patches]` | Standard state change event. |

### Selectors

```typescript
import { selectIsClientOpen } from '@metamask/application-state-controller';

const state = messenger.call('ApplicationStateController:getState');
const isOpen = selectIsClientOpen(state);
```

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
