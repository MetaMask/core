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
  new TokenRatesController(),
]);

datamodel.subscribe((state) => {
  /* data model has changed */
});
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
const controller = new Controller();
controller.configure({ foo: 'bar', baz: 'qux' });
```

Regardless of how a controller is configured, whether it's during or after initialization, configuration options can always be accessed on a controller as instance variables for convenience:

```ts
const controller = new Controller();
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
function onChange(state) {
  /* state data changed */
}
const controller = new Controller();
controller.subscribe(onChange);
```

Change handlers can be removed from a controller by passing a function to its `unsubscribe` method. Any function passed to `unsubscribe` will be removed from the internal list of handlers and will no longer be called when state data changes:

```ts
function onChange(state) {
  /* state data changed */
}
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
  TokenRatesController,
} from '@metamask/controllers';

const datamodel = new ComposableController([
  new NetworkController(),
  new TokenRatesController(),
]);
```

The resulting composed controller exposes the same APIs as every other controller for configuration, state management, and subscription:

```ts
datamodel.subscribe((state) => {
  /* some child state has changed */
});
```

The internal state maintained by a ComposableController will be keyed by child controller class name. It's also possible to access the `flatState` instance variable that is a convenience accessor for merged child state:

```ts
console.log(datamodel.state); // {NetworkController: {...}, TokenRatesController: {...}}
console.log(datamodel.flatState); // {infura: {...}, contractExchangeRates: [...]}
```

## Contributing

### Setup

- Install [Node.js](https://nodejs.org) version 12
  - If you are using [nvm](https://github.com/creationix/nvm#installation) (recommended) running `nvm use` will automatically choose the right node version for you.
- Install [Yarn v3](https://yarnpkg.com/getting-started/install)
- Run `yarn install` to install dependencies and run any required post-install scripts

### Testing and Linting

Run `yarn test` to run the tests once. To run tests on file changes, run `yarn test:watch`.

Run `yarn lint` to run the linter, or run `yarn lint:fix` to run the linter and fix any automatically fixable issues.

### Linking During Development

Linking `@metamask/controllers` into other projects involves a special NPM command to ensure that dependencies are not duplicated. This is because `@metamask/controllers` ships modules that are transpiled but not bundled, and [NPM does not deduplicate](https://github.com/npm/npm/issues/7742) linked dependency trees.

First, `yarn build:link` in this repository, then link `@metamask/controllers` by running `yarn link` in the consumer repository.

### Release & Publishing

The project follows the same release process as the other libraries in the MetaMask organization. The GitHub Actions [`action-create-release-pr`](https://github.com/MetaMask/action-create-release-pr) and [`action-publish-release`](https://github.com/MetaMask/action-publish-release) are used to automate the release process; see those repositories for more information about how they work.

1. Choose a release version.

   - The release version should be chosen according to SemVer. Analyze the changes to see whether they include any breaking changes, new features, or deprecations, then choose the appropriate SemVer version. See [the SemVer specification](https://semver.org/) for more information.

2. If this release is backporting changes onto a previous release, then ensure there is a major version branch for that version (e.g. `1.x` for a `v1` backport release).

   - The major version branch should be set to the most recent release with that major version. For example, when backporting a `v1.0.2` release, you'd want to ensure there was a `1.x` branch that was set to the `v1.0.1` tag.

3. Trigger the [`workflow_dispatch`](https://docs.github.com/en/actions/reference/events-that-trigger-workflows#workflow_dispatch) event [manually](https://docs.github.com/en/actions/managing-workflow-runs/manually-running-a-workflow) for the `Create Release Pull Request` action to create the release PR.

   - For a backport release, the base branch should be the major version branch that you ensured existed in step 2. For a normal release, the base branch should be the main branch for that repository (which should be the default value).
   - This should trigger the [`action-create-release-pr`](https://github.com/MetaMask/action-create-release-pr) workflow to create the release PR.

4. Update the changelog to move each change entry into the appropriate change category ([See here](https://keepachangelog.com/en/1.0.0/#types) for the full list of change categories, and the correct ordering), and edit them to be more easily understood by users of the package.

   - Generally any changes that don't affect consumers of the package (e.g. lockfile changes or development environment changes) are omitted. Exceptions may be made for changes that might be of interest despite not having an effect upon the published package (e.g. major test improvements, security improvements, improved documentation, etc.).
   - Try to explain each change in terms that users of the package would understand (e.g. avoid referencing internal variables/concepts).
   - Consolidate related changes into one change entry if it makes it easier to explain.
   - Run `yarn auto-changelog validate --rc` to check that the changelog is correctly formatted.

5. Review and QA the release.

   - If changes are made to the base branch, the release branch will need to be updated with these changes and review/QA will need to restart again. As such, it's probably best to avoid merging other PRs into the base branch while review is underway.

6. Squash & Merge the release.

   - This should trigger the [`action-publish-release`](https://github.com/MetaMask/action-publish-release) workflow to tag the final release commit and publish the release on GitHub.

7. Publish the release on npm.

   - Wait for the `publish-release` GitHub Action workflow to finish. This should trigger a second job (`publish-npm`), which will wait for a run approval by the [`npm publishers`](https://github.com/orgs/MetaMask/teams/npm-publishers) team.
   - Approve the `publish-npm` job (or ask somebody on the npm publishers team to approve it for you).
   - Once the `publish-npm` job has finished, check npm to verify that it has been published.
