# Data Services Pattern

## Introduction

Inspired by the recent adoption of `@tanstack/react-query` in the MetaMask clients we introduce an expansion of the current controller and services pattern, a **strongly recommended approach** for building data services going forward. It mainly consists of a base class `BaseDataService`, much like `BaseController` which provides a standardized way of fetching data with built-in request de-duplication, synchronized caching between multiple processes, extensive retry configuration, cache-invalidation etc.

The data service base class directly integrates with the existing messenger API, making fetched data readily available to all controllers. But in addition, it also makes the data easily available in the UI without the need for additional controller state. This is accomplished with utility hooks from `@metamask/react-data-query` .

The base class provides the extending class with data fetching methods called `fetchQuery` and `fetchInfiniteQuery` which are slightly type-narrowed but familiar versions of the implementations from `@tanstack/query-core` . These provide the service with a standardized approach to fetching that has optional configurability through passing options like `staleTime`.

Additional service configuration is also available via the constructor arguments `policyOptions` (for retry policy, circuit breaker, etc) and `queryClientOptions` (shared configuration for all queries exposed by the service). Each data service essentially gets its own `QueryClient` .

Query keys should follow the following format: `["ServiceName:getSomething", ...arguments]`.

## Usage

Much like creating a controller, creating a data service is as simple as creating a class that extends `BaseDataService` and declaring the required messenger types for the actions and events that the service wants to expose (we recommend using `generate-method-action-types`). A few actions and events are made available by the base class which are used to facilitate the cache/data synchronization.

The following is a shortened example of what defining a data service would look like:

### Example Data Service

```tsx
export class ExampleDataService extends BaseDataService<
  typeof serviceName,
  ExampleMessenger
> {
  readonly #tokensBaseUrl = 'https://tokens.api.cx.metamask.io';

  constructor(messenger: ExampleMessenger) {
    super({
      name: serviceName,
      messenger,
      policyOptions: {
        maxRetries: 2,
        maxConsecutiveFailures: 3,
        backoff: new ConstantBackoff(0),
      },
      persistenceConfig: { maxAge: inMilliseconds(1, Duration.Day) },
    });

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  async getAssets(assets: string[]): Promise<GetAssetsResponse> {
    return this.fetchQuery({
      queryKey: [`${this.name}:getAssets`, assets],
      queryFn: async () => {
        const url = new URL(
          `${this.#tokensBaseUrl}/v3/assets?assetIds=${assets.join(',')}`,
        );

        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(`Query failed with status code: ${response.status}.`);
        }

        return response.json();
      },
      staleTime: inMilliseconds(1, Duration.Day),
    });
  }
}
```

For full examples, including messenger types and pagination, see the following:

- ExampleDataService: https://github.com/MetaMask/core/blob/main/packages/base-data-service/tests/ExampleDataService.ts#L63
- SampleGasPricesService: https://github.com/MetaMask/core/tree/main/packages/sample-controllers/src/sample-gas-prices-service

When a data service [is registered in the client](https://github.com/MetaMask/metamask-extension/blob/94d0a5575c97f3ec35b0d172eafb6622ae87ad42/shared/constants/data-services.ts) and has its queries exposed via the messenger API they can be trivially accessed from the UI via a custom hook and the query format mentioned above like so:

### UI integration

```tsx
import { useQuery } from '@metamask/react-data-query';

export const MyComponent = () => {
  const queryKey = [
    'ExampleDataService:getAssets',
    [
      'eip155:1/slip44:60',
      'bip122:000000000019d6689c085ae165831e93/slip44:0',
      'eip155:1/erc20:0x6b175474e89094c44da98b954eedeac495271d0f',
    ],
  ];

  const { isLoading, isError, data } = useQuery({
    queryKey,
  });

  if (isLoading) {
    return <Spinner />;
  }

  if (isError) {
    return (
      <Box>
        <Text>An error occurred.</Text>
      </Box>
    );
  }

  return (
    <Box>
      {data.map((asset) => (
        <Text key={asset.assetId}>{asset.name}</Text>
      ))}
    </Box>
  );
};
```

## You can use it right now!

**All of the above is available on both extension and mobile as of March 27th, 2026, and can be adopted right away.** It is fully backwards compatible with any existing queries already written, though we would strongly recommend that these existing queries are eventually migrated to the data service pattern.

Additional documentation for TanStack Query is available here: https://tanstack.com/query/v4/docs/framework/react/overview. Keep in mind that we are using **v4** for now.

## NEW: Persistence

As of August 11th, 2026, the `BaseDataService` now supports persisting the query cache. This can be used for long-lived caches that need to persist between sessions of using MetaMask. To use it, simply configure `persistenceConfig` as part of the `BaseDataService` constructor and ensure that your service has access to the following messenger actions: `StorageService:setItem` , `StorageService:getItem` & `StorageService:removeItem` . To load the persisted cache, the client must call the `init` function on your service at some point during initialization for rehydration purposes. The storing of the cache is handled automatically. If you are using `@metamask/wallet`, the `init` function is already called automatically and you don’t need to follow additional steps. The persistence behaviour can be tuned per-service with the options in `persistenceConfig` .

## NEW: Schema-based validation

For validation purposes, both `fetchQuery` and `fetchInfiniteQuery` has been extended with a custom `responseStruct` field. If defined, every query response will be validated against the struct automatically and the query response types will be narrowed accordingly. If the response does not match the struct, the query function will throw and the query will switch over to an error state.

If you have any questions, comments, suggestions, concerns or other feedback. Feel free to reach out to the Core Platform team.
