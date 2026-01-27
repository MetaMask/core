import type {
  CreateServicePolicyOptions,
  ServicePolicy,
} from '@metamask/controller-utils';
import { createServicePolicy, HttpError } from '@metamask/controller-utils';
import type { Messenger } from '@metamask/messenger';
import { hasProperty, isPlainObject } from '@metamask/utils';
import type { IDisposable } from 'cockatiel';

import type { ConfigRegistryApiServiceMethodActions } from './config-registry-api-service-method-action-types';

// === GENERAL ===

/**
 * The name of the {@link ConfigRegistryApiService}, used to namespace the
 * service's actions and events.
 */
export const serviceName = 'ConfigRegistryApiService';

/**
 * The environment for the config registry API.
 */
export type ConfigRegistryApiEnv = 'dev-api' | 'uat-api' | 'api';

// === MESSENGER ===

const MESSENGER_EXPOSED_METHODS = ['fetchConfig'] as const;

/**
 * Actions that {@link ConfigRegistryApiService} exposes to other consumers.
 */
export type ConfigRegistryApiServiceActions =
  ConfigRegistryApiServiceMethodActions;

/**
 * Actions from other messengers that {@link ConfigRegistryApiServiceMessenger} calls.
 */
type AllowedActions = never;

/**
 * Events that {@link ConfigRegistryApiService} exposes to other consumers.
 */
export type ConfigRegistryApiServiceEvents = never;

/**
 * Events from other messengers that {@link ConfigRegistryApiService} subscribes
 * to.
 */
type AllowedEvents = never;

/**
 * The messenger which is restricted to actions and events accessed by
 * {@link ConfigRegistryApiService}.
 */
export type ConfigRegistryApiServiceMessenger = Messenger<
  typeof serviceName,
  ConfigRegistryApiServiceActions | AllowedActions,
  ConfigRegistryApiServiceEvents | AllowedEvents
>;

// === TYPES ===

/**
 * The RPC endpoint configuration from the API.
 */
export type NetworkRpcEndpoint = {
  url: string;
  type: string;
  networkClientId: string;
  failoverUrls: string[];
};

/**
 * The network configuration from the API.
 */
export type NetworkConfig = {
  chainId: string;
  name: string;
  nativeCurrency: string;
  rpcEndpoints: NetworkRpcEndpoint;
  blockExplorerUrls: string[];
  defaultRpcEndpointIndex: number;
  defaultBlockExplorerUrlIndex: number;
  lastUpdatedAt?: number;
  networkImageUrl?: string;
  nativeTokenImageUrl?: string;
  isActive: boolean;
  isTestnet: boolean;
  isDefault: boolean;
  isFeatured: boolean;
  isDeprecated: boolean;
  priority: number;
  isDeletable: boolean;
};

/**
 * The response from the config API.
 */
export type ConfigResponse = {
  data: {
    version: string;
    timestamp: number;
    networks: NetworkConfig[];
  };
};

/**
 * The result returned from fetchConfig, including cache status.
 */
export type FetchConfigResult = {
  data: ConfigResponse['data'];
  cached: boolean;
  etag: string | null;
};

// === SERVICE DEFINITION ===

/**
 * This service object is responsible for fetching configuration data from the
 * config registry API.
 */
export class ConfigRegistryApiService {
  /**
   * The name of the service.
   */
  readonly name: typeof serviceName;

  /**
   * The messenger suited for this service.
   */
  readonly #messenger: ConfigRegistryApiServiceMessenger;

  /**
   * A function that can be used to make an HTTP request.
   */
  readonly #fetch: typeof fetch;

  /**
   * The policy that wraps the request.
   *
   * @see {@link createServicePolicy}
   */
  readonly #policy: ServicePolicy;

  /**
   * The environment for the config registry API.
   */
  readonly #env: ConfigRegistryApiEnv;

  /**
   * The cached response data.
   */
  #cachedData: ConfigResponse['data'] | null = null;

  /**
   * The cached ETag value.
   */
  #cachedEtag: string | null = null;

  /**
   * Constructs a new ConfigRegistryApiService object.
   *
   * @param args - The constructor arguments.
   * @param args.messenger - The messenger suited for this service.
   * @param args.fetch - A function that can be used to make an HTTP request.
   * @param args.env - The environment for the config registry API.
   * @param args.policyOptions - Options to pass to `createServicePolicy`.
   */
  constructor({
    messenger,
    fetch: fetchFunction,
    env,
    policyOptions = {},
  }: {
    messenger: ConfigRegistryApiServiceMessenger;
    fetch: typeof fetch;
    env: ConfigRegistryApiEnv;
    policyOptions?: CreateServicePolicyOptions;
  }) {
    this.name = serviceName;
    this.#messenger = messenger;
    this.#fetch = fetchFunction;
    this.#env = env;
    this.#policy = createServicePolicy(policyOptions);

    this.#messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Registers a handler that will be called after a request returns a non-500
   * response, causing a retry.
   *
   * @param listener - The handler to be called.
   * @returns An object that can be used to unregister the handler.
   */
  onRetry(listener: Parameters<ServicePolicy['onRetry']>[0]): IDisposable {
    return this.#policy.onRetry(listener);
  }

  /**
   * Registers a handler that will be called after a set number of retry rounds
   * prove that requests to the API endpoint consistently return a 5xx response.
   *
   * @param listener - The handler to be called.
   * @returns An object that can be used to unregister the handler.
   */
  onBreak(listener: Parameters<ServicePolicy['onBreak']>[0]): IDisposable {
    return this.#policy.onBreak(listener);
  }

  /**
   * Registers a handler that will be called when the service is degraded.
   *
   * @param listener - The handler to be called.
   * @returns An object that can be used to unregister the handler.
   */
  onDegraded(
    listener: Parameters<ServicePolicy['onDegraded']>[0],
  ): IDisposable {
    return this.#policy.onDegraded(listener);
  }

  /**
   * Makes a request to the config registry API to retrieve network configuration.
   * Supports HTTP caching via ETag.
   *
   * @returns The configuration data with cache status.
   */
  async fetchConfig(): Promise<FetchConfigResult> {
    const baseUrl = `https://client-config.${this.#env}.cx.metamask.io`;
    const url = new URL('/v1/config/networks', baseUrl);

    const headers: HeadersInit = {};
    if (this.#cachedEtag) {
      headers['If-None-Match'] = this.#cachedEtag;
    }

    const response = await this.#policy.execute(async () => {
      const localResponse = await this.#fetch(url.toString(), { headers });

      // Handle 304 Not Modified - return cached data
      if (localResponse.status === 304) {
        return localResponse;
      }

      if (!localResponse.ok) {
        throw new HttpError(
          localResponse.status,
          `Fetching '${url.toString()}' failed with status '${localResponse.status}'`,
        );
      }
      return localResponse;
    });

    // Return cached data if we got a 304
    if (response.status === 304 && this.#cachedData) {
      return {
        data: this.#cachedData,
        cached: true,
        etag: this.#cachedEtag,
      };
    }

    const jsonResponse = await response.json();

    // Validate response structure
    if (!this.#isValidConfigResponse(jsonResponse)) {
      throw new Error('Malformed response received from config registry API');
    }

    // Update cache
    this.#cachedData = jsonResponse.data;
    this.#cachedEtag = response.headers.get('etag');

    return {
      data: jsonResponse.data,
      cached: false,
      etag: this.#cachedEtag,
    };
  }

  /**
   * Validates that the response matches the expected format.
   *
   * @param response - The response to validate.
   * @returns True if the response is valid, false otherwise.
   */
  #isValidConfigResponse(response: unknown): response is ConfigResponse {
    if (!isPlainObject(response)) {
      return false;
    }

    if (!hasProperty(response, 'data') || !isPlainObject(response.data)) {
      return false;
    }

    const { data } = response;

    if (!hasProperty(data, 'version') || typeof data.version !== 'string') {
      return false;
    }

    if (!hasProperty(data, 'timestamp') || typeof data.timestamp !== 'number') {
      return false;
    }

    if (!hasProperty(data, 'networks') || !Array.isArray(data.networks)) {
      return false;
    }

    // Validate each network in the array
    for (const network of data.networks) {
      if (!this.#isValidNetworkConfig(network)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Validates that a network configuration matches the expected format.
   *
   * @param network - The network config to validate.
   * @returns True if valid, false otherwise.
   */
  #isValidNetworkConfig(network: unknown): network is NetworkConfig {
    if (!isPlainObject(network)) {
      return false;
    }

    const requiredStringFields = ['chainId', 'name', 'nativeCurrency'];
    for (const field of requiredStringFields) {
      if (!hasProperty(network, field) || typeof network[field] !== 'string') {
        return false;
      }
    }

    const requiredBooleanFields = [
      'isActive',
      'isTestnet',
      'isDefault',
      'isFeatured',
      'isDeprecated',
      'isDeletable',
    ];
    for (const field of requiredBooleanFields) {
      if (!hasProperty(network, field) || typeof network[field] !== 'boolean') {
        return false;
      }
    }

    if (
      !hasProperty(network, 'priority') ||
      typeof network.priority !== 'number'
    ) {
      return false;
    }

    if (
      !hasProperty(network, 'defaultRpcEndpointIndex') ||
      typeof network.defaultRpcEndpointIndex !== 'number'
    ) {
      return false;
    }

    if (
      !hasProperty(network, 'defaultBlockExplorerUrlIndex') ||
      typeof network.defaultBlockExplorerUrlIndex !== 'number'
    ) {
      return false;
    }

    if (
      !hasProperty(network, 'blockExplorerUrls') ||
      !Array.isArray(network.blockExplorerUrls)
    ) {
      return false;
    }

    if (
      !hasProperty(network, 'rpcEndpoints') ||
      !isPlainObject(network.rpcEndpoints)
    ) {
      return false;
    }

    const { rpcEndpoints } = network;
    const requiredRpcFields = ['url', 'type', 'networkClientId'];
    for (const field of requiredRpcFields) {
      if (
        !hasProperty(rpcEndpoints, field) ||
        typeof rpcEndpoints[field] !== 'string'
      ) {
        return false;
      }
    }

    if (
      !hasProperty(rpcEndpoints, 'failoverUrls') ||
      !Array.isArray(rpcEndpoints.failoverUrls)
    ) {
      return false;
    }

    return true;
  }
}
