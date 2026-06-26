import { BaseDataService } from '@metamask/base-data-service';
import type {
  DataServiceCacheUpdatedEvent,
  DataServiceGranularCacheUpdatedEvent,
  DataServiceInvalidateQueriesAction,
} from '@metamask/base-data-service';
import type { CreateServicePolicyOptions } from '@metamask/controller-utils';
import { HttpError, fromHex } from '@metamask/controller-utils';
import type { Messenger } from '@metamask/messenger';
import type { Infer } from '@metamask/superstruct';
import { is, number, type } from '@metamask/superstruct';
import type { Hex } from '@metamask/utils';
import type { QueryClientConfig } from '@tanstack/query-core';

import type { SampleGasPricesServiceMethodActions } from './sample-gas-prices-service-method-action-types';

// === GENERAL ===

/**
 * The name of the {@link SampleGasPricesService}, used to namespace the
 * service's actions and events.
 */
export const serviceName = 'SampleGasPricesService';

// === MESSENGER ===

/**
 * All of the methods within {@link SampleGasPricesService} that are exposed via
 * the messenger.
 */
const MESSENGER_EXPOSED_METHODS = ['fetchGasPrices'] as const;

/**
 * Invalidates cached queries for {@link SampleGasPricesService}.
 */
export type SampleGasPricesServiceInvalidateQueriesAction =
  DataServiceInvalidateQueriesAction<typeof serviceName>;

/**
 * Actions that {@link SampleGasPricesService} exposes to other consumers.
 */
export type SampleGasPricesServiceActions =
  | SampleGasPricesServiceMethodActions
  | SampleGasPricesServiceInvalidateQueriesAction;

/**
 * Actions from other messengers that {@link SampleGasPricesService} calls.
 */
type AllowedActions = never;

/**
 * Published when {@link SampleGasPricesService}'s cache is updated.
 */
export type SampleGasPricesServiceCacheUpdatedEvent =
  DataServiceCacheUpdatedEvent<typeof serviceName>;

/**
 * Published when a key within {@link SampleGasPricesService}'s cache is
 * updated.
 */
export type SampleGasPricesServiceGranularCacheUpdatedEvent =
  DataServiceGranularCacheUpdatedEvent<typeof serviceName>;

/**
 * Events that {@link SampleGasPricesService} exposes to other consumers.
 */
export type SampleGasPricesServiceEvents =
  | SampleGasPricesServiceCacheUpdatedEvent
  | SampleGasPricesServiceGranularCacheUpdatedEvent;

/**
 * Events from other messengers that {@link SampleGasPricesService} subscribes
 * to.
 */
type AllowedEvents = never;

/**
 * The messenger which is restricted to actions and events accessed by
 * {@link SampleGasPricesService}.
 */
export type SampleGasPricesServiceMessenger = Messenger<
  typeof serviceName,
  SampleGasPricesServiceActions | AllowedActions,
  SampleGasPricesServiceEvents | AllowedEvents
>;

// === SERVICE DEFINITION ===

/**
 * Struct to validate what the API endpoint returns.
 */
const GasPricesResponseStruct = type({
  data: type({
    low: number(),
    average: number(),
    high: number(),
  }),
});

/**
 * What the API endpoint returns.
 */
type GasPricesResponse = Infer<typeof GasPricesResponseStruct>;

/**
 * The base URL of the API that the service represents.
 */
const BASE_URL = 'https://api.example.com';

/**
 * This service object is responsible for fetching gas prices via an API.
 *
 * @example
 *
 * ``` ts
 * import type { MessengerActions, MessengerEvents } from '@metamask/messenger';
 * import { Messenger } from '@metamask/messenger';
 * import type {
 *   SampleGasPricesServiceMessenger,
 * } from '@metamask/sample-controllers';
 *
 * const rootMessenger = new Messenger<
 *   'Root',
 *   SampleGasPricesServiceActions
 *   SampleGasPricesServiceEvents
 * >({ namespace: 'Root' });
 * const gasPricesServiceMessenger = new Messenger<
 *   'SampleGasPricesService',
 *   MessengerActions<SampleGasPricesServiceMessenger>,
 *   MessengerEvents<SampleGasPricesServiceMessenger>,
 *   typeof rootMessenger,
 * >({
 *   namespace: 'SampleGasPricesService',
 *   parent: rootMessenger,
 * });
 * // Instantiate the service to register its actions on the messenger
 * new SampleGasPricesService({
 *   messenger: gasPricesServiceMessenger,
 * });
 *
 * // Later...
 * // Fetch gas prices for Mainnet
 * const gasPrices = await rootMessenger.call(
 *   'SampleGasPricesService:fetchGasPrices',
 *   '0x1',
 * );
 * // ... Do something with the gas prices ...
 * ```
 */
export class SampleGasPricesService extends BaseDataService<
  typeof serviceName,
  SampleGasPricesServiceMessenger
> {
  /**
   * Constructs a new SampleGasPricesService object.
   *
   * @param args - The constructor arguments.
   * @param args.messenger - The messenger suited for this service.
   * @param args.queryClientConfig - Configuration for the underlying TanStack
   * Query client.
   * @param args.policyOptions - Options to pass to `createServicePolicy`, which
   * is used to wrap each request. See {@link CreateServicePolicyOptions}.
   */
  constructor({
    messenger,
    queryClientConfig = {},
    policyOptions = {},
  }: {
    messenger: SampleGasPricesServiceMessenger;
    queryClientConfig?: QueryClientConfig;
    policyOptions?: CreateServicePolicyOptions;
  }) {
    super({
      name: serviceName,
      messenger,
      queryClientConfig,
      policyOptions,
    });

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Makes a request to the API in order to retrieve gas prices for a particular
   * chain.
   *
   * @param chainId - The chain ID for which you want to fetch gas prices.
   * @returns The gas prices for the given chain.
   */
  async fetchGasPrices(chainId: Hex): Promise<GasPricesResponse['data']> {
    const url = new URL('/gas-prices', BASE_URL);
    url.searchParams.append('chainId', `eip155:${fromHex(chainId).toString()}`);

    const jsonResponse = await this.fetchQuery({
      queryKey: [`${this.name}:fetchGasPrices`, chainId],
      queryFn: async () => {
        const response = await fetch(url);

        if (!response.ok) {
          throw new HttpError(
            response.status,
            `Gas prices API failed with status '${response.status}'`,
          );
        }

        return response.json();
      },
    });

    if (!is(jsonResponse, GasPricesResponseStruct)) {
      throw new Error('Malformed response received from gas prices API');
    }

    return jsonResponse.data;
  }
}
