# `@metamask/controllers`

A collection of platform-agnostic modules for creating secure data models for cryptocurrency wallets.

## Table of Contents

- [Usage](#usage)
- [Modules](#modules)
- [Concepts](#concepts)
  - [Initialization](#initialization)
  - [Configuration](#configuration)
  - [State management](#state-management)
  - [Subscription](#subscription)
  - [Composition](#composition)
- [Linking](#linking-during-development)
- [API documentation](#api-documentation)
- [License](#license)

## Usage

First, install the package.

```sh
yarn add @metamask/controllers
```

Then, compose stores to create a data model.

```js
import {
  ComposableController,
  NetworkController,
  TokenRatesController,
} from '@metamask/controllers';

const datamodel = new ComposableController([
  new NetworkController(),
  new TokenRatesController()
]);

datamodel.subscribe((state) => {/* data model has changed */});
```

## Modules

`@metamask/controllers` consists of a collection of controller modules that each expose uniform APIs for common operations like configuration, state management, and subscription.

### AccountTrackerController

```ts
import AccountTrackerController from '@metamask/controllers';
```

The AccountTrackerController tracks information associated with specific Ethereum accounts.

### AddressBookController

```ts
import AddressBookController from '@metamask/controllers';
```

The AddressBookController exposes functions for managing a list of recipient addresses and associated nicknames.

### ComposableController

```ts
import ComposableController from '@metamask/controllers';
```

The ComposableController can be used to compose multiple controllers together into a single controller.

### CurrencyRateController

```ts
import CurrencyRateController from '@metamask/controllers';
```

The CurrencyRateController passively polls for an ETH-to-fiat exchange rate based on a chosen currency.

### KeyringController

```ts
import KeyringController from '@metamask/controllers';
```

The KeyringController is responsible for establishing and managing Ethereum address-based identities.

### NetworkController

```ts
import NetworkController from '@metamask/controllers';
```

The NetworkController is responsible for creating an underlying provider and for refreshing its configuration.

### PhishingController

```ts
import PhishingController from '@metamask/controllers';
```

The PhishingController passively polls for community-maintained lists of approved and unapproved website origins.

### PreferencesController

```ts
import PreferencesController from '@metamask/controllers';
```

The PreferencesController manages agnostic global settings and exposes convenience methods for updating them.

### TokenRatesController

```ts
import TokenRatesController from '@metamask/controllers';
```

The TokenRatesController passively polls on a set interval for token-to-fiat exchange rates.

### TransactionController

```ts
import TransactionController from '@metamask/controllers';
```

The TransactionController is responsible for submitting and managing transactions.

### util

```ts
import util from '@metamask/controllers';
```

The util module exposes a set of utility functions for common operations like gas estimation and generating crypto-buying URLs.

## Concepts

Using controllers should be straightforward since each controller exposes the same minimal API. The concepts detailed in this section form the entirety of the core API: knowing these concepts will allow you to fully use `@metamask/controllers` to build wallet data models.

### Initialization

Each controller can be initialized with an optional initial configuration argument and an optional initial state argument:

```ts
const controller = new Controller(<initial_config>, <initial_state>)
```

Data passed into a controller as initial state will be merged with that controller's default state; likewise, options passed into a controller as initial configuration will be merged with that controller's default configuration.

### Configuration

As mentioned in the [initialization section](#initialization), a controller can be configured during initialization by passing in a configuration object as its first argument:

```ts
const controller = new Controller(<initial_config>, <initial_state>)
```

A controller can also be configured (or reconfigured) after initialization by passing a configuration object to its `configure` method:

```ts
const controller = new Controller()
controller.configure({ foo: 'bar', baz: 'qux' });
```

Regardless of how a controller is configured, whether it's during or after initialization, configuration options can always be accessed on a controller as instance variables for convenience:

```ts
const controller = new Controller()
controller.configure({ foo: 'bar', baz: 'qux' });
console.log(controller.foo, controller.baz); // "bar qux"
```

### State management

The core purpose of every controller is to maintain an internal data object called "state". Modules are like data stores: their internal state data can be updated directly by modifying the data itself or indirectly by calling API methods that in turn modify the data.

A controller's state can be directly modified by calling its `update` method and passing in a new data object. By default, this data object will be merged with the controller's existing internal state; however, if the data object should overwrite the controller's internal state, a second argument of `true` can be passed to the `update` method:

```ts
const controller = new Controller();
controller.update({ foo: 'bar' }); // merge with existing state
controller.update({ foo: 'bar' }, true); // overwrite existing state
```

A controller's state can be indirectly modified by calling any state-modifying API methods it may expose. For example, the AddressBookController exposes a `set` method that accepts a new address to save and an associated nickname; calling this method will internally update its `state.addressBook` array.

A controller's state can always be accessed by referencing the `state` instance variable for convenience:

```ts
const controller = new Controller();
console.log(controller.state); // { ... }
```

### Subscription

Since each controller maintains an internal state object, there should be a way to add listeners to be notified when state data changes. controllers expose two methods for subscription management, `subscribe` and `unsubscribe`.

Change handlers can be registered with a controller by passing a function to its `subscribe` method. This function will be called anytime the controller's underlying state changes and will be passed the current state as its only function argument:

```ts
function onChange(state) { /* state data changed */ }
const controller = new Controller();
controller.subscribe(onChange);
```

Change handlers can be removed from a controller by passing a function to its `unsubscribe` method. Any function passed to `unsubscribe` will be removed from the internal list of handlers and will no longer be called when state data changes:

```ts
function onChange(state) { /* state data changed */ }
const controller = new Controller();
controller.subscribe(onChange);
// ...
controller.unsubscribe(onChange);
```

### Composition

Because each controller maintains its own state and subscriptions, it would be tedious to initialize and subscribe to every available controller independently. To solve this issue, the ComposableController can be used to compose multiple controllers into a single controller.

The ComposableController is initialized by passing an array of controller instances:

```ts
import {
  ComposableController,
  NetworkController,
  TokenRatesController
} from '@metamask/controllers';

const datamodel = new ComposableController([
  new NetworkController(),
  new TokenRatesController()
]);
```

The resulting composed controller exposes the same APIs as every other controller for configuration, state management, and subscription:

```ts
datamodel.subscribe((state) => { /* some child state has changed */ });
```

The internal state maintained by a ComposableController will be keyed by child controller class name. It's also possible to access the `flatState` instance variable that is a convenience accessor for merged child state:

```ts
console.log(datamodel.state); // {NetworkController: {...}, TokenRatesController: {...}}
console.log(datamodel.flatState); // {infura: {...}, contractExchangeRates: [...]}
```

**Advanced Note:** The ComposableController builds a map of all child controllers keyed by controller name. This object is cached as a `context` instance variable on both the ComposableController itself as well as all child controllers. This means that child controllers can call methods on other sibling controllers through the `context` variable, e.g. `this.context.SomeController.someMethod()`.

## Linking during development

Linking `@metamask/controllers` into other projects involves a special NPM command to ensure that dependencies are not duplicated. This is because `@metamask/controllers` ships modules that are transpiled but not bundled, and [NPM does not deduplicate](https://github.com/npm/npm/issues/7742) linked dependency trees.

First, link `@metamask/controllers`.

```sh
$ yarn build:link
# or
$ npm run build:link
```

Then, link into other projects.

```sh
$ yarn link @metamask/controllers
# or
$ npm link @metamask/controllers
```

## Release & Publishing

The project follows the same release process as the other libraries in the MetaMask organization:

1. Create a release branch
    - For a typical release, this would be based on `master`
    - To update an older maintained major version, base the release branch on the major version branch (e.g. `1.x`)
2. Update the changelog
3. Update version in package.json file (e.g. `yarn version --minor --no-git-tag-version`)
4. Create a pull request targeting the base branch (e.g. master or 1.x)
5. Code review and QA
6. Once approved, the PR is squashed & merged
7. The commit on the base branch is tagged
8. The tag can be published as needed

## API documentation

API documentation is auto-generated for the `@metamask/controllers` package on every commit to the `master` branch.

[View API documentation](https://metamask.github.io/@metamask/controllers/)

## License

[MIT](./LICENSE)
