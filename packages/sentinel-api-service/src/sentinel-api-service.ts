import type {
  DataServiceCacheUpdatedEvent,
  DataServiceGranularCacheUpdatedEvent,
  DataServiceInvalidateQueriesAction,
} from '@metamask/base-data-service';
import { BaseDataService } from '@metamask/base-data-service';
import type { CreateServicePolicyOptions } from '@metamask/controller-utils';
import { handleWhen, HttpError } from '@metamask/controller-utils';
import type { Messenger } from '@metamask/messenger';
import { validate } from '@metamask/superstruct';
import type { Hex, Json } from '@metamask/utils';
import type { QueryClientConfig } from '@tanstack/query-core';

import {
  BASE_URL_TEMPLATE,
  ENDPOINT_NETWORKS,
  ENDPOINT_RELAY_STATUS,
  NETWORKS_STALE_TIME_MS,
  NETWORKS_SUBDOMAIN,
  RPC_METHOD_SEND_RELAY,
  RPC_METHOD_SIMULATE,
} from './constants';
import {
  SentinelApiResponseValidationError,
  SentinelChainNotSupportedError,
  SentinelSimulationError,
} from './errors';
import { projectLogger, createModuleLogger } from './logger';
import type {
  SentinelNetwork,
  SentinelNetworkRegistry,
  SentinelRelayStatusResponse,
  SentinelRelaySubmitResponse,
  SentinelSimulationResponse,
} from './response.types';
import type { SentinelApiServiceMethodActions } from './sentinel-api-service-method-action-types';
import {
  RawRelayStatusResponseStruct,
  SentinelNetworkRegistryStruct,
  SentinelRelaySubmitResponseStruct,
  SentinelSimulationResponseStruct,
} from './structs';
import type {
  SentinelRelayStatusRequest,
  SentinelRelaySubmitRequest,
  SentinelSimulationRequest,
} from './types';

// === GENERAL ===

/**
 * The name of the {@link SentinelApiService}, used to namespace the service's
 * actions and events.
 */
export const serviceName = 'SentinelApiService';

const log = createModuleLogger(projectLogger, serviceName);

// === MESSENGER ===

const MESSENGER_EXPOSED_METHODS = [
  'getNetworks',
  'isSimulationSupported',
  'isRelaySupported',
  'simulateTransactions',
  'submitRelayTransaction',
  'getRelayStatus',
] as const;

/**
 * Invalidates cached queries for {@link SentinelApiService}.
 */
export type SentinelApiServiceInvalidateQueriesAction =
  DataServiceInvalidateQueriesAction<typeof serviceName>;

/**
 * Actions that {@link SentinelApiService} exposes to other consumers.
 */
export type SentinelApiServiceActions =
  | SentinelApiServiceMethodActions
  | SentinelApiServiceInvalidateQueriesAction;

/**
 * Actions from other messengers that {@link SentinelApiService} calls.
 */
type AllowedActions = never;

/**
 * Published when {@link SentinelApiService}'s cache is updated.
 */
export type SentinelApiServiceCacheUpdatedEvent =
  DataServiceCacheUpdatedEvent<typeof serviceName>;

/**
 * Published when a key within {@link SentinelApiService}'s cache is updated.
 */
export type SentinelApiServiceGranularCacheUpdatedEvent =
  DataServiceGranularCacheUpdatedEvent<typeof serviceName>;

/**
 * Events that {@link SentinelApiService} exposes to other consumers.
 */
export type SentinelApiServiceEvents =
  | SentinelApiServiceCacheUpdatedEvent
  | SentinelApiServiceGranularCacheUpdatedEvent;

/**
 * Events from other messengers that {@link SentinelApiService} subscribes to.
 */
type AllowedEvents = never;

/**
 * The messenger which is restricted to actions and events accessed by
 * {@link SentinelApiService}.
 */
export type SentinelApiServiceMessenger = Messenger<
  typeof serviceName,
  SentinelApiServiceActions | AllowedActions,
  SentinelApiServiceEvents | AllowedEvents
>;

// === SERVICE DEFINITION ===

/**
 * Data service that centralises all interactions with the MetaMask Sentinel
 * API (`tx-sentinel-<network>.api.cx.metamask.io`).
 *
 * It covers:
 * - Transaction simulation (`infura_simulateTransactions`) used by
 * `@metamask/transaction-controller` and `@metamask/transaction-pay-controller`.
 * - Gas station relay submission (`eth_sendRelayTransaction`) and status
 * polling, used by the MetaMask extension and mobile clients.
 * - The supported-network registry (`/networks`), cached so that consumers no
 * longer re-fetch it on every request.
 */
export class SentinelApiService extends BaseDataService<
  typeof serviceName,
  SentinelApiServiceMessenger
> {
  readonly #fetch: typeof fetch;

  /**
   * Constructs a new SentinelApiService.
   *
   * @param args - The constructor arguments.
   * @param args.messenger - The messenger suited for this service.
   * @param args.fetch - The `fetch` function to use for requests. Defaults to
   * the global `fetch`.
   * @param args.queryClientConfig - Configuration for the underlying TanStack
   * Query client.
   * @param args.policyOptions - Options to pass to `createServicePolicy`.
   */
  constructor({
    messenger,
    fetch: fetchFunction = globalThis.fetch,
    queryClientConfig = {},
    policyOptions = {},
  }: {
    messenger: SentinelApiServiceMessenger;
    fetch?: typeof fetch;
    queryClientConfig?: QueryClientConfig;
    policyOptions?: CreateServicePolicyOptions;
  }) {
    super({
      name: serviceName,
      messenger,
      queryClientConfig,
      policyOptions: {
        retryFilterPolicy: handleWhen(
          (error) =>
            !(error instanceof SentinelApiResponseValidationError) &&
            !(error instanceof SentinelChainNotSupportedError) &&
            !(error instanceof SentinelSimulationError),
        ),
        ...policyOptions,
      },
    });

    this.#fetch = fetchFunction;

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );

    log('Initialized');
  }

  /**
   * Fetches the Sentinel supported-network registry. The result is cached, as
   * the registry is stable and identical across network subdomains.
   *
   * @returns The network registry, keyed by decimal chain ID.
   */
  async getNetworks(): Promise<SentinelNetworkRegistry> {
    const url = `${buildUrl(NETWORKS_SUBDOMAIN)}${ENDPOINT_NETWORKS}`;

    const result = await this.fetchQuery({
      queryKey: [`${this.name}:getNetworks`],
      staleTime: NETWORKS_STALE_TIME_MS,
      queryFn: async (): Promise<Json> => {
        const response = await this.#fetch(url);

        if (!response.ok) {
          throw new HttpError(
            response.status,
            `Sentinel networks request failed with status '${response.status}'`,
          );
        }

        const json: Json = await response.json();

        const [error] = validate(json, SentinelNetworkRegistryStruct);
        if (error) {
          throw new SentinelApiResponseValidationError(
            `Malformed response from networks endpoint: ${error.message}`,
          );
        }

        return json;
      },
    });

    return result as unknown as SentinelNetworkRegistry;
  }

  /**
   * Determines whether simulation is supported for a given chain.
   *
   * @param chainId - The chain ID to check.
   * @returns True if simulation is supported.
   */
  async isSimulationSupported(chainId: Hex): Promise<boolean> {
    const network = await this.#getNetwork(chainId);
    return Boolean(network?.confirmations);
  }

  /**
   * Determines whether the gas station relay is supported for a given chain.
   *
   * @param chainId - The chain ID to check.
   * @returns True if the relay is supported.
   */
  async isRelaySupported(chainId: Hex): Promise<boolean> {
    const network = await this.#getNetwork(chainId);
    return Boolean(network?.relayTransactions);
  }

  /**
   * Simulates transactions against the Sentinel API via
   * `infura_simulateTransactions`. Not cached, since each request body is
   * unique and stale simulations must not be reused.
   *
   * @param chainId - The chain ID to simulate on.
   * @param request - The simulation request.
   * @returns The simulation response.
   */
  async simulateTransactions(
    chainId: Hex,
    request: SentinelSimulationRequest,
  ): Promise<SentinelSimulationResponse> {
    const url = await this.#resolveUrl(chainId, 'confirmations');

    const result = await this.fetchQuery({
      queryKey: [`${this.name}:simulateTransactions`, chainId, requestKey()],
      staleTime: 0,
      queryFn: async (): Promise<Json> => {
        const rpcResult = await this.#jsonRpc(url, RPC_METHOD_SIMULATE, [
          request,
        ]);

        const [error] = validate(rpcResult, SentinelSimulationResponseStruct);
        if (error) {
          throw new SentinelApiResponseValidationError(
            `Malformed response from simulation endpoint: ${error.message}`,
          );
        }

        return rpcResult;
      },
    });

    return result as unknown as SentinelSimulationResponse;
  }

  /**
   * Submits a signed relay (gas station) transaction to the Sentinel API via
   * `eth_sendRelayTransaction`. Not cached.
   *
   * @param request - The relay submit request.
   * @returns The relay submit response containing the tracking UUID.
   */
  async submitRelayTransaction(
    request: SentinelRelaySubmitRequest,
  ): Promise<SentinelRelaySubmitResponse> {
    const url = await this.#resolveUrl(request.chainId, 'relayTransactions');

    const result = await this.fetchQuery({
      queryKey: [
        `${this.name}:submitRelayTransaction`,
        request.chainId,
        requestKey(),
      ],
      staleTime: 0,
      queryFn: async (): Promise<Json> => {
        const rpcResult = await this.#jsonRpc(url, RPC_METHOD_SEND_RELAY, [
          request,
        ]);

        const [error] = validate(rpcResult, SentinelRelaySubmitResponseStruct);
        if (error) {
          throw new SentinelApiResponseValidationError(
            `Malformed response from relay submit endpoint: ${error.message}`,
          );
        }

        return rpcResult;
      },
    });

    return result as unknown as SentinelRelaySubmitResponse;
  }

  /**
   * Retrieves the current status of a submitted relay transaction. Performs a
   * single request; callers own any polling loop. Not cached.
   *
   * @param request - The relay status request.
   * @returns The normalized relay status.
   */
  async getRelayStatus(
    request: SentinelRelayStatusRequest,
  ): Promise<SentinelRelayStatusResponse> {
    const { chainId, uuid } = request;
    const baseUrl = await this.#resolveUrl(chainId, 'relayTransactions');
    const url = `${baseUrl}${ENDPOINT_RELAY_STATUS}/${uuid}`;

    const result = await this.fetchQuery({
      queryKey: [`${this.name}:getRelayStatus`, chainId, uuid, requestKey()],
      staleTime: 0,
      queryFn: async (): Promise<Json> => {
        const response = await this.#fetch(url);

        if (!response.ok) {
          throw new HttpError(
            response.status,
            `Sentinel relay status request failed with status '${response.status}'`,
          );
        }

        const json: Json = await response.json();

        const [error, validated] = validate(
          json,
          RawRelayStatusResponseStruct,
        );
        if (error) {
          throw new SentinelApiResponseValidationError(
            `Malformed response from relay status endpoint: ${error.message}`,
          );
        }

        const first = validated.transactions[0];

        return {
          status: first?.status ?? '',
          ...(first?.hash ? { transactionHash: first.hash } : {}),
          ...(first?.errorReason ? { errorReason: first.errorReason } : {}),
        };
      },
    });

    return result as unknown as SentinelRelayStatusResponse;
  }

  /**
   * Performs a JSON-RPC POST to the Sentinel API and returns the `result`.
   *
   * @param url - The URL to post to.
   * @param method - The JSON-RPC method name.
   * @param params - The JSON-RPC params.
   * @returns The `result` field of the JSON-RPC response.
   */
  async #jsonRpc(url: string, method: string, params: Json[]): Promise<Json> {
    const response = await this.#fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: '1',
        jsonrpc: '2.0',
        method,
        params,
      }),
    });

    if (!response.ok) {
      throw new HttpError(
        response.status,
        `Sentinel ${method} request failed with status '${response.status}'`,
      );
    }

    const responseJson = await response.json();

    if (responseJson.error) {
      const { code, message } = responseJson.error;
      throw new SentinelSimulationError(message, code);
    }

    return responseJson.result;
  }

  /**
   * Resolves the Sentinel URL for a chain, asserting the required capability.
   *
   * @param chainId - The chain ID to resolve a URL for.
   * @param capability - The capability flag that must be enabled.
   * @returns The resolved base URL.
   */
  async #resolveUrl(
    chainId: Hex,
    capability: 'confirmations' | 'relayTransactions',
  ): Promise<string> {
    const network = await this.#getNetwork(chainId);

    if (!network?.[capability]) {
      throw new SentinelChainNotSupportedError(chainId, capability);
    }

    return buildUrl(network.network);
  }

  /**
   * Looks up a single network entry from the registry by chain ID.
   *
   * @param chainId - The chain ID to look up.
   * @returns The network entry, or undefined if not present.
   */
  async #getNetwork(chainId: Hex): Promise<SentinelNetwork | undefined> {
    const registry = await this.getNetworks();
    const chainIdDecimal = BigInt(chainId).toString(10);
    return registry[chainIdDecimal];
  }
}

/**
 * Builds a Sentinel URL for the given network subdomain.
 *
 * @param subdomain - The network subdomain (for example `ethereum-mainnet`).
 * @returns The full base URL.
 */
function buildUrl(subdomain: string): string {
  return BASE_URL_TEMPLATE.replace('{0}', subdomain);
}

/**
 * Generates a unique component for the query key of uncached requests, so that
 * TanStack Query never returns a cached result for simulation/relay calls.
 *
 * @returns A unique string.
 */
let requestCounter = 0;
function requestKey(): number {
  requestCounter += 1;
  return requestCounter;
}
