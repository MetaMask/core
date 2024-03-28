# Guidelines for Writing Controllers

## Keep responsibilities focused

The README and the `name` field in `package.json` provide opportunities to describe what the controller does in a sentence. If it is difficult to provide a concise description, it may be a sign that the controller is doing too much.

## Maintain a clear and concise API

The name of the controller should reflect its responsibility. If it is difficult to find a good name, then it may be a sign that the responsibility is unclear.

Each public method and each state property of a controller should have a purpose, and the name should read well and reflect the purpose clearly. If something does not need to be public, it should be made private; if it is unnecessary, it should be removed.

## Use BaseController v2

The modern version of `BaseController` provides the following benefits:

- It defines a standard interface for all controllers.
- It enforces that `update` is the only way to modify the state of the controller, guaranteeing that a `stateChange` event is always emitted in the process.
- It introduces the messenger system for subscribing to other controllers' actions and events, replacing the previous pattern of using callbacks to achieve the same thing but in a clunkier way.
- It simplifies initialization by consolidating the three arguments that `BaseController` v1 took into _one_ object.

## Use the messenger system instead of callbacks or event emitters

Prior to BaseController v2, it was common for a controller to respond to an event (such a state change) occurring within another controller by receiving an event listener callback which the client would bind ahead of time:

🚫

```typescript
// === foo-controller ===

class FooController extends BaseControllerV1 {
  constructor({
    onBarStateChange,
  }, {
    onBarStateChange: (state: BarControllerState) => void,
  }) {
    onBarStateChange((state) => {
      // do something with the state
    });
  }
}

// === Client ===

const barController = new BarController();
const fooController = new FooController({
  onBarStateChange: barController.subscribe.bind(barController),
});
```

A controller that inherits from BaseController v2, however, does not need the client to subscribe to the other controller, because it can do this itself. This reduces the number of options that consumers need to remember in order to use the controller:

✅

```typescript
// === foo-controller ===

const name = 'FooController';

type FooControllerMessenger = RestrictedControllerMessenger<
  typeof name,
  never,
  never,
  never,
  never
>;

class FooController extends BaseController {
  constructor({ messenger /*, ... */ }, { messenger: FooControllerMessenger }) {
    super({ messenger /* ... */ });

    messenger.subscribe('BarController:stateChange', (state) => {
      // do something with the state
    });
  }
}

// === Client ===

const rootMessenger = new ControllerMessenger<
  'BarController:stateChange',
  never
>();
const barControllerMessenger = rootMessenger.getRestricted({
  name: 'BarController',
});
const barController = new BarController({
  messenger: barControllerMessenger,
});
const fooControllerMessenger = rootMessenger.getRestricted({
  name: 'FooController',
});
const fooController = new FooController({
  messenger: fooControllerMessenger,
});
```

Some controllers even expose an EventEmitter object so that other parts of the system can listen to them:

🚫

```typescript
// === foo-controller ===

import { EventEmitter } from 'events';

class FooController extends BaseController {
  hub: EventEmitter;

  constructor(/* ... */) {
    // ...

    this.hub = new EventEmitter();
  }

  doSomething() {
    this.hub.emit('someEvent');
  }
}

// === Client ===

const fooController = new FooController();
fooController.hub.on('someEvent', () => {
  // respond to the event somehow
});
```

However, this sort of thing can also be done via the messenger:

✅

```typescript
// === foo-controller ===

const name = 'FooController';

type FooControllerMessenger = RestrictedControllerMessenger<
  typeof name,
  never,
  never,
  never,
  never
>;

class FooController extends BaseController {
  constructor({ messenger /*, ... */ }, { messenger: FooControllerMessenger }) {
    super({ messenger /*, ... */ });
  }

  doSomething() {
    this.messagingSystem.publish('FooController:someEvent');
  }
}

// === Client ===

const rootMessenger = new ControllerMessenger<
  'FooController:someEvent',
  never
>();
const fooControllerMessenger = rootMessenger.getRestricted({
  name: 'FooController',
});
const fooController = new FooController({
  messenger: fooControllerMessenger,
});
rootMessenger.subscribe('FooController:someEvent', () => {
  // do something with the event
});
```

## Use selectors to reduce the scope of state change listeners

Sometimes a controller needs to do something when a certain property in another controller's state changes. However, it is all too common to respond when _any_ part of the state changes:

🚫

```typescript
class FooController extends BaseController {
  constructor({ messenger }, { messenger: FooControllerMessenger }) {
    messenger.subscribe('BarController:stateChange', (state) => {
      doSomethingWith(state.baz);
    });
  }
}
```

This can lead to unnecessary operations. One solution is to keep track of the old value of the property in question and only respond when it is different:

⚠️

```typescript
class FooController extends BaseController {
  constructor({ messenger }, { messenger: FooControllerMessenger }) {
    let { baz: previousBaz } = messenger.call('BarController:getState');
    messenger.subscribe('BarController:stateChange', (state) => {
      if (previousBaz !== state.baz) {
        doSomethingWith(state.baz);
        previousBaz = state.baz;
      }
    });
  }
}
```

But this gets unwieldy if there are multiple properties:

⚠️

```typescript
class FooController extends BaseController {
  constructor({ messenger }, { messenger: FooControllerMessenger }) {
    let {
      baz: previousBaz,
      qux: previouxQux,
      foz: previousFoz,
    } = messenger.call('BarController:getState');
    messenger.subscribe('BarController:stateChange', (state) => {
      if (
        previousBaz !== state.baz ||
        previousQux !== state.qux ||
        previousFoz !== state.foz
      ) {
        doSomethingWith(state.baz, state.qux, state.foz);
        previousBaz = state.baz;
        previousQux = state.qux;
        previousFoz = state.foz;
      }
    });
  }
}
```

A much more reliable and concise way to achieve this is to use a selector function. This automatically restricts the event listener such that it is called when the return value of the function is different from one call to the next:

✅

```typescript
class FooController extends BaseController {
  constructor({
    messenger,
  }, {
    messenger: FooControllerMessenger
  }) {
    messenger.subscribe(
      'BarController:stateChange',
      ([baz, qux, foz]) => {
        doSomethingWith(baz, qux, foz);
      },
      (state) => [state.baz, state.qux, state.foz];
    );
  }
}
```

## Don't represent data in state multiple ways

Be mindful that state is part of the controller's API just as much as its methods are, and therefore it should also be as concise as possible. A piece of data should only be represented one way; if there are multiple instances of the same objects in separate parts of state, those instances should be extracted to a new state property, and the higher level forms should be removed and derived by the client.

### Also see

- ["Keep state minimal and derive additional values"](https://redux.js.org/style-guide/#keep-state-minimal-and-derive-additional-values) in the Redux Style Guide.

## Remove getters in favor of direct state access

The `state` of a controller should be simple enough such that consumers are able to access it directly rather than using getters:

🚫

```typescript
class FooController extends BaseController {
  getActiveAccounts() {
    return this.state.accounts.filter((account) => account.isActive);
  }

  get inactiveAccounts() {
    return this.state.accounts.filter((account) => !account.isActive);
  }
}

// Then, later...
const fooController = new FooController();

for (const account of fooController.getActiveAccounts()) {
  // ...
}

for (const account of fooController.inactiveAccounts) {
  // ...
}
```

✅

```typescript
class FooController extends BaseController {}

// Then, later...
const fooController = new FooController();

const activeAccounts = fooController.state.accounts.filter(
  (account) => account.isActive,
);
for (const account of activeAccounts) {
  // ...
}

const inactiveAccounts = fooController.state.accounts.filter(
  (account) => !account.isActive,
);
for (const account of inactiveAccounts) {
  // ...
}
```

Instead of getters, try selectors:

💡

```typescript
// === foo-controller ===

type FooControllerState = {
  // ...
};

export fooControllerSelectors = {
  activeAccounts: (state: FooControllerState) => {
    return state.accounts.filter(
      (account) => account.isActive,
    )
  },
  inactiveAccounts: (state: FooControllerState) => {
    return state.accounts.filter(
      (account) => !account.isActive,
    )
  },
};

export class FooController extends BaseController {
}

// === Client ==

import { select } from "@metamask/base-controller";
import { FooController, fooControllerSelectors } from "@metamask/foo-controller";

const fooController = new FooController();

const [activeAccounts, inactiveAccounts] = select(
  fooController,
  [
    fooControllerSelectors.activeAccounts,
    fooControllerSelectors.inactiveAccounts,
  ]
);

for (const account of activeAccounts) {
  // ...
}

for (const account of inactiveAccounts) {
  // ...
}
```

## Treat state-mutating methods as actions

Just as each property of state [does not need a getter method](#remove-getters-in-favor-of-direct-state-access), each property of state does not need a setter method, either.

Methods that change the state of the controller do not need to strictly execute low-level operations such as adding, updating, or deleting a single property from state. Rather, they should be designed to support a higher-level task that the consumer wants to carry out. This is ultimately dictated by the needs of the client UI, and so they should also be given a name that reflects the behavior in the UI.

🚫

```typescript
class AlertsController extends BaseController {
  setAlertShown(alertId: string, isShown: boolean) {
    this.update((state) => {
      state[alertId].isShown = isShown;
    });
  }
}
```

✅

```typescript
class AlertsController extends BaseController {
  showAlert(alertId: string) {
    this.update((state) => {
      state.alerts[alertId].isShown = true;
    });
  }

  hideAlert(alertId: string) {
    this.update((state) => {
      state.alerts[alertId].isShown = false;
    });
  }
}
```

### Also see

- ["Model actions as events, not setters"](https://redux.js.org/style-guide/#model-actions-as-events-not-setters) in the Redux Style Guide.
