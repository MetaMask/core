# `@metamask/client-controller`

Client-level state for MetaMask (e.g. whether a UI window is open). Provides a centralized way for controllers to respond to application lifecycle changes.

## Installation

```bash
yarn add @metamask/client-controller
```

or

```bash
npm install @metamask/client-controller
```

## Usage

### Basic Setup

```typescript
import { Messenger } from '@metamask/messenger';
import {
  ClientController,
  ClientControllerActions,
  ClientControllerEvents,
} from '@metamask/client-controller';

const rootMessenger = new Messenger<
  'Root',
  ClientControllerActions,
  ClientControllerEvents
>({ namespace: 'Root' });

const controllerMessenger = new Messenger({
  namespace: 'ClientController',
  parent: rootMessenger,
});

const clientController = new ClientController({
  messenger: controllerMessenger,
});
```

### Platform Integration

Platform code calls `ClientController:setUiOpen` when the UI is opened or
closed:

```text
onUiOpened() {
  controllerMessenger.call('ClientController:setUiOpen', true);
}

onUiClosed() {
  controllerMessenger.call('ClientController:setUiOpen', false);
}
```

### Consumer controller and using with other lifecycle state (e.g. Keyring unlock/lock)

Use `ClientController:stateChange` only for behavior that **must** run when the
UI is open or closed (e.g., pausing/resuming a critical background task). **Use
the selector** when subscribing so the handler receives a single derived value
(e.g. `isUiOpen`), and **prefer pause/resume** over stop/start for polling.

UI open/close alone is usually not enough to decide when to start or stop work.
Combine `ClientController:stateChange` with other lifecycle events, such as
**KeyringController:unlock** / **KeyringController:lock** (or any controller that
expresses "ready for background work"). Only start subscriptions, polling, or
network requests when **both** the UI is open and the keyring (or equivalent) is
unlocked; stop or pause when the UI closes **or** the keyring locks.

#### Important: Usage guidelines and warnings

**Do not subscribe to updates for all kinds of data as soon as the client
opens.** When MetaMask opens, the current screen may not need every type of
data. Starting subscriptions, polling, or network requests for everything when
`isUiOpen` becomes true can lead to unnecessary network traffic and battery
use, requests before onboarding is complete (a recurring source of issues), and
poor performance as more features are added.

**Use this controller responsibly:**

- Start only the subscriptions, polling, or requests that are **needed for the
  current screen or flow**
- Do **not** start network-dependent or heavy behavior solely because
  `ClientController:stateChange` reported `isUiOpen: true`
- Consider **deferring** non-critical updates until the user has completed
  onboarding or reached a screen that needs that data
- Prefer starting and stopping per feature or per screen (e.g., when a
  component mounts that needs the data) rather than globally when the client
  opens
- **Combine with Keyring unlock/lock:** Only start work when it is appropriate
  for both UI open state and wallet state (e.g. client open **and** keyring
  unlocked)
- **Prefer pause/resume over stop/start for polling** so you can resume without
  full re-initialization. Use the selector when subscribing (see example
  below).

```typescript
import { clientControllerSelectors } from '@metamask/client-controller';

class SomeDataController extends BaseController {
  #uiOpen = false;
  #keyringUnlocked = false;

  constructor({ messenger }) {
    super({ messenger, ... });

    messenger.subscribe(
      'ClientController:stateChange',
      (isUiOpen) => {
        this.#uiOpen = isUiOpen;
        this.updateActive();
      },
      clientControllerSelectors.selectIsUiOpen,
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
    const shouldRun = this.#uiOpen && this.#keyringUnlocked;
    if (shouldRun) {
      this.resume();
    } else {
      this.pause();
    }
  }
}
```

Note: `stateChange` emits `[state, patches]`; the selector receives the full
payload and returns the value passed to the handler (here, `isUiOpen`).

## API Reference

### State

| Property   | Type      | Description                                |
| ---------- | --------- | ------------------------------------------ |
| `isUiOpen` | `boolean` | Whether the client (UI) is currently open. |

State is not persisted. It always starts as `false`.

### Actions

| Action                       | Parameters      | Description                  |
| ---------------------------- | --------------- | ---------------------------- |
| `ClientController:getState`  | none            | Returns current state.       |
| `ClientController:setUiOpen` | `open: boolean` | Sets whether the UI is open. |

### Events

| Event                          | Payload            | Description                  |
| ------------------------------ | ------------------ | ---------------------------- |
| `ClientController:stateChange` | `[state, patches]` | Standard state change event. |

### Selectors

```typescript
import { clientControllerSelectors } from '@metamask/client-controller';

const state = messenger.call('ClientController:getState');
const isOpen = clientControllerSelectors.selectIsUiOpen(state);
```

## Contributing

This package is part of a monorepo. Instructions for contributing can be found
in the [monorepo README](https://github.com/MetaMask/core#readme).
