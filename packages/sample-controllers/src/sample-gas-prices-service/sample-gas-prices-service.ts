import type { RestrictedMessenger } from '@metamask/base-controller';
import type {
  CreateServicePolicyOptions,
  ServicePolicy,
} from '@metamask/controller-utils';
import {
  createServicePolicy,
  fromHex,
  HttpError,
} from '@metamask/controller-utils';
import { hasProperty, isPlainObject, type Hex } from '@metamask/utils';

import type { SampleGasPricesServiceMethodActions } from './sample-gas-prices-service-method-action-types';

// === GENERAL ===

/**
 * The name of the {@link SampleGasPricesService}, used to namespace the
 * service's actions and events.
 */
export const serviceName = 'SampleGasPricesService';

// === MESSENGER ===
//
const MESSENGER_EXPOSED_METHODS = ['fetchGasPrices'] as const;

/**
 * Actions that {@link SampleGasPricesService} exposes to other consumers.
 */
export type SampleGasPricesServiceActions = SampleGasPricesServiceMethodActions;

/**
 * Actions from other messengers that {@link SampleGasPricesMessenger} calls.
 */
type AllowedActions = never;

/**
 * Events that {@link SampleGasPricesService} exposes to other consumers.
 */
export type SampleGasPricesServiceEvents = never;

/**
 * Events from other messengers that {@link SampleGasPricesService} subscribes
 * to.
 */
type AllowedEvents = never;

/**
 * The messenger which is restricted to actions and events accessed by
 * {@link SampleGasPricesService}.
 */
export type SampleGasPricesServiceMessenger = RestrictedMessenger<
  typeof serviceName,
  SampleGasPricesServiceActions | AllowedActions,
  SampleGasPricesServiceEvents | AllowedEvents,
  AllowedActions['type'],
  AllowedEvents['type']
>;

// === SERVICE DEFINITION ===

/**
 * What the API endpoint returns.
 */
type GasPricesResponse = {
  data: {
    low: number;
    average: number;
    high: number;
  };
};

/**
 * This service object is responsible for fetching gas prices via an API.
 *
 * @example
 *
 * ``` ts
 * import type {
 *   SampleGasPricesServiceActions,
 *   SampleGasPricesServiceEvents
 * } from '@metamask/sample-controllers';
 *
 * const globalMessenger = new Messenger<
 *   SampleGasPricesServiceActions
 *   SampleGasPricesServiceEvents
 * >();
 * const gasPricesServiceMessenger = globalMessenger.getRestricted({
 *   name: 'SampleGasPricesService',
 *   allowedActions: [],
 *   allowedEvents: [],
 * });
 * const gasPricesService = new SampleGasPricesService({
 *   messenger: gasPricesServiceMessenger,
 *   fetch,
 * });
 *
 * // Fetch gas prices for Mainnet
 * const gasPrices = await gasPricesService.fetchGasPrices('0x1');
 *
 * // ... Do something with the response ...
 * ```
 */
export class SampleGasPricesService {
  /**
   * The name of the service.
   */
  readonly name: typeof serviceName;

  /**
   * The messenger suited for this service.
   */
  readonly #messenger: ConstructorParameters<
    typeof SampleGasPricesService
  >[0]['messenger'];

  /**
   * A function that can be used to make an HTTP request.
   */
  readonly #fetch: ConstructorParameters<
    typeof SampleGasPricesService
  >[0]['fetch'];

  /**
   * The policy that wraps the request.
   *
   * @see {@link createServicePolicy}
   */
  readonly #policy: ServicePolicy;

  /**
   * Constructs a new SampleGasPricesService object.
   *
   * @param args - The constructor arguments.
   * @param args.messenger - The messenger suited for this service.
   * @param args.fetch - A function that can be used to make an HTTP request. If
   * your JavaScript environment supports `fetch` natively, you'll probably want
   * to pass that; otherwise you can pass an equivalent (such as `fetch` via
   * `node-fetch`).
   * @param args.policyOptions - Options to pass to `createServicePolicy`, which
   * is used to wrap each request. See {@link CreateServicePolicyOptions}.
   */
  constructor({
    messenger,
    fetch: fetchFunction,
    policyOptions = {},
  }: {
    messenger: SampleGasPricesServiceMessenger;
    fetch: typeof fetch;
    policyOptions?: CreateServicePolicyOptions;
  }) {
    this.name = serviceName;
    this.#messenger = messenger;
    this.#fetch = fetchFunction;
    this.#policy = createServicePolicy(policyOptions);

    this.#messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Registers a handler that will be called after a request returns a non-500
   * response, causing a retry. Primarily useful in tests where timers are being
   * mocked.
   *
   * @param listener - The handler to be called.
   * @returns An object that can be used to unregister the handler. See
   * {@link CockatielEvent}.
   * @see {@link createServicePolicy}
   */
  onRetry(listener: Parameters<ServicePolicy['onRetry']>[0]) {
    return this.#policy.onRetry(listener);
  }

  /**
   * Registers a handler that will be called after a set number of retry rounds
   * prove that requests to an RPC endpoint consistently return a 5xx response.
   *
   * @param listener - The handler to be called.
   * @returns An object that can be used to unregister the handler. See
   * {@link CockatielEvent}.
   * @see {@link createServicePolicy}
   */
  onBreak(listener: Parameters<ServicePolicy['onBreak']>[0]) {
    return this.#policy.onBreak(listener);
  }

  /* eslint-disable jsdoc/check-indentation */
  /**
   * Registers a handler that will be called under one of two circumstances:
   *
   * 1. After a set number of retries prove that requests to an RPC endpoint
   * consistently result in one of the following failures:
   *    1. A connection initiation error
   *    2. A connection reset error
   *    3. A timeout error
   *    4. A non-JSON response
   *    5. A 502, 503, or 504 response
   * 2. After a successful request is made to the RPC endpoint, but the response
   * takes longer than a set duration to return.
   *
   * @param listener - The handler to be called.
   * @returns An object that can be used to unregister the handler. See
   * {@link CockatielEvent}.
   */
  /* eslint-enable jsdoc/check-indentation */
  onDegraded(listener: Parameters<ServicePolicy['onDegraded']>[0]) {
    return this.#policy.onDegraded(listener);
  }

  /**
   * Makes a request to the API in order to retrieve gas prices for a particular
   * chain.
   *
   * @param chainId - The chain ID for which you want to fetch gas prices.
   * @returns The gas prices for the given chain.
   */
  async fetchGasPrices(chainId: Hex): Promise<GasPricesResponse['data']> {
    const response = await this.#policy.execute(async () => {
      const url = new URL('https://api.example.com/gas-prices');
      url.searchParams.append('chainId', `eip155:${fromHex(chainId)}`);
      const localResponse = await this.#fetch(url);
      if (!localResponse.ok) {
        throw new HttpError(
          localResponse.status,
          `Fetching '${url.toString()}' failed with status '${localResponse.status}'`,
        );
      }
      return localResponse;
    });
    const jsonResponse = await response.json();

    if (
      isPlainObject(jsonResponse) &&
      hasProperty(jsonResponse, 'data') &&
      isPlainObject(jsonResponse.data) &&
      hasProperty(jsonResponse.data, 'low') &&
      hasProperty(jsonResponse.data, 'average') &&
      hasProperty(jsonResponse.data, 'high')
    ) {
      const {
        data: { low, average, high },
      } = jsonResponse;
      if (
        typeof low === 'number' &&
        typeof average === 'number' &&
        typeof high === 'number'
      ) {
        return { low, average, high };
      }
    }

    throw new Error('Malformed response received from gas prices API');
  }
}
