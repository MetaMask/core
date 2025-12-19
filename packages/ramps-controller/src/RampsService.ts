import type {
  CreateServicePolicyOptions,
  ServicePolicy,
} from '@metamask/controller-utils';
import { createServicePolicy, HttpError } from '@metamask/controller-utils';
import type { Messenger } from '@metamask/messenger';

import type { RampsServiceMethodActions } from './RampsService-method-action-types';

/**
 * Represents phone number information for a country.
 */
export type CountryPhone = {
  prefix: string;
  placeholder: string;
  template: string;
};

/**
 * Represents a country returned from the regions/countries API.
 */
export type Country = {
  isoCode: string;
  flag: string;
  name: string;
  phone: CountryPhone;
  currency: string;
  supported: boolean;
  recommended?: boolean;
  unsupportedStates?: string[];
  transakSupported?: boolean;
};

// === GENERAL ===

/**
 * The name of the {@link RampsService}, used to namespace the
 * service's actions and events.
 */
export const serviceName = 'RampsService';

/**
 * The environment to use for API requests.
 */
export enum RampsEnvironment {
  Production = 'production',
  Staging = 'staging',
  Development = 'development',
}

/**
 * The type of ramps API service.
 * Determines which base URL to use (cache vs standard).
 */
export enum RampsApiService {
  Regions = 'regions',
  Orders = 'orders',
}

// === MESSENGER ===

const MESSENGER_EXPOSED_METHODS = ['getGeolocation', 'getCountries'] as const;

/**
 * Actions that {@link RampsService} exposes to other consumers.
 */
export type RampsServiceActions = RampsServiceMethodActions;

/**
 * Actions from other messengers that {@link RampsService} calls.
 */
type AllowedActions = never;

/**
 * Events that {@link RampsService} exposes to other consumers.
 */
export type RampsServiceEvents = never;

/**
 * Events from other messengers that {@link RampsService} subscribes to.
 */
type AllowedEvents = never;

/**
 * The messenger which is restricted to actions and events accessed by
 * {@link RampsService}.
 */
export type RampsServiceMessenger = Messenger<
  typeof serviceName,
  RampsServiceActions | AllowedActions,
  RampsServiceEvents | AllowedEvents
>;

// === SERVICE DEFINITION ===

/**
 * Gets the base URL for API requests based on the environment and service type.
 * The Regions service uses a cache URL, while other services use the standard URL.
 *
 * @param environment - The environment to use.
 * @param service - The API service type (determines if cache URL is used).
 * @returns The base URL for API requests.
 */
function getBaseUrl(
  environment: RampsEnvironment,
  service: RampsApiService,
): string {
  const cache = service === RampsApiService.Regions ? '-cache' : '';

  switch (environment) {
    case RampsEnvironment.Production:
      return `https://on-ramp${cache}.api.cx.metamask.io`;
    case RampsEnvironment.Staging:
    case RampsEnvironment.Development:
      return `https://on-ramp${cache}.uat-api.cx.metamask.io`;
    default:
      throw new Error(`Invalid environment: ${String(environment)}`);
  }
}

/**
 * This service object is responsible for interacting with the Ramps API.
 *
 * @example
 *
 * ``` ts
 * import { Messenger } from '@metamask/messenger';
 * import type {
 *   RampsServiceActions,
 *   RampsServiceEvents,
 * } from '@metamask/ramps-controller';
 *
 * const rootMessenger = new Messenger<
 *   'Root',
 *   RampsServiceActions
 *   RampsServiceEvents
 * >({ namespace: 'Root' });
 * const rampsServiceMessenger = new Messenger<
 *   'RampsService',
 *   RampsServiceActions,
 *   RampsServiceEvents,
 *   typeof rootMessenger,
 * >({
 *   namespace: 'RampsService',
 *   parent: rootMessenger,
 * });
 * // Instantiate the service to register its actions on the messenger
 * new RampsService({
 *   messenger: rampsServiceMessenger,
 *   environment: RampsEnvironment.Production,
 *   fetch,
 * });
 *
 * // Later...
 * // Get the user's geolocation
 * const geolocation = await rootMessenger.call(
 *   'RampsService:getGeolocation',
 * );
 * // ... Do something with the geolocation ...
 * ```
 */
export class RampsService {
  /**
   * The name of the service.
   */
  readonly name: typeof serviceName;

  /**
   * The messenger suited for this service.
   */
  readonly #messenger: ConstructorParameters<
    typeof RampsService
  >[0]['messenger'];

  /**
   * A function that can be used to make an HTTP request.
   */
  readonly #fetch: ConstructorParameters<typeof RampsService>[0]['fetch'];

  /**
   * The policy that wraps the request.
   *
   * @see {@link createServicePolicy}
   */
  readonly #policy: ServicePolicy;

  /**
   * The environment used for API requests.
   */
  readonly #environment: RampsEnvironment;

  /**
   * Constructs a new RampsService object.
   *
   * @param args - The constructor arguments.
   * @param args.messenger - The messenger suited for this service.
   * @param args.environment - The environment to use for API requests.
   * @param args.fetch - A function that can be used to make an HTTP request. If
   * your JavaScript environment supports `fetch` natively, you'll probably want
   * to pass that; otherwise you can pass an equivalent (such as `fetch` via
   * `node-fetch`).
   * @param args.policyOptions - Options to pass to `createServicePolicy`, which
   * is used to wrap each request. See {@link CreateServicePolicyOptions}.
   */
  constructor({
    messenger,
    environment = RampsEnvironment.Staging,
    fetch: fetchFunction,
    policyOptions = {},
  }: {
    messenger: RampsServiceMessenger;
    environment?: RampsEnvironment;
    fetch: typeof fetch;
    policyOptions?: CreateServicePolicyOptions;
  }) {
    this.name = serviceName;
    this.#messenger = messenger;
    this.#fetch = fetchFunction;
    this.#policy = createServicePolicy(policyOptions);
    this.#environment = environment;

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
  onRetry(
    listener: Parameters<ServicePolicy['onRetry']>[0],
  ): ReturnType<ServicePolicy['onRetry']> {
    return this.#policy.onRetry(listener);
  }

  /**
   * Registers a handler that will be called after a set number of retry rounds
   * prove that requests to the API endpoint consistently return a 5xx response.
   *
   * @param listener - The handler to be called.
   * @returns An object that can be used to unregister the handler. See
   * {@link CockatielEvent}.
   * @see {@link createServicePolicy}
   */
  onBreak(
    listener: Parameters<ServicePolicy['onBreak']>[0],
  ): ReturnType<ServicePolicy['onBreak']> {
    return this.#policy.onBreak(listener);
  }

  /**
   * Registers a handler that will be called under one of two circumstances:
   *
   * 1. After a set number of retries prove that requests to the API
   * consistently result in one of the following failures:
   *    1. A connection initiation error
   *    2. A connection reset error
   *    3. A timeout error
   *    4. A non-JSON response
   *    5. A 502, 503, or 504 response
   * 2. After a successful request is made to the API, but the response takes
   * longer than a set duration to return.
   *
   * @param listener - The handler to be called.
   * @returns An object that can be used to unregister the handler. See
   * {@link CockatielEvent}.
   */
  onDegraded(
    listener: Parameters<ServicePolicy['onDegraded']>[0],
  ): ReturnType<ServicePolicy['onDegraded']> {
    return this.#policy.onDegraded(listener);
  }

  /**
   * Makes a request to the API in order to retrieve the user's geolocation
   * based on their IP address.
   *
   * @returns The user's country/region code (e.g., "US-UT" for Utah, USA).
   */
  async getGeolocation(): Promise<string> {
    const responseData = await this.#policy.execute(async () => {
      const baseUrl = getBaseUrl(this.#environment, RampsApiService.Orders);
      const url = new URL('geolocation', baseUrl);
      const localResponse = await this.#fetch(url);
      if (!localResponse.ok) {
        throw new HttpError(
          localResponse.status,
          `Fetching '${url.toString()}' failed with status '${localResponse.status}'`,
        );
      }
      const textResponse = await localResponse.text();
      // Return both response and text content since we consumed the body
      return { response: localResponse, text: textResponse };
    });

    const textResponse = responseData.text;
    const trimmedResponse = textResponse.trim();

    if (trimmedResponse.length > 0) {
      return trimmedResponse;
    }

    throw new Error('Malformed response received from geolocation API');
  }

  /**
   * Makes a request to the cached API to retrieve the list of supported countries.
   *
   * @param action - The ramp action type ('deposit' or 'withdraw').
   * @returns An array of countries with their eligibility information.
   */
  async getCountries(
    action: 'deposit' | 'withdraw' = 'deposit',
  ): Promise<Country[]> {
    const responseData = await this.#policy.execute(async () => {
      const baseUrl = getBaseUrl(this.#environment, RampsApiService.Regions);
      const url = new URL('regions/countries', baseUrl);
      url.searchParams.set('action', action);
      url.searchParams.set('sdk', '2.1.6');
      url.searchParams.set('context', 'mobile-ios');

      const localResponse = await this.#fetch(url);
      if (!localResponse.ok) {
        throw new HttpError(
          localResponse.status,
          `Fetching '${url.toString()}' failed with status '${localResponse.status}'`,
        );
      }
      return localResponse.json() as Promise<Country[]>;
    });

    return responseData;
  }
}
