# `@metamask/client-state-controller`

Tracks and manages the lifecycle state of MetaMask as a client.

## Overview

The `ClientStateController` provides a centralized way for controllers to respond to application lifecycle changes. Platform code calls `ClientStateController:setClientOpen` via messenger, and other controllers subscribe to `stateChange` events.

**Use this state and events together with other lifecycle signals** (e.g. `KeyringController:unlock` / `KeyringController:lock`). Whether the client is "open" is only one condition; you often also need the keyring unlocked (user has completed onboarding / is logged in) before starting network requests or sensitive work. See [Using with other lifecycle state](#using-with-other-lifecycle-state-eg-keyring-unlocklock) below.

## Important: Usage guidelines and warnings

**Do not subscribe to updates for all kinds of data as soon as the client opens.** When MetaMask opens, the current screen may not need every type of data. Starting subscriptions, polling, or network requests for everything when `isClientOpen` becomes true is not a good long-term strategy and can lead to:

- Unnecessary network traffic and battery use
- **Requests before onboarding is complete** — we have run into problems in the past with making network requests before users complete onboarding; the same issues can recur if consumers start all their updates as soon as the client is "open"
- Poor performance and scalability as more features are added

**Use this controller responsibly:**

- Start only the subscriptions, polling, or requests that are **needed for the current screen or flow**
- Do **not** start network-dependent or heavy behavior solely because `ClientStateController:stateChange` reported `isClientOpen: true`
- Consider **deferring** non-critical updates until the user has completed onboarding or reached a screen that needs that data
- Prefer starting and stopping per feature or per screen (e.g., when a component mounts that needs the data) rather than globally when the client opens
- **Combine with Keyring unlock/lock:** Think about using `ClientStateController` state together with `KeyringController:unlock` and `KeyringController:lock` (or equivalent). Only start work when it is appropriate for both client visibility and wallet state (e.g. client open **and** keyring unlocked).
- **Prefer pause/resume over stop/start for polling:** When reacting to client open/close, prefer pausing and resuming polling (so you can resume without full re-initialization) rather than stopping and starting from scratch. Use the selector when subscribing (see example below).

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
    this.controllerMessenger.call('ClientStateController:setClientOpen', open);
  }
}
```

### Platform Integration (React Native)

```typescript
import { AppState } from 'react-native';

// In Engine initialization
AppState.addEventListener('change', (state) => {
  controllerMessenger.call(
    'ClientStateController:setClientOpen',
    state === 'active',
  );
});
```

### Consumer Controller

Use `ClientStateController:stateChange` only for behavior that **must** run when the client is open or closed (e.g., pausing/resuming a single critical background task). Do not use it to start all possible updates; see [Usage guidelines and warnings](#important-usage-guidelines-and-warnings) above.

**Use the selector** when subscribing so the handler receives a single derived value (e.g. `isClientOpen`), and **prefer pause/resume** over stop/start for polling so you can resume without full re-initialization.

```typescript
import { clientStateControllerSelectors } from '@metamask/client-state-controller';

class TokenBalancesController extends BaseController {
  constructor({ messenger }) {
    super({ messenger, ... });

    // Subscribe with a selector so the handler receives isClientOpen (boolean).
    // Prefer pause/resume so polling can be resumed without full re-initialization.
    this.messenger.subscribe(
      'ClientStateController:stateChange',
      (isClientOpen) => {
        if (isClientOpen) {
          this.resumePolling();
        } else {
          this.pausePolling();
        }
      },
      (state) => clientStateControllerSelectors.selectIsClientOpen(state),
    );
  }

  resumePolling() {
    // Start polling if previously paused, otherwise do nothing
  }

  pausePolling() {
    // Mark that polling is paused so resumePolling can restart it later,
    // and ensure that polling is stopped
  }
}
```

Note: `stateChange` emits `[state, patches]`; the selector receives the full payload and returns the value passed to the handler (here, `isClientOpen`).

### Using with other lifecycle state (e.g. Keyring unlock/lock)

Client open/close alone is usually not enough to decide when to start or stop work. Combine `ClientStateController:stateChange` with other lifecycle events and state, such as:

- **KeyringController:unlock** / **KeyringController:lock** — whether the wallet is unlocked (user has completed onboarding / is logged in)
- Any other controller that expresses "ready for background work" or "user session active"

Only start subscriptions, polling, or network requests when **both** the client is open and the keyring (or equivalent) is unlocked. Stop or pause when the client closes **or** the keyring locks.

```typescript
import { clientStateControllerSelectors } from '@metamask/client-state-controller';

class SomeDataController extends BaseController {
  #clientOpen = false;
  #keyringUnlocked = false;

  constructor({ messenger }) {
    super({ messenger, ... });

    messenger.subscribe(
      'ClientStateController:stateChange',
      (isClientOpen) => {
        this.#clientOpen = isClientOpen;
        this.updateActive();
      },
      (state) => clientStateControllerSelectors.selectIsClientOpen(state),
    );

    messenger.subscribe('KeyringController:unlock', () => {
      this.#keyringUnlocked = true;
      this.updateActive();
    });

    messenger.subscribe('KeyringController:lock', () => {
      this.#keyringUnlocked = false;
      this.updateActive();
    });
  }

  updateActive() {
    const shouldRun = this.#clientOpen && this.#keyringUnlocked;
    if (shouldRun) {
      this.resume();
    } else {
      this.pause();
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

| Action                                | Parameters      | Description                      |
| ------------------------------------- | --------------- | -------------------------------- |
| `ClientStateController:getState`      | none            | Returns current state.           |
| `ClientStateController:setClientOpen` | `open: boolean` | Sets whether the client is open. |

### Events

| Event                               | Payload            | Description                  |
| ----------------------------------- | ------------------ | ---------------------------- |
| `ClientStateController:stateChange` | `[state, patches]` | Standard state change event. |

### Selectors

```typescript
import { clientStateControllerSelectors } from '@metamask/client-state-controller';

const state = messenger.call('ClientStateController:getState');
const isOpen = clientStateControllerSelectors.selectIsClientOpen(state);
```

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
