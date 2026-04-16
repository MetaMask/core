import { BaseDataService } from '@metamask/base-data-service';
import type {
  DataServiceCacheUpdatedEvent,
  DataServiceGranularCacheUpdatedEvent,
  DataServiceInvalidateQueriesAction,
  QueryKey,
} from '@metamask/base-data-service';
import type { CreateServicePolicyOptions } from '@metamask/controller-utils';
import { HttpError } from '@metamask/controller-utils';
import type { Messenger } from '@metamask/messenger';
import type { Infer } from '@metamask/superstruct';
import {
  array,
  is,
  number,
  optional,
  tuple,
  type,
} from '@metamask/superstruct';
import { Duration, inMilliseconds } from '@metamask/utils';
import type { QueryClientConfig } from '@tanstack/query-core';

import type { PriceApiServiceMethodActions } from './price-api-service-method-action-types';

// === GENERAL ===

/**
 * The name of the {@link PriceApiService}, used to namespace the
 * service's actions and events.
 */
export const serviceName = 'PriceApiService';

// === MESSENGER ===

/**
 * All of the methods within {@link PriceApiService} that are exposed via
 * the messenger.
 */
const MESSENGER_EXPOSED_METHODS = ['fetchHistoricalPricesV3'] as const;

/**
 * Invalidates cached queries for {@link PriceApiService}.
 */
export type PriceApiServiceInvalidateQueriesAction =
  DataServiceInvalidateQueriesAction<typeof serviceName>;

/**
 * Actions that {@link PriceApiService} exposes to other consumers.
 */
export type PriceApiServiceActions =
  | PriceApiServiceMethodActions
  | PriceApiServiceInvalidateQueriesAction;

/**
 * Actions from other messengers that {@link PriceApiService} calls.
 */
type AllowedActions = never;

/**
 * Published when {@link PriceApiService}'s cache is updated.
 */
export type PriceApiServiceCacheUpdatedEvent = DataServiceCacheUpdatedEvent<
  typeof serviceName
>;

/**
 * Published when a key within {@link PriceApiService}'s cache is
 * updated.
 */
export type PriceApiServiceGranularCacheUpdatedEvent =
  DataServiceGranularCacheUpdatedEvent<typeof serviceName>;

/**
 * Events that {@link PriceApiService} exposes to other consumers.
 */
export type PriceApiServiceEvents =
  | PriceApiServiceCacheUpdatedEvent
  | PriceApiServiceGranularCacheUpdatedEvent;

/**
 * Events from other messengers that {@link PriceApiService} subscribes
 * to.
 */
type AllowedEvents = never;

/**
 * The messenger which is restricted to actions and events accessed by
 * {@link PriceApiService}.
 */
export type PriceApiServiceMessenger = Messenger<
  typeof serviceName,
  PriceApiServiceActions | AllowedActions,
  PriceApiServiceEvents | AllowedEvents
>;

// === SERVICE DEFINITION ===

/**
 * Struct to validate what the API endpoint returns.
 */
const HistoricalPricesV3ResponseStruct = type({
  prices: array(tuple([number(), number()])),
  marketCaps: optional(array(tuple([number(), number()]))),
  totalVolumes: optional(array(tuple([number(), number()]))),
});

/**
 * What the API endpoint returns.
 */
type HistoricalPricesV3Response = Infer<
  typeof HistoricalPricesV3ResponseStruct
>;

/**
 * The base URL of the API that the service represents.
 */
const BASE_URL = 'https://price.api.cx.metamask.io';

/**
 * Supported currencies for the Price API.
 */
export type SupportedCurrency =
  // Crypto
  | 'btc'
  | 'eth'
  | 'ltc'
  | 'bch'
  | 'bnb'
  | 'eos'
  | 'xrp'
  | 'xlm'
  | 'link'
  | 'dot'
  | 'yfi'
  // Fiat
  | 'usd'
  | 'aed'
  | 'ars'
  | 'aud'
  | 'bdt'
  | 'bhd'
  | 'bmd'
  | 'brl'
  | 'cad'
  | 'chf'
  | 'clp'
  | 'cny'
  | 'czk'
  | 'dkk'
  | 'eur'
  | 'gbp'
  | 'gel'
  | 'hkd'
  | 'huf'
  | 'idr'
  | 'ils'
  | 'inr'
  | 'jpy'
  | 'krw'
  | 'kwd'
  | 'lkr'
  | 'mmk'
  | 'mxn'
  | 'myr'
  | 'ngn'
  | 'nok'
  | 'nzd'
  | 'php'
  | 'pkr'
  | 'pln'
  | 'rub'
  | 'sar'
  | 'sek'
  | 'sgd'
  | 'thb'
  | 'try'
  | 'twd'
  | 'uah'
  | 'vef'
  | 'vnd'
  | 'zar';

/**
 * This service class wraps the Price API.
 *
 * @example
 *
 * ``` ts
 * // === Setup ===
 *
 * import type { MessengerActions, MessengerEvents } from '@metamask/messenger';
 * import { Messenger } from '@metamask/messenger';
 * import type {
 *   PriceApiServiceMessenger,
 * } from '@metamask/price-api';
 *
 * const rootMessenger = new Messenger<
 *   'Root',
 *   PriceApiServiceActions
 *   PriceApiServiceEvents
 * >({ namespace: 'Root' });
 * const priceApiServiceMessenger = new Messenger<
 *   'PriceApiService',
 *   MessengerActions<PriceApiServiceMessenger>,
 *   MessengerEvents<PriceApiServiceMessenger>,
 *   typeof rootMessenger,
 * >({
 *   namespace: 'PriceApiService',
 *   parent: rootMessenger,
 * });
 * // Instantiate the service to register its actions on the messenger
 * new PriceApiService({
 *   messenger: priceApiServiceMessenger,
 * });
 *
 * // ... Later ...
 *
 * // Fetch the past week's prices on Mainnet for ETH, in USD
 * const historicalPrices = await rootMessenger.call(
 *   'PriceApiService:fetchHistoricalPricesV3',
 *   params: {
 *     chainId: 'eip155:1',
 *     assetType: 'slip44:60',
 *   },
 *   options: {
 *     currency: 'usd',
 *     timePeriod: '7d'
 *   },
 * );
 *
 * // The same thing, only using React Query
 *
 * import { useQuery } from '@metamask/react-data-query';
 *
 * const { data, isFetching } = useQuery({
 *   queryKey: [
 *     'PriceApiService:fetchHistoricalPricesV3' as const,
 *     {
 *       params: {
 *         chainId: 'eip155:1',
 *         assetType: 'slip44:60',
 *       },
 *       options: {
 *         currency: 'usd',
 *         timePeriod: '7d',
 *       },
 *     },
 *   ],
 * });
 * ```
 */
export class PriceApiService extends BaseDataService<
  typeof serviceName,
  PriceApiServiceMessenger
> {
  /**
   * Constructs a new PriceApiService object.
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
    messenger: PriceApiServiceMessenger;
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
   * Get historical prices by CAIP-19 asset ID (v3 endpoint).
   *
   * @param args - The arguments to this function.
   * @param args.params - Essential request parameters. Usually `{ chainId,
   * assetType }` where `chainId` is the CAIP-2 chain ID and `assetType` is the
   * asset type portion of CAIP-19. May also be `null` to "disable" the query.
   * @param args.options - Optional request parameters.
   * @param args.options.currency - The currency for prices.
   * @param args.options.timePeriod - The time period.
   * @param args.options.from - Start timestamp.
   * @param args.options.to - End timestamp.
   * @param args.options.interval - Data interval.
   * @returns The historical prices response.
   */
  async fetchHistoricalPricesV3({
    params = {},
    options: { currency, timePeriod, from, to, interval } = {},
  }: {
    params: {
      chainId?: string;
      assetType?: string;
    } | null;
    options?: {
      currency?: SupportedCurrency;
      timePeriod?: string;
      from?: number;
      to?: number;
      interval?: '5m' | 'hourly' | 'daily';
    };
  }): Promise<HistoricalPricesV3Response> {
    let url: URL;
    if (params) {
      url = new URL(
        `/v3/historical-prices/${params.chainId}/${params.assetType}`,
        BASE_URL,
      );
      if (currency) {
        url.searchParams.append('vsCurrency', currency);
      }
      if (timePeriod) {
        url.searchParams.append('timePeriod', timePeriod);
      }
      if (from) {
        url.searchParams.append('from', from.toString());
      }
      if (to) {
        url.searchParams.append('to', to.toString());
      }
      if (interval) {
        url.searchParams.append('to', interval);
      }
    }

    const queryKey: QueryKey = [`${this.name}:fetchHistoricalPricesV3`];
    if (params) {
      queryKey.push(params);
    } else {
      queryKey.push('disabled');
    }
    const jsonResponse = await this.fetchQuery({
      queryKey,
      queryFn: async ({ signal }) => {
        if (url) {
          const response = await fetch(url, { signal });

          if (!response.ok) {
            throw new HttpError(
              response.status,
              `Price API failed with status '${response.status}'`,
            );
          }

          return response.json();
        }

        return { prices: [] };
      },
      staleTime: inMilliseconds(30, Duration.Second),
    });

    if (!is(jsonResponse, HistoricalPricesV3ResponseStruct)) {
      throw new Error('Malformed response received from Price API');
    }

    return jsonResponse;
  }
}
