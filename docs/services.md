# Services

## What is a service?

A **service** is best used to wrap interactions with an external API, which might be used to sync accounts, retrieve information about NFTs, or manage feature flags.

## How to write a service

Let's say that we want to make a service that uses an API to retrieve gas prices. To do this, we will define a class which has a single method. We will then expose that method through a restricted messenger which will allow consuming code to use our service without needing direct access.

Assuming that we are within a package directory in the monorepo, e.g. `packages/gas-prices-service`, we would start by adding `@metamask/base-controller` as a direct dependency of the package:

```
yarn workspace @metamask/gas-prices-service add @metamask/base-controller
```

Then, making a new file in the `src/` directory, `gas-prices-service.ts`, we would import that package at the top of our file:

```typescript
import { RestrictedMessenger } from '@metamask/base-controller';
```

Next we'll define a type for the messenger. We'll first define the actions and events that our messenger shares and then all of the actions and events that it is allowed to access. Our service class will have a method called `fetchGasPrices`, so we only need one public action:

```typescript
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
```

Next we define the type of the response that the API will have:

```typescript
type GasPricesResponse = {
  data: {
    low: number;
    average: number;
    high: number;
  };
};
```

Finally we define the service class itself. We have the constructor take two arguments:

- The messenger that we defined above.
- A fetch function so that we don't have to rely on a particular JavaScript runtime or environment where a global `fetch` function may not exist (or may be accessible using a different syntax)

We also add the single method that we mentioned above, and we register it as an action handler on the messenger.

```typescript
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

Finally, we go into the `index.ts` for our package and we export the various parts of the service module that consumers need. Note that we do _not_ export `AllowedActions` and `AllowedEvents`:

```typescript
export type {
  GasPricesServiceActions,
  GasPricesServiceEvents,
  GasPricesServiceFetchGasPricesAction,
  GasPricesServiceMessenger,
} from './gas-prices-service';
export { GasPricesService } from './gas-prices-service';
```

Great, we've finished the implementation. Now let's write some tests. We'll create a file `gas-prices-service.test.ts`. Note:

- We pass in the global `fetch` (available in Node >= 18).
- We use `nock` to mock the request.
- We test not only the method but also the messenger action.
- We also add a function to help us build the messenger.

```typescript
import { Messenger } from '@metamask/base-controller';
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

And that's it!

## How to use a service

Let's say that we wanted to use our service that we built above. To do this, we will instantiate the messenger for the service — which itself relies on a global messenger — and then the service itself.

First we need to import the service:

```typescript
import { GasPricesService } from '@metamask/gas-prices-service';
```

Then we create a global messenger:

```typescript
const globalMessenger = new Messenger();
```

Then we create a messenger restricted to the actions and events GasPricesService exposes. In this case we don't need to specify anything for `allowedActions` and `allowedEvents` because the messenger does not need actions or events from any other messengers:

```typescript
const gasPricesServiceMessenger = globalMessenger.getRestricted({
  allowedActions: [],
  allowedEvents: [],
});
```

Now we instantiate the service to register the action handler on the global messenger. We assume we have a global `fetch` function available:

```typescript
const gasPricesService = new GasPricesService({
  messenger: gasPricesServiceMessenger,
  fetch,
});
```

Great! Now that we've set up the service and its messenger action, we can use it somewhere else.

Let's say we had a controller and we wanted to use it there. All we'd need to do is define that controller's messenger type to allow access to `GasPricesService:fetchGasPrices`. This code would probably be the controller package itself. For instance if we had a file `packages/send-controller/send-controller.ts`, we might have:

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
const gasPrices = await this.#messagingSystem.call(
  'GasPricesService:fetchGasPrices',
);
// ... use gasPrices somehow ...
```

## Learning more

The [`sample-controllers`](../packages/sample-controllers) package has a full example of the service pattern, including JSDoc. Check it out and feel free to copy and paste the code you see to your own project.
