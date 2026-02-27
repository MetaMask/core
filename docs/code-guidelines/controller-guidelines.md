# Guidelines for writing controllers

## Understand the purpose of the controller pattern

Controllers are foundational pieces within MetaMask's architecture:

- They keep and manage wallet-centric data, which can be saved and recalled upon reloading (accounts, transactions, preferences, etc.).
- They contain business logic that powers functionality in the product (what happens when the wallet is locked, the network is switched, a transaction is completed, etc.).
- They act as a communication layer between service layers (blockchains, internal or external APIs, etc.).
- They allow the application to be divided into logical modules which can be maintained by different teams within the company.

## Use the latest version of `BaseController` for controllers

All controllers should inherit from `BaseController` from the `@metamask/base-controller` package. This provides a few benefits:

- It defines a standard interface for all controllers.
- It introduces the messenger, which is useful for interacting with other parts of the application without requiring a direct reference.
- It enforces that `update` is the only way to modify the state of the controller and provides a way to listen for state updates via the messenger.
- It simplifies initialization by consolidating constructor arguments into one options object.

## Don't use `BaseController` for non-controllers

One of the uniquely identifying features of a controller is the ability to manage state.

If you have a class that does not capture any data in state, then your class does not need to inherit from `BaseController` (even if it uses a messenger).

## Maintain a clear and concise API

The name of the controller should reflect its responsibility. If, when creating a controller, it is difficult to come up with a good name, consider defining the responsibility first.

Each public method and each state property of a controller should have a purpose, and the name of the method or state property should be readable and should reflect the purpose clearly. If something does not need to be public, it should be made private; if it is unnecessary, it should be removed.

## Accept an optional, partial representation of state

Although `BaseController` requires a full representation of controller state, in practice, controllers should accept a partial version and then supply missing properties with defaults. In fact, the `state` argument should be optional:

```typescript
type FooControllerState = {
  // ...
};

function getDefaultFooControllerState(): FooControllerState {
  // ...
}

class FooController extends BaseController</* ... */> {
  constructor({
    messenger,
    state = {},
  }: {
    messenger: FooControllerMessenger;
    state?: Partial<FooControllerState>;
  }) {
    super({
      // ...
      messenger,
      state: { ...getDefaultFooControllerState(), ...state },
    });

    // ...
  }
}
```

## Provide a default representation of state

Each controller needs a default representation in order to fully initialize itself when [receiving a partial representation of state](#accept-an-optional-partial-representation-of-state). A default representation of state is also useful when testing interactions with a controller's `*:stateChange` event.

A function which returns this default representation should be defined and exported. It should be called `getDefault${ControllerName}State`.

Note that the default representation object is not exported directly to ensure that it is a new object reference each time it is requested, thereby preventing accidental updates to this object in tests or other places.

```typescript
/* === packages/foo-controller/src/FooController.ts === */

type FooControllerState = {
  // ...
};

export function getDefaultFooControllerState(): FooControllerState {
  // ...
}

class FooController extends BaseController</* ... */> {
  constructor({
    messenger,
    state = {},
  }: {
    messenger: FooControllerMessenger;
    state?: Partial<FooControllerState>;
  }) {
    super({
      name,
      messenger,
      state: { ...getDefaultFooControllerState(), ...state },
    });

    // ...
  }
}

/* === packages/foo-controller/src/index.ts === */

export { FooController, getDefaultFooControllerState } from './FooController';
```

## Define metadata for state properties

Each property in state has two pieces of metadata that must be specified. This instructs the client how to treat that property:

- `includeInDebugSnapshot` - Informs the client whether to include the property in debug state logs attached to Sentry events (`true`) or not (`false`). We must exclude any data that could potentially be personally identifying here, and we often also exclude data that is large and/or unhelpful for debugging.
- `includeInStateLogs` - Informs the client whether to include the property in state logs downloaded by users (`true`) or not (`false`). We must exclude any sensitive data that we don't want our support team to have access to (such as private keys). We include personally-identifiable data related to on-chain state here (we never collect this data, and we have a disclaimer about this in the UI when users download state logs), but other types of personally identifiable information must still be excluded.
- `persist` — Informs the client whether the property should be placed in persistent storage (`true`) or not (`false`). Opting out is useful if you want to have a property in state for convenience reasons but you know that property is ephemeral and can be easily reconstructed.
- `usedInUi` - Informs the client whether the property is used in the UI (`true`) or not (`false`). This is used to filter the state we send to the UI to improve performance.

A variable named `${controllerName}Metadata` should be defined (there is no need to export it) and passed as the `metadata` argument in the constructor to `BaseController`.

```typescript
const keyringControllerMetadata = {
  vault: {
    // This property can be used to identify a user, so we want to make sure we
    // do not include it in Sentry.
    includeInDebugSnapshot: false,
    // We don't want to include this in state logs because it contains sensitive key material.
    includeInStateLogs: false,
    // We want to persist this property so it's restored automatically, as we
    // cannot reconstruct it otherwise.
    persist: true,
    // This property is only used in the controller, not in the UI.
    usedInUi: false,
  },
  isUnlocked: {
    // This value is not sensitive, and is useful for diagnosing errors reported through support.
    includeInStateLogs: true
    // We do not need to persist this property in state, as we want to
    // initialize state with the wallet unlocked.
    persist: false,
    // This property has no PII, so it is safe to send to Sentry.
    anonymous: true,
    // This is used in the UI
    usedInUi: true,
  },
};

class KeyringController extends BaseController</*...*/> {
  constructor(/* ... */) {
    super({
      // name: ...,
      metadata: keyringControllerMetadata,
      // messenger: ...,
      // state: ...,
    });
  }
}
```

## Use single "options bag" for constructor arguments

A controller should receive all of its arguments as named argument via a single "options bag". These arguments must include those that are required by `BaseController` (`messenger`, `metadata`, `name`, and `state`). However, they may also include any that are required by the controller itself; there is no need for additional positional arguments after the options bag:

🚫 **`isEnabled` is a separate argument**

```typescript
class FooController extends BaseController</* ... */> {
  constructor(
    {
      messenger,
      state = {},
    }: {
      messenger: FooControllerMessenger;
      state?: Partial<FooControllerState>;
    },
    isEnabled: boolean,
  ) {
    // ...
  }
}
```

✅ **`isEnabled` is another option**

```typescript
class FooController extends BaseController</* ... */> {
  constructor({
    messenger,
    state = {},
    isEnabled,
  }: {
    messenger: FooControllerMessenger;
    state?: Partial<FooControllerState>;
    isEnabled: boolean;
  }) {
    // ...
  }
}
```

## Use the messenger instead of callbacks

Prior to BaseController v2, it was common for a controller to respond to an event occurring within another controller (such a state change) by receiving an event listener callback which the client would bind ahead of time:

🚫 **The constructor takes a callback function, `onBarStateChange`**

```typescript
/* === This repo: packages/foo-controller/src/FooController.ts === */

class FooController extends BaseControllerV1</* ... */> {
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

// === Client repo ===

const barController = new BarController();
const fooController = new FooController({
  onBarStateChange: barController.subscribe.bind(barController),
});
```

If the recipient controller uses a messenger, however, the callback pattern is unnecessary. Using the messenger not only aligns the controller with `BaseController`, but also reduces the number of options that consumers need to remember in order to use the controller:

✅ **The constructor subscribes to the `BarController:stateChange` event**

```typescript
/* === This repo: packages/foo-controller/src/FooController.ts === */

const name = 'FooController';

type FooControllerMessenger = Messenger<
  typeof name,
  FooControllerActions,
  FooControllerEvents
>;

class FooController extends BaseController<
  'FooController',
  // ...,
  FooControllerMessenger
> {
  constructor({ messenger /*, ... */ }, { messenger: FooControllerMessenger }) {
    super({ messenger /* ... */ });

    messenger.subscribe('BarController:stateChange', (state) => {
      // do something with the state
    });
  }
}

// === Client repo ===

const rootMessenger = new Messenger<'Root', RootActions, RootEvents>({
  namespace: 'Root',
});
const barControllerMessenger = new Messenger<
  'BarController',
  BarControllerActions,
  BarControllerEvents,
  typeof rootMessenger
>({
  namespace: 'BarController',
  parent: rootMessenger,
});
const barController = new BarController({
  messenger: barControllerMessenger,
});
const fooControllerMessenger = new Messenger<
  'FooController',
  FooControllerActions,
  FooControllerEvents | BarControllerStateChange,
  typeof rootMessenger
>({
  namespace: 'FooController',
  parent: rootMessenger,
});
rootMessenger.delegate({
  events: ['BarController:stateChange'],
  messenger: fooControllerMessenger,
});
const fooController = new FooController({
  messenger: fooControllerMessenger,
});
```

## Use the messenger instead of event emitters

Some controllers expose an EventEmitter object so that other parts of the system can listen to them:

🚫 **The controller emits the `someEvent` event**

```typescript
/* === This repo: packages/foo-controller/src/FooController.ts === */

import { EventEmitter } from 'events';

class FooController extends BaseController</* ... */> {
  hub: EventEmitter;

  constructor(/* ... */) {
    // ...

    this.hub = new EventEmitter();
  }

  doSomething() {
    this.hub.emit('someEvent');
  }
}

// === Client repo ===

const fooController = new FooController();
fooController.hub.on('someEvent', () => {
  // respond to the event somehow
});
```

However, this pattern can be replaced with the use of the messenger:

✅ **The controller emits the `FooController:someEvent` event**

```typescript
/* === This repo: packages/foo-controller/src/FooController.ts === */

const name = 'FooController';

type FooControllerMessenger = Messenger<
  typeof name,
  FooControllerActions,
  FooControllerEvents
>;

class FooController extends BaseController<
  'FooController',
  // ...,
  FooControllerMessenger
> {
  constructor({ messenger /*, ... */ }, { messenger: FooControllerMessenger }) {
    super({ messenger /*, ... */ });
  }

  doSomething() {
    this.messenger.publish('FooController:someEvent');
  }
}

// === Client repo ===

const rootMessenger = new Messenger<'Root', RootActions, RootEvents>({
  namespace: 'Root',
});
const fooControllerMessenger = new Messenger<
  'FooController',
  FooControllerActions,
  FooControllerEvents,
  typeof rootMessenger
>({
  namespace: 'FooController',
  parent: rootMessenger,
});
const fooController = new FooController({
  messenger: fooControllerMessenger,
});
rootMessenger.subscribe('FooController:someEvent', () => {
  // do something with the event
});
```

## Expose controller methods through messenger in bulk

Exposing controller methods through the messenger can be tedious. An action type must be created for each method, each action type must be added to the messenger type, and each action must be registered through the messenger. This creates a lot of boilerplate that must be maintained.

It is tempting to extract action registrations to a private method:

🚫

```typescript
export type FooControllerSomeMethodAction = {
  type: 'FooController:someMethod';
  handler: FooController['someMethod'];
};

export type FooControllerAnotherMethodAction = {
  type: 'FooController:anotherMethod';
  handler: FooController['anotherMethod'];
};

export type FooControllerYetAnotherMethodAction = {
  type: 'FooController:yetAnotherMethod';
  handler: FooController['yetAnotherMethod'];
};

export type FooControllerStillYetAnotherMethodAction = {
  type: 'FooController:stillTetAnotherMethod';
  handler: FooController['stillYetAnotherMethod'];
};

export type FooControllerActions =
  | FooControllerSomeMethodAction
  | FooControllerAnotherMethodAction
  | FooControllerYetAnotherMethodAction
  | FooControllerStillYetAnotherMethodAction;

export type FooControllerMessenger = Messenger<
  'FooController',
  FooControllerActions,
  never
>;

class FooController extends BaseController<
  'FooController',
  // ...,
  FooControllerMessenger
> {
  constructor({ messenger /*, ... */ }, { messenger: FooControllerMessenger }) {
    super({ messenger /*, ... */ });

    this.#registerActionHandlers();
  }

  someMethod() {
    // ...
  }

  anotherMethod() {
    // ...
  }

  yetAnotherMethod() {
    // ...
  }

  stillYetAnotherMethod() {
    // ...
  }

  // ...

  #registerActionHandlers() {
    this.messenger.registerActionHandler(
      `${CONTROLLER_NAME}:someMethod`,
      this.someMethod.bind(this),
    );
    this.messenger.registerActionHandler(
      `${CONTROLLER_NAME}:anotherMethod`,
      this.anotherMethod.bind(this),
    );
    this.messenger.registerActionHandler(
      `${CONTROLLER_NAME}:yetAnotherMethod`,
      this.yetAnotherMethod.bind(this),
    );
    this.messenger.registerActionHandler(
      `${CONTROLLER_NAME}:stillYetAnotherMethod`,
      this.stillYetAnotherMethod.bind(this),
    );
  }
}
```

This works, but the boilerplate remains.

Instead, you can follow this process:

1. Define a constant in your controller file called `MESSENGER_EXPOSED_METHODS`. Here is where you will list the methods you want to expose.
2. Remove manual action registrations; instead, call `registerMethodActionHandlers` and pass `MESSENGER_EXPOSED_METHODS`.
3. Remove messenger action types; instead, run `yarn generate-method-action-types`. This will create a file called `${ControllerName}-method-action-types.ts` and export a type called `${ControllerName}MethodActions`.
4. Import `${ControllerName}-method-action-types.ts` in your controller file, and add `${ControllerName}MethodActions` to `${ControllerName}Actions`.

✅

```typescript
import { FooControllerMethodActions } from './FooController-method-action-types';

export type FooControllerActions = FooControllerMethodActions;

export type FooControllerMessenger = Messenger<
  'FooController',
  FooControllerActions,
  never
>;

const MESSENGER_EXPOSED_METHODS = [
  'someMethod',
  'anotherMethod',
  'yetAnotherMethod',
  'stillYetAnotherMethod',
];

class FooController extends BaseController<
  'FooController',
  // ...,
  FooControllerMessenger
> {
  constructor({ messenger /*, ... */ }, { messenger: FooControllerMessenger }) {
    super({ messenger /*, ... */ });

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  someMethod() {
    // ...
  }

  anotherMethod() {
    // ...
  }

  yetAnotherMethod() {
    // ...
  }

  stillYetAnotherMethod() {
    // ...
  }

  // ...
}
```

## Define the `*:getState` action using the `ControllerGetStateAction` utility type

Each controller needs a type for its `*:getState` action. The `ControllerGetStateAction` utility type from the `@metamask/base-controller` package should be used to define this type.

The name of this type should be `${ControllerName}GetStateAction`.

```typescript
import type { ControllerGetStateAction } from '@metamask/base-controller';

type FooControllerGetStateAction = ControllerGetStateAction<
  'FooController',
  FooControllerState
>;
```

## Define the `*:stateChange` event using the `ControllerStateChangeEvent` utility type

Each controller needs a type for its `*:stateChange` event. The `ControllerStateChangeEvent` utility type from the `@metamask/base-controller` package should be used to define this type.

The name of this type should be `${ControllerName}StateChangeEvent`.

```typescript
import type { ControllerStateChangeEvent } from '@metamask/base-controller';

type FooControllerStateChangeEvent = ControllerStateChangeEvent<
  'FooController',
  FooControllerState
>;
```

## Use standard naming scheme for action identifiers

An action is equivalent to a function, and its identifier should be named in "camelCase".

```typescript
const name = 'FooController';

export type FooControllerShowNotificationAction = {
  type: `${typeof name}:showNotification`;
  handler: () => void;
};
```

## Use standard naming scheme for action types

Types for messenger actions should follow this naming scheme:

```
Controller name + Action identifier without controller name prefix + "Action"
```

🚫 **Type name does not include controller name and does not end with "Action"**

```typescript
const name = 'FooController';

export type ShowNotification = {
  type: `${typeof name}:show`;
  handler: () => void;
};
```

🚫 **Type name includes controller name, but does not match action identifier minus prefix**

```typescript
const name = 'FooController';

export type FooControllerShowNotificationAction = {
  type: `${typeof name}:show`;
  handler: () => void;
};
```

✅ **Type name now matches controller name + action identifier + "Action"**

```typescript
const name = 'FooController';

export type FooControllerShowAction = {
  type: `${typeof name}:show`;
  handler: () => void;
};
```

## Use standard naming scheme for event identifiers

An event is not an action, so the identifier for an event should not describe something that the controller needs to do, but rather something that has has happened to the controller.

You may find it helpful to pretend that the word "on" precedes the identifier (but do not include this in the identifier itself).

🚫 **`receiveMessage` sounds like a command**

```typescript
const name = 'FooController';

export type FooControllerReceiveMessageEvent = {
  type: `${typeof name}:receiveMessage`;
  payload: () => void;
};
```

🚫 **The event identifier includes "on"**

```typescript
const name = 'FooController';

export type FooControllerOnMessageReceivedEvent = {
  type: `${typeof name}:onMessageReceived`;
  payload: () => void;
};
```

✅ **The event identifier sounds like a statement and does not include "on"**

```typescript
const name = 'FooController';

export type FooControllerMessageReceivedEvent = {
  type: `${typeof name}:messageReceived`;
  payload: () => void;
};
```

## Use standard naming scheme for event types

Types for messenger events should follow this naming:

```
Controller name + Event identifier without controller name prefix + "Event"
```

🚫 **Type name does not include controller name and does not end with "Action"**

```typescript
const name = 'FooController';

export type MessageReceived = {
  type: `${typeof name}:messageReceived`;
  payload: () => void;
};
```

✅ **Type name now matches controller name + event identifier + "Event"**

```typescript
const name = 'FooController';

export type FooControllerMessageReceivedEvent = {
  type: `${typeof name}:messageReceived`;
  payload: () => void;
};
```

## Define and export a type union for internal action types

A controller should define and export a type union that holds all of its actions. This type union makes it easy to define the type for the controller's messenger.

The name of this type should be `${ControllerName}Actions`.

This type should be passed to `Messenger` as the 2nd type parameter. It should _not_ include external actions.

✅ **`FooControllerActions` is passed as the 2nd type parameter (assuming no external actions)**

```typescript
export type FooControllerActions =
  | FooControllerUpdateCurrencyAction
  | FooControllerUpdateRatesAction;

export type FooControllerMessenger = Messenger<
  'FooController',
  FooControllerActions,
  FooControllerEvents
>;
```

## Define and export a type union for internal event types

A controller should define and export a type union that holds all of its events. This type union makes it easy to define the type for the controller's messenger.

The name of this type should be `${ControllerName}Events`.

This type should be passed to `Messenger` as the 3rd type parameter. It should _not_ include external events.

✅ **`FooControllerEvents` is passed as the 3rd type parameter (assuming no external events)**

```typescript
export type FooControllerEvents =
  | FooControllerMessageReceivedEvent
  | FooControllerNotificationAddedEvent;

export type FooControllerMessenger = Messenger<
  'FooController',
  FooControllerActions,
  FooControllerEvents
>;
```

## Define, but do not export, a type union for external action types

A controller may wish to call actions defined by other controllers, and therefore will need to include them in the controller messenger's type definition.

In this case, the controller should group these types into a type union so that they can be easily passed to the `Messenger` type. However, it should not export this type, as it would then be re-exporting types that another package has already exported.

The name of this type should be `AllowedActions`.

This type should be passed to `Messenger` as part of the 2nd type parameter, in a type union with internal actions.

🚫 **`AllowedActions` is included in the actions type union and _is_ exported**

```typescript
/* === packages/foo-controller/src/FooController.ts === */

export type FooControllerActions =
  | FooControllerUpdateCurrencyAction
  | FooControllerUpdateRatesAction;

export type AllowedActions =
  | BarControllerDoSomethingAction
  | BarControllerDoSomethingElseAction;

export type FooControllerMessenger = Messenger<
  'FooController',
  FooControllerActions | AllowedActions,
  FooControllerEvents
>;

/* === packages/foo-controller/src/index.ts === */

export type { AllowedActions } from '@metamask/foo-controller';
```

🚫 **External actions are included in controller action type**

```typescript
export type FooControllerActions =
  | FooControllerUpdateCurrencyAction
  | FooControllerUpdateRatesAction
  | BarControllerDoSomethingAction
  | BarControllerDoSomethingElseAction;

export type FooControllerMessenger = Messenger<
  'FooController',
  FooControllerActions,
  FooControllerEvents
>;
```

✅ **`AllowedActions` is included in the actions type union but is _not_ exported**

```typescript
export type FooControllerActions =
  | FooControllerUpdateCurrencyAction
  | FooControllerUpdateRatesAction;

type AllowedActions =
  | BarControllerDoSomethingAction
  | BarControllerDoSomethingElseAction;

export type FooControllerMessenger = Messenger<
  'FooController',
  FooControllerActions | AllowedActions,
  FooControllerEvents
>;
```

If, in a test, you need to access all of the actions supported by a messenger, use the [`MessengerActions` utility type](../../packages/messenger/src/Messenger.ts):

```typescript
import type { MessengerActions, MessengerEvents } from '@metamask/messenger';

const messenger = new Messenger<
  controllerName,
  MessengerActions<FooControllerMessenger>,
  MessengerEvents<FooControllerMessenger>
>();
```

## Define, but do not export, a type union for external event types

A controller may wish to subscribe to events defined by other controllers, and therefore will need to include them in the controller messenger's type definition.

In this case, the controller should group these types into a type union so that they can be easily passed to the `Messenger` type. However, it should not export this type, as it would then be re-exporting types that another package has already exported.

The name of this type should be `AllowedEvents`.

This type should be passed to `Messenger` as part of the 3rd type parameter, in a type union with internal events.

🚫 **`AllowedEvents` is included in the actions type union and _is_ exported**

```typescript
/* === packages/foo-controller/src/FooController.ts === */
export type FooControllerEvents =
  | FooControllerMessageReceivedEvent
  | FooControllerNotificationAddedEvent;

export type AllowedEvents =
  | BarControllerSomethingHappenedEvent
  | BarControllerSomethingElseHappenedEvent;

export type FooControllerMessenger = Messenger<
  'FooController',
  FooControllerActions,
  FooControllerEvents | AllowedEvents
>;

/* === packages/foo-controller/src/index.ts === */

export type { AllowedEvents } from '@metamask/foo-controller';
```

🚫 **External events are included in controller event type**

```typescript
export type FooControllerEvents =
  | FooControllerMessageReceivedEvent
  | FooControllerNotificationAddedEvent
  | BarControllerSomethingHappenedEvent
  | BarControllerSomethingElseHappenedEvent;

export type FooControllerMessenger = Messenger<
  'FooController',
  FooControllerActions,
  FooControllerEvents
>;
```

✅ **`AllowedEvents` is included in the events type union but is _not_ exported**

```typescript
export type FooControllerEvents =
  | FooControllerMessageReceivedEvent
  | FooControllerNotificationAddedEvent;

type AllowedEvents =
  | BarControllerSomethingHappenedEvent
  | BarControllerSomethingElseHappenedEvent;

export type FooControllerMessenger = Messenger<
  'FooController',
  FooControllerActions,
  FooControllerEvents | AllowedEvents
>;
```

If, in a test, you need to access all of the events supported by a messenger, use the [`MessengerEvents` utility type](../../packages/messenger/src/Messenger.ts):

```typescript
import type { MessengerActions, MessengerEvents } from '@metamask/messenger';

const messenger = new Messenger<
  controllerName,
  MessengerActions<FooControllerMessenger>,
  MessengerEvents<FooControllerMessenger>
>();
```

## Define and export a type for the controller's messenger

This type should include:

- Actions defined and exported by the controller that it registers and expects consumers to call (i.e., _internal actions_)
  - This should always include `${controllerName}GetStateAction`
- Actions imported from other controllers that the controller calls (i.e., _external actions_)
- Events defined and exported by the controller that it publishes and expects consumers to subscribe to (i.e., _internal events_)
  - This should always include `${controllerName}StateChangeEvent`
- Events imported from other controllers that the controller subscribes to (i.e., _external events_)

The name of this type should be `${ControllerName}Messenger`.

A messenger with internal and external actions and events looks like this:

```typescript
import type {
  ApprovalControllerAddApprovalRequestAction,
  ApprovalControllerAcceptApprovalRequestAction,
  ApprovalControllerApprovalRequestApprovedEvent,
  ApprovalControllerApprovalRequestRejectedEvent,
} from '@metamask/approval-controller';

export type SwapsControllerGetStateAction = ControllerGetStateAction<
  'SwapsController',
  SwapsControllerState
>;

export type SwapsControllerInitiateSwapAction = {
  type: 'SwapsController:initiateSwap';
  handler: (swap: Swap) => void;
};

export type SwapsControllerActions =
  | SwapsControllerGetStateAction
  | SwapsControllerInitiateSwapAction;

export type AllowedActions =
  | ApprovalControllerAddApprovalRequestAction
  | ApprovalControllerAcceptApprovalRequestAction;

export type SwapsControllerStateChangeEvent = ControllerStateChangeEvent<
  'SwapsController',
  SwapsControllerState
>;

export type SwapsControllerSwapCreatedEvent = {
  type: 'SwapsController:swapCreated';
  payload: (swap: Swap) => void;
};

export type SwapsControllerEvents =
  | SwapsControllerStateChangeEvent
  | SwapsControllerSwapCreatedEvent;

export type AllowedEvents =
  | ApprovalControllerApprovalRequestApprovedEvent
  | ApprovalControllerApprovalRequestRejectedEvent;

export type SwapsControllerMessenger = Messenger<
  'SwapsController',
  SwapsControllerActions | AllowedActions,
  SwapsControllerEvents | AllowedEvents
>;
```

A messenger that allows no actions or events (whether internal or external) looks like this:

```typescript
export type FooServiceMessenger = Messenger<'FooService', never, never>;
```

## Define and export a type for the controller's state

The name of this type should be `${ControllerName}State`. It should be exported.

🚫 **Non-standard name**

```typescript
export type FooState = {
  bar: string;
};
```

🚫 **Not exported**

```typescript
type FooControllerState = {
  bar: string;
};
```

✅ **Standard name and exported**

```typescript
// === packages/foo-controller/src/FooController.ts

export type FooControllerState = {
  bar: string;
};

// === packages/foo-controller/src/index.ts

export type { FooControllerState } from './FooController';
```

The type should be compatible with `Json` (otherwise, a type error will occur when passing the state type as a type parameter to `BaseController`). For instance, if a property needs to be designed as optional, only the `?` token should be used to do so; `| undefined` cannot be used, as `undefined` is not part of the `Json` type.

🚫 **`FooControllerState` uses `undefined` to denote an optional property**

```typescript
export type FooControllerState = {
  bar: string | undefined;
};

export class FooController extends BaseController<
  'FooController',
  // ERROR:
  // [tsserver 2344] [E] Type 'FooControllerState' does not satisfy the constraint 'StateConstraint'.
  //   Property 'bar' is incompatible with index signature.
  //     Type 'string | undefined' is not assignable to type 'Json'.
  FooControllerState,
  FooControllerMessenger
> {
  // ...
}
```

✅ **`FooControllerState` uses `?` to denote an optional property**

```typescript
export type FooControllerState = {
  bar?: string;
};

export class FooController extends BaseController<
  'FooController',
  // No error
  FooControllerState,
  FooControllerMessenger
> {
  // ...
}
```

## Use selectors to reduce the scope of state change listeners

Sometimes a controller needs to do something when a certain property in another controller's state changes. It is common to simply listen to the `stateChange` event of that controller and make use of whatever properties are necessary to perform the requisite action. However, this naive approach can lead to an unnecessarily frequent number of operations such as API calls:

🚫 **`this.#updateGasFees` is called when any property in `NetworkController` state changes, even though only `selectedNetworkClientId` is used**

```typescript
class GasFeeController extends BaseController</* ... */> {
  constructor({
    messenger,
  }: // ...
  {
    messenger: GasFeeControllerMessenger;
    // ...
  }) {
    // ...

    messenger.subscribe(
      'NetworkController:stateChange',
      (networkControllerState) => {
        this.#updateGasFees(networkControllerState.selectedNetworkClientId);
      },
    );
  }
}
```

One way to fix this is to check if the other controller (the one being subscribed to) has a more suitable, granular event for the data being acted upon. For instance, `NetworkController` has a `networkDidChange` event which can be used in place of `NetworkController:stateChange` if the subscribing controller needs to know when the network has been switched:

✅ **`NetworkController:networkDidChange` is used instead of `NetworkController:stateChange`**

```typescript
class GasFeeController extends BaseController</* ... */> {
  constructor({
    messenger,
  }: // ...
  {
    messenger: GasFeeControllerMessenger;
    // ...
  }) {
    // ...

    messenger.subscribe(
      'NetworkController:networkDidChange',
      (networkControllerState) => {
        this.#updateGasFees(networkControllerState.selectedNetworkClientId);
      },
    );
  }
}
```

If the target controller does not have an alternate event to use, another solution is to keep track of the old value of the property in question and only take action when it is different. This requires first getting the respective property from the target controller and then comparing it against the new property in the event handler:

⚠️

```typescript
class TokensController extends BaseController</* ... */> {
  constructor({
    messenger,
  }: // ...
  {
    messenger: TokensControllerMessenger;
    // ...
  }) {
    // ...

    const accountsController = messenger.call('AccountsController:getState');
    let selectedAccount = accountsController.internalAccounts.selectedAccount;

    messenger.subscribe(
      'AccountsController:stateChange',
      (newAccountsControllerState) => {
        if (newAccountsControllerState.selectedAccount !== selectedAccount) {
          this.#updateTokens(
            newAccountsControllerState.internalAccounts.selectedAccount,
          );
        }
      },
    );
  }
}
```

But this gets unwieldy if there are multiple properties to check:

⚠️

```typescript
class NftController extends BaseController/*<...>*/ {
  constructor({ messenger }, { messenger: NftControllerMessenger }) {
    // ...

    let preferencesControllerState = messenger.call(
      'PreferencesController:getState',
    );

    messenger.subscribe(
      'PreferencesController:stateChange',
      (newPreferencesControllerState) => {
        if (
          preferencesControllerState.ipfsGateway !== newPreferencesControllerState.ipfsGateway,
          preferencesControllerState.openSeaEnabled !== newPreferencesControllerState.openSeaEnabled,
          preferencesControllerState.isIpfsGatewayEnabled !== newPreferencesControllerState.isIpfsGatewayEnabled,
        ) {
          this.#updateNfts(
            newPreferencesControllerState.ipfsGateway,
            newPreferencesControllerState.openSeaEnabled,
            newPreferencesControllerState.isIpfsGatewayEnabled
          );
          preferencesControllerState = newPreferencesControllerState;
        }
      },
    );
  }
}
```

Instead, you can define a selector function which returns a subset of the state you need to perform the action and pass it as the third argument to `subscribe`. Note that the return value of this function should not create a new object if none of the properties you are watching have changed. To aid with this, you can have your target controller [expose selectors of its own](#expose-derived-state-using-selectors-instead-of-getters) for each of the desired properties, and then you can use the `createSelector` function from the `reselect` library to compose those selectors. This ensures that your event handler is called at the right time:

✅

```typescript
/* === packages/preferences-controller/src/PreferencesController.ts === */

const selectIpfsGateway = (preferencesControllerState) =>
  preferencesControllerState.ipfsGateway;

const selectOpenSeaEnabled = (preferencesControllerState) =>
  preferencesControllerState.openSeaEnabled;

const selectIsIpfsGatewayEnabled = (preferencesControllerState) =>
  preferencesControllerState.isIpfsGatewayEnabled;

export const preferencesControllerSelectors = {
  selectIpfsGateway,
  selectOpenSeaEnabled,
  selectIsIpfsGatewayEnabled,
};

/* === packages/nft-controller/src/NftController.ts === */

import { createSelector } from 'reselect';
import { preferencesControllerSelectors } from '@metamask/preferences-controller';

const selectPreferencesControllerState = createSelector(
  [
    preferencesControllerSelectors.selectIpfsGateway,
    preferencesControllerSelectors.selectOpenSeaEnabled,
    preferencesControllerSelectors.selectIsIpfsGatewayEnabled,
  ],
  (ipfsGateway, openSeaEnabled, isIpfsGatewayEnabled) => ({
    ipfsGateway,
    openSeaEnabled,
    isIpfsGatewayEnabled,
  }),
);

class NftController extends BaseController /*<...>*/ {
  constructor({ messenger }, { messenger: NftControllerMessenger }) {
    // ...

    messenger.subscribe(
      'PreferencesController:stateChange',
      ({ ipfsGateway, openSeaEnabled, isIpfsGatewayEnabled }) => {
        this.#updateNfts(ipfsGateway, openSeaEnabled, isIpfsGatewayEnabled);
      },
      selectPreferencesControllerState,
    );
  }
}
```

## Don't represent data in state multiple ways

Ideally, a piece of data should be represented in only one way and kept in only one place in state. Storing copies or variations of the same data makes it confusing for consumers and makes it possible for different parts of the client to use state in an inconsistent manner, which could lead to strange behavior at best and fund loss issues at worst. Use types and validations to ensure that state is always coherent at both compile time and runtime. Remove higher level forms from state in favor of deriving them using other means such as [selectors](#expose-derived-state-using-selectors-instead-of-getters) or a self-subscription.

🚫 **Message count is stored in state two ways**

```typescript
type MessagesControllerState = {
  messages: Message[];
  messageCount: number;
};

class MessagesController extends BaseController<
  'MessagesController',
  MessagesControllerState
  // ...
> {
  addMessage(message: Message) {
    this.update((state) => {
      // Oops, we forgot to update message count!
      state.messages.push(message);
    });
  }
}
```

✅ **Only one way to access message count**

```typescript
type MessagesControllerState = {
  messages: Message[];
};

class MessagesController extends BaseController<
  'MessagesController',
  MessagesControllerState
  // ...
> {
  addMessage(message: Message) {
    this.update((state) => {
      // No need to also access message count, since it may be accessed via
      // `state.messages.count`
      state.messages.push(message);
    });
  }
}
```

Similarly, for the same reasons, only one controller should "own" a piece of data:

🚫 **Selected account is stored in two different controllers**

```typescript
/* === packages/accounts-controller/src/AccountsController.ts === */

type Account = {
  address: Hex;
}

type AccountsControllerState = {
  selectedAccount: Account;
}

class AccountsController extends BaseController<
  'AccountsController',
  AccountsControllerState,
  // ...
> {
  // ...
}

/* === packages/preferences-controller/src/PreferencesController.ts === */

type PreferencesControllerState = {
  selectedAccountAddress: Hex;
}

class PreferencesController extends BaseController<
  'PreferencesController',
  PreferencesControllerState,
  ...
> {
  // ...
}
```

✅ **Only one controller owns the selected account, and the other consumes it**

```typescript
/* === packages/accounts-controller/src/AccountsController.ts === */

type Account = {
  address: Hex;
};

type AccountsControllerState = {
  selectedAccount: Account;
};

export type AccountsControllerGetStateAction = ControllerGetStateAction<
  'AccountsController',
  AccountsControllerState
>;

class AccountsController extends BaseController<
  'AccountsController',
  AccountsControllerState
  // ...
> {
  // ...
}

/* === packages/preferences-controller/src/PreferencesController.ts === */

import { AccountsControllerGetStateAction } from '@metamask/accounts-controller';

// Other type definitions

type AllowedActions = AccountsControllerGetStateAction;

type PreferencesControllerMessenger = Messenger<
  'PreferencesController',
  PreferencesControllerActions | AllowedActions,
  PreferencesControllerEvents
>;

class PreferencesController extends BaseController<
  'PreferencesController',
  // ...
  PreferencesControllerMessenger
> {
  constructor({
    messenger,
  }: // ...
  {
    messenger: PreferencesControllerMessenger;
    // ...
  }) {
    // ...

    messenger.subscribe(
      'AccountsController:getState',
      (selectedAccount) => {
        // do something with the selected account
      },
      (accountsControllerState) => accountsControllerState.selectedAccount,
    );
  }
}
```

### Also see

- ["Keep state minimal and derive additional values"](https://redux.js.org/style-guide/#keep-state-minimal-and-derive-additional-values) in the Redux Style Guide.

## Expose derived state using selectors instead of getters

Sometimes, for convenience, consumers want access to a higher-level representation of a controller's state. It is tempting to add a method to the controller which provides this representation, but this means that a consumer would need an entire instance of the controller on hand to use this method. Using the messenger mitigates this problem, but then the consumer would need access to a messenger as well, which may be impossible in places like Redux selector functions.

To make it easier to share such representations across disparate parts of the codebase in a flexible fashion, you can define and export selector functions from your controller file instead. They should be placed under a `${controllerName}Selectors` object and then exported.

🚫 **Convenience methods added to controller to access parts of state**

```typescript
/* === packages/accounts-controller/src/AccountsController.ts === */

class AccountsController extends BaseController</* ... */> {
  getActiveAccounts() {
    return this.state.accounts.filter((account) => account.isActive);
  }

  getInactiveAccounts() {
    return this.state.accounts.filter((account) => account.isActive);
  }
}

/* === packages/tokens-controller/src/TokensController.ts === */

class TokensController extends BaseController</* ... */> {
  constructor({
    accountsController,
  }: // ...
  {
    accountsController: AccountsController;
    // ...
  }) {
    this.#accountsController = accountsController;
    // ...
  }

  fetchTokens() {
    const tokens = getTokens(this.#accountsController.getActiveAccounts());
    // ... do something with tokens ...
  }
}
```

🚫 **Methods exposed via the messenger**

```typescript
/* === This repo: packages/accounts-controller/src/AccountsController.ts === */

export type AccountsControllerGetActiveAccountsAction = {
  type: 'AccountsController:getActiveAccounts';
  handler: AccountsController['getActiveAccounts'];
};

export type AccountsControllerGetInactiveAccountsAction = {
  type: 'AccountsController:getInactiveAccounts';
  handler: AccountsController['getInactiveAccounts'];
};

export type AccountsControllerActions =
  /// Other actions
  | AccountsControllerGetActiveAccountAction
  | AccountsControllerGetInactiveAccountsAction;

export type AccountsControllerMessenger = Messenger<
  'AccountsController',
  AccountsControllerActions,
  AccountsControllerEvents
>;

class AccountsController extends BaseController</* ... */> {
  getActiveAccounts() {
    return this.state.accounts.filter((account) => account.isActive);
  }

  getInactiveAccounts() {
    return this.state.accounts.filter((account) => account.isActive);
  }
}

/* === This repo: packages/tokens-controller/src/TokensController.ts === */

import type {
  AccountsControllerGetActiveAccountsAction,
  AccountsControllerGetInactiveAccountsAction,
} from '@metamask/accounts-controller';

type AllowedActions =
  | AccountsControllerGetActiveAccountsAction
  | AccountsControllerGetInactiveAccountsAction;

export type TokensControllerMessenger = Messenger<
  'TokensController',
  TokensControllerActions | AllowedActions,
  TokensControllerEvents
>;

class TokensController extends BaseController</* ... */> {
  constructor({
    messenger,
  }: // ...
  {
    messenger: TokensControllerMessenger;
    // ...
  }) {
    // ...
  }

  fetchTokens() {
    // Now TokensController no longer needs an instance of AccountsController to
    // access the list of active accounts, which is good...
    const tokens = getTokens(
      this.messenger.call('AccountsController:getActiveAccounts'),
    );
    // ... do something with tokens ...
  }
}

/* === Client repo: selectors.ts  === */

import { createSelector } from 'reselect';
import { accountsControllerSelectors } from '@metamask/accounts-controller';

const selectAccountsControllerState = (state) => {
  return state.engine.backgroundState.AccountsController;
};

// ⚠️  ... but this won't work!
export const selectActiveAccounts = createSelector(
  selectAccountsControllerState,
  (accountsControllerState) => accountsControllerState.getActiveAccounts(),
);
```

✅ **`reselect` used to select parts of state; selectors placed under object**

```typescript
/* === This repo: packages/accounts-controller/src/AccountsController.ts === */

import { createSelector } from 'reselect';

type AccountsControllerState = {
  accounts: Account[];
};

const selectAccounts = (state: AccountsControllerState) => state.accounts;

const selectActiveAccounts: createSelector(
  [selectAccounts],
  (accounts) => accounts.filter((account) => account.isActive),
);

const selectInactiveAccounts: createSelector(
  [selectAccounts],
  (accounts) => accounts.filter((account) => !account.isActive),
);

export const accountsControllerSelectors = {
  selectAccounts,
  selectActiveAccounts,
  selectInactiveAccounts,
};

export type AccountsControllerGetStateAction = ControllerGetStateAction<
  'AccountsController',
  AccountsControllerState,
>;

type AccountsControllerActions = AccountsControllerGetStateAccountAction;

export type AccountsControllerMessenger = Messenger<
  'AccountsController',
  AccountsControllerActions,
  AccountsControllerEvents,
>;

/* === This repo: packages/tokens-controller/src/TokensController.ts === */

import type {
  AccountsControllerGetStateAction,
} from '@metamask/accounts-controller';
import { accountsControllerSelectors } from '@metamask/accounts-controller';

type AllowedActions = AccountsControllerGetStateAction;

export type TokensControllerMessenger = Messenger<
  'TokensController',
  TokensControllerActions | AllowedActions,
  TokensControllerEvents
>;

class TokensController extends BaseController</* ... */> {
  constructor({
    messenger,
    // ...
  }: {
    messenger: TokensControllerMessenger,
    // ...
  }) {
    // ...
  }

  fetchTokens() {
    // Now TokensController can use the selector in combination with the state
    const tokensControllerState = this.messenger.call(
      'AccountsController:getState',
    );
    const accounts = accountsControllerSelectors.selectActiveAccounts(
      tokensControllerState,
    );
    const tokens = getTokens(accounts);
    // ... do something with tokens ...
  }
}

/* === Client repo: selectors.ts  === */

import { createSelector } from 'reselect';
import { accountsControllerSelectors } from '@metamask/accounts-controller';

const selectAccountsControllerState = (state) => {
  return state.engine.backgroundState.AccountsController;
};

// ⚠️  ... and this works too!
export const selectActiveAccounts = createSelector(
  selectAccountsControllerState,
  accountsControllerSelectors.selectActiveAccounts,
);
```

## Treat state-mutating methods as actions

Just as each property of state [does not require a getter method to be accessed](#expose-derived-state-using-selectors-instead-of-getters), each property of state does not require a setter method to be updated, either.

Methods that change the state of the controller do not need to represent granular, low-level operations such as adding, updating, or deleting a single property from state. Rather, they should be designed to support a higher-level task that the consumer wants to carry out. This is ultimately dictated by the needs of the client UI, and so they should also be given a name that reflects the behavior in the UI.

🚫 **`setAlertShown` is too low-level**

```typescript
class AlertsController extends BaseController</* ... */> {
  setAlertShown(alertId: string, isShown: boolean) {
    this.update((state) => {
      state[alertId].isShown = isShown;
    });
  }
}
```

✅ **An action is added for each distinct user interaction**

```typescript
class AlertsController extends BaseController</* ... */> {
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
