import type { RestrictedMessenger } from '@metamask/base-controller';
import type {
  CreateServicePolicyOptions,
  ServicePolicy,
} from '@metamask/controller-utils';
import { createServicePolicy } from '@metamask/controller-utils';
import type { Hex } from '@metamask/utils';

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
 * import type { SampleGasPricesMessenger } from '@metamask/sample-controllers';
 *
 * const messenger: SampleGasPricesMessenger = new Messenger();
 * const service = new SampleGasPricesService({ messenger, fetch });
 *
 * // Fetch gas prices for Mainnet
 * const gasPricesResponse = await service.fetchGasPrices('0x1');
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
   * Listens for when the request is retried due to failures.
   *
   * @param listener - The callback to be called when the retry occurs.
   * @returns The same value that {@link ServicePolicy.onRetry} returns.
   * @see {@link createServicePolicy}
   */
  onRetry(listener: Parameters<ServicePolicy['onRetry']>[0]) {
    return this.#policy.onRetry(listener);
  }

  /**
   * Makes a request to the API in order to retrieve gas prices for a particular
   * chain.
   *
   * @param chainId - The chain ID for which you want to fetch gas prices.
   * @returns The gas prices for the given chain.
   */
  async fetchGasPrices(chainId: Hex) {
    return await this.#policy.execute(async () => {
      const response = await this.#fetch(
        `https://example.com/gas-prices/${chainId}.json`,
      );
      if (response.ok) {
        // Type assertion: We have to assume the shape of the response data.
        const gasPricesResponse =
          (await response.json()) as unknown as GasPricesResponse;
        return gasPricesResponse.data;
      }
      throw new Error(
        `Error fetching gas prices (HTTP status ${response.status})`,
      );
    });
  }
}
