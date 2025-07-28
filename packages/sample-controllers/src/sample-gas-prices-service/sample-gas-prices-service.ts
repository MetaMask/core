import type { RestrictedMessenger } from '@metamask/base-controller';
import type {
  CreateServicePolicyOptions,
  ServicePolicy,
} from '@metamask/controller-utils';
import { createServicePolicy } from '@metamask/controller-utils';
import type { Hex } from '@metamask/utils';

// === GENERAL ===

/**
 * The name of the {@link SampleGasPricesService}, used to namespace the
 * service's actions and events.
 */
export const SERVICE_NAME = 'SampleGasPricesService';

// === MESSENGER ===

/**
 * Fetches the latest gas prices for the given chain and persists them to
 * state.
 *
 * @param args - The arguments to the function.
 * @param args.chainId - The chain ID for which to fetch gas prices.
 */
export type SampleGasPricesServiceFetchGasPricesAction = {
  type: `${typeof SERVICE_NAME}:fetchGasPrices`;
  handler: SampleGasPricesService['fetchGasPrices'];
};

/**
 * Actions that {@link SampleGasPricesService} exposes to other consumers.
 */
export type SampleGasPricesServiceActions =
  SampleGasPricesServiceFetchGasPricesAction;

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
  typeof SERVICE_NAME,
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
 * Options for the SampleGasPricesService constructor.
 */
export type SampleGasPricesServiceOptions = {
  /**
   * The messenger suited for the SampleGasPricesService.
   */
  messenger: SampleGasPricesServiceMessenger;
  /**
   * A function that can be used to make an HTTP request. If your JavaScript
   * environment supports `fetch` natively, you'll probably want to pass that;
   * otherwise you can pass an equivalent (such as `fetch` via `node-fetch`).
   */
  fetch: typeof fetch;
  /**
   * Options to pass to `createServicePolicy`, which is used to wrap each
   * request.
   *
   * @see {@link CreateServicePolicyOptions}
   */
  policyOptions?: CreateServicePolicyOptions;
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
   * The messenger suited for this service.
   */
  readonly #messenger: SampleGasPricesServiceOptions['messenger'];

  /**
   * A function that can be used to make an HTTP request.
   */
  readonly #fetch: SampleGasPricesServiceOptions['fetch'];

  /**
   * The policy that wraps the request.
   *
   * @see {@link createServicePolicy}
   */
  readonly #policy: ServicePolicy;

  /**
   * Constructs a new SampleGasPricesService object.
   *
   * @param options - The options. See {@link SampleGasPricesServiceOptions}.
   */
  constructor(options: SampleGasPricesServiceOptions) {
    const { messenger, fetch: fetchFunction, policyOptions = {} } = options;

    this.#messenger = messenger;
    this.#fetch = fetchFunction;
    this.#policy = createServicePolicy(policyOptions);

    this.#messenger.registerActionHandler(
      `${SERVICE_NAME}:fetchGasPrices`,
      this.fetchGasPrices.bind(this),
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
