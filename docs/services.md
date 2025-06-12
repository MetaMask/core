# Data Services

## What is a data service?

A **data service** is a pattern for making interactions with an external API (fetching token prices, storing accounts, etc.). It is implemented as a plain TypeScript class with methods that are exposed through the messaging system.

## Why use this pattern?

If you want to talk to an API, it might be tempting to define a method in the controller or a function in a separate file. However, implementing the data service pattern is advantageous for the following reasons:

1. The pattern provides an abstraction that allows for implementing and reusing strategies that are common when working with external APIs, such as batching, automatic retries with exponential backoff, etc.
2. By integrating with the messaging system, other parts of the application can make use of the data service without needing to go through the controller, or in fact, without needing a reference to the data service at all.

## How to create a data service

Let's say that we want to make a data service that uses an API to retrieve gas prices. Here are the steps we'll follow:

1. We will define a class which has a single method. (Data service classes can have more than one method, but we will keep things simple for now.)
1. We will have our class take a messenger and a `fetch` function.
1. We will define a type for the messenger, exposing the method as an action.

### Implementation file

We'll start by making a new file in the `src/` directory, `gas-prices-service.ts`, and here we will define the data service class. We'll have the constructor take two arguments:

- A messenger (which we'll define below).
- A `fetch` function. This is useful so that we don't have to rely on a particular JavaScript runtime or environment where a global `fetch` function may not exist (or may be accessible using a different syntax).

``` typescript
export class GasPricesService {
  readonly #messenger: GasPricesServiceMessenger;

  readonly #fetch: typeof fetch;

  constructor({
    messenger,
    fetch: fetchFunction,
  }: {
    messenger: GasPricesServiceMessenger;
    fetch: typeof fetch;
  }) {
    this.#messenger = messenger;
    this.#fetch = fetchFunction;

    this.#messenger.registerActionHandler(
      `${SERVICE_NAME}:fetchGasPrices`,
      this.fetchGasPrices.bind(this),
    );
  }
}
```

We'll also add the single method that we mentioned above, using the given `fetch` option to make the request:

```typescript
// (top of file)

type GasPricesResponse = {
  data: {
    low: number;
    average: number;
    high: number;
  };
};

const API_BASE_URL = 'https://example.com/gas-prices';

export class GasPricesService {
  // ...

  async fetchGasPrices(chainId: Hex): Promise<GasPricesResponse> {
    const response = await this.#fetch(`${API_BASE_URL}/${chainId}`);
    // Type assertion: We have to assume the shape of the response data.
    const gasPricesResponse =
      (await response.json()) as unknown as GasPricesResponse;
    return gasPricesResponse.data;
  }
}
```

Next we'll define the messenger. We give the messenger a namespace, and we expose the method we added above as a messenger action:

``` typescript
// (top of file)

import type { RestrictedMessenger } from '@metamask/base-controller';

const SERVICE_NAME = 'GasPricesService';

export type GasPricesServiceFetchGasPricesAction = {
  type: `${typeof SERVICE_NAME}:fetchGasPrices`;
  handler: GasPricesService['fetchGasPrices'];
};

export type GasPricesServiceActions = GasPricesServiceFetchGasPricesAction;

type AllowedActions = never;

export type GasPricesServiceEvents = never;

type AllowedEvents = never;

export type GasPricesServiceMessenger = RestrictedMessenger<
  typeof SERVICE_NAME,
  GasPricesServiceActions | AllowedActions,
  GasPricesServiceEvents | AllowedEvents,
  AllowedActions['type'],
  AllowedEvents['type']
>;

// ...
```

Note that we need to add `@metamask/base-controller` as a direct dependency of the package to bring in the `RestrictedMessenger` type (here we assume that our package is called `@metamask/gas-prices-controller`):

``` shell
yarn workspace @metamask/gas-prices-controller add @metamask/base-controller
```

Finally we will register the method as an action handler on the messenger:

``` typescript
// ...

export class GasPricesService {
  readonly #messenger: GasPricesServiceMessenger;

  readonly #fetch: typeof fetch;

  constructor({
    messenger,
    fetch: fetchFunction,
  }: {
    messenger: GasPricesServiceMessenger;
    fetch: typeof fetch;
  }) {
    this.#messenger = messenger;
    this.#fetch = fetchFunction;

    // Note the action being registered here
    this.#messenger.registerActionHandler(
      `${SERVICE_NAME}:fetchGasPrices`,
      this.fetchGasPrices.bind(this),
    );
  }

  // ...
```

<details><summary><b>View whole file</b></summary><br />

``` typescript
import type { RestrictedMessenger } from '@metamask/base-controller';

const SERVICE_NAME = 'GasPricesService';

export type GasPricesServiceFetchGasPricesAction = {
  type: `${typeof SERVICE_NAME}:fetchGasPrices`;
  handler: GasPricesService['fetchGasPrices'];
};

export type GasPricesServiceActions = GasPricesServiceFetchGasPricesAction;

type AllowedActions = never;

export type GasPricesServiceEvents = never;

type AllowedEvents = never;

export type GasPricesServiceMessenger = RestrictedMessenger<
  typeof SERVICE_NAME,
  GasPricesServiceActions | AllowedActions,
  GasPricesServiceEvents | AllowedEvents,
  AllowedActions['type'],
  AllowedEvents['type']
>;

type GasPricesResponse = {
  data: {
    low: number;
    average: number;
    high: number;
  };
};

const API_BASE_URL = 'https://example.com/gas-prices';

export class GasPricesService {
  readonly #messenger: GasPricesServiceMessenger;

  readonly #fetch: typeof fetch;

  constructor({
    messenger,
    fetch: fetchFunction,
  }: {
    messenger: GasPricesServiceMessenger;
    fetch: typeof fetch;
  }) {
    this.#messenger = messenger;
    this.#fetch = fetchFunction;

    this.#messenger.registerActionHandler(
      `${SERVICE_NAME}:fetchGasPrices`,
      this.fetchGasPrices.bind(this),
    );
  }

  async fetchGasPrices(chainId: Hex): Promise<GasPricesResponse> {
    const response = await this.#fetch(`${API_BASE_URL}/${chainId}`);
    // Type assertion: We have to assume the shape of the response data.
    const gasPricesResponse =
      (await response.json()) as unknown as GasPricesResponse;
    return gasPricesResponse.data;
  }
}
```
</details>

Finally, we go into the `index.ts` for our package and we export the various parts of the data service module that consumers need. Note that we do _not_ export `AllowedActions` and `AllowedEvents`:

```typescript
export type {
  GasPricesServiceActions,
  GasPricesServiceEvents,
  GasPricesServiceFetchGasPricesAction,
  GasPricesServiceMessenger,
} from './gas-prices-service';
export { GasPricesService } from './gas-prices-service';
```

### Test file

Great, we've finished the implementation. Now let's write some tests.

We'll create a file `gas-prices-service.test.ts`, and we'll start by adding a test for the `fetchGasPrices` method. Note that we use `nock` to mock the request:

```typescript
import nock from 'nock';

import type { GasPricesServiceMessenger } from './gas-prices-service';
import { GasPricesService } from './gas-prices-service';

describe('GasPricesService', () => {
  describe('fetchGasPrices', () => {
    it('returns a slightly cleaned up version of what the API returns', async () => {
      nock('https://example.com/gas-prices')
        .get('/0x1.json')
        .reply(200, {
          data: {
            low: 5,
            average: 10,
            high: 15,
          },
        });
      const messenger = buildMessenger();
      const gasPricesService = new GasPricesService({ messenger, fetch });

      const gasPricesResponse = await gasPricesService.fetchGasPrices('0x1');

      expect(gasPricesResponse).toStrictEqual({
        low: 5,
        average: 10,
        high: 15,
      });
    });
  });
});
```

To make this work, we need to import the `Messenger` class from `@metamask/base-controller`. We also make a little helper to build a messenger:

``` typescript
import { Messenger } from '@metamask/base-controller';

// ...

function buildMessenger(): GasPricesServiceMessenger {
  return new Messenger().getRestricted({
    name: 'GasPricesService',
    allowedActions: [],
    allowedEvents: [],
  });
}
```

We're not done yet, though. The method isn't the only thing that consumers can use; they can also use the messenger action, so we need to make sure that works too:

```typescript
// ...

describe('GasPricesService', () => {
  // ...

  describe('GasPricesService:fetchGasPrices', () => {
    it('returns a slightly cleaned up version of what the API returns', async () => {
      nock('https://example.com/gas-prices')
        .get('/0x1.json')
        .reply(200, {
          data: {
            low: 5,
            average: 10,
            high: 15,
          },
        });
      const messenger = buildMessenger();
      const gasPricesService = new GasPricesService({ messenger, fetch });

      const gasPricesResponse = await gasPricesService.fetchGasPrices('0x1');

      expect(gasPricesResponse).toStrictEqual({
        low: 5,
        average: 10,
        high: 15,
      });
    });
  });
});

// ...
```

<details><summary><b>View whole file</b></summary><br />

``` typescript
import nock from 'nock';

import type { GasPricesServiceMessenger } from './gas-prices-service';
import { GasPricesService } from './gas-prices-service';

describe('GasPricesService', () => {
  describe('fetchGasPrices', () => {
    it('returns a slightly cleaned up version of what the API returns', async () => {
      nock('https://example.com/gas-prices')
        .get('/0x1.json')
        .reply(200, {
          data: {
            low: 5,
            average: 10,
            high: 15,
          },
        });
      const messenger = buildMessenger();
      const gasPricesService = new GasPricesService({ messenger, fetch });

      const gasPricesResponse = await gasPricesService.fetchGasPrices('0x1');

      expect(gasPricesResponse).toStrictEqual({
        low: 5,
        average: 10,
        high: 15,
      });
    });
  });

  describe('GasPricesService:fetchGasPrices', () => {
    it('returns a slightly cleaned up version of what the API returns', async () => {
      nock('https://example.com/gas-prices')
        .get('/0x1.json')
        .reply(200, {
          data: {
            low: 5,
            average: 10,
            high: 15,
          },
        });
      const messenger = buildMessenger();
      const gasPricesService = new GasPricesService({ messenger, fetch });

      const gasPricesResponse = await gasPricesService.fetchGasPrices('0x1');

      expect(gasPricesResponse).toStrictEqual({
        low: 5,
        average: 10,
        high: 15,
      });
    });
  });
});

function buildMessenger(): GasPricesServiceMessenger {
  return new Messenger().getRestricted({
    name: 'GasPricesService',
    allowedActions: [],
    allowedEvents: [],
  });
}
```
</details>

## How to use a data service

Let's say that we wanted to use our data service that we built above. To do this, we will instantiate the messenger for the data service — which itself relies on a global messenger — and then the data service itself.

First we need to import the data service:

```typescript
import { GasPricesService } from '@metamask/gas-prices-service';
```

Then we create a global messenger:

```typescript
const globalMessenger = new Messenger();
```

Then we create a messenger for the GasPricesService:

```typescript
const gasPricesServiceMessenger = globalMessenger.getRestricted({
  allowedActions: [],
  allowedEvents: [],
});
```

Now we instantiate the data service to register the action handler on the global messenger. We assume we have a global `fetch` function available:

```typescript
const gasPricesService = new GasPricesService({
  messenger: gasPricesServiceMessenger,
  fetch,
});
```

Great! Now that we've set up the data service and its messenger action, we can use it somewhere else.

Let's say we wanted to use it in a controller. We'd just need to allow that controller's messenger access to `GasPricesService:fetchGasPrices` by passing it via the `allowedActions` option.

This code would probably be in the controller package itself. For instance, if we had a file `packages/send-controller/send-controller.ts`, we might have:

```typescript
import { GasPricesServiceFetchGasPricesAction } from '@metamask/gas-prices-service';

type SendControllerActions = ...;

type AllowedActions = GasPricesServiceFetchGasPricesAction;

type SendControllerEvents = ...;

type AllowedEvents = ...;

type SendControllerMessenger = RestrictedMessenger<
  'SendController',
  SendControllerActions | AllowedActions,
  SendControllerEvents | AllowedEvents,
  AllowedActions['type'],
  AllowedEvents['type']
>;
```

Then, later on in our controller, we could say:

```typescript
class SendController extends BaseController {
  // ...

  await someMethodThatUsesGasPrices() {
    const gasPrices = await this.#messagingSystem.call(
      'GasPricesService:fetchGasPrices',
    );
    // ... use gasPrices somehow ...
  }
}
```

## Learning more

The [`sample-controllers`](../packages/sample-controllers) package has a full example of the service pattern, including JSDoc. Check it out and feel free to copy and paste the code you see to your own project.
