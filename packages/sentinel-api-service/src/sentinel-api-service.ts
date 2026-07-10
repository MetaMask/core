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
  DEFAULT_ENVIRONMENT,
  ENDPOINT_NETWORKS,
  ENDPOINT_RELAY_STATUS,
  ENVIRONMENT_DOMAIN,
  NETWORKS_STALE_TIME_MS,
  NETWORKS_SUBDOMAIN,
  RPC_METHOD_SEND_RELAY,
  RPC_METHOD_SIMULATE,
  SentinelEnvironment,
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
 * Retrieves a JWT bearer token used to authenticate Sentinel requests, obtained
 * from the `AuthenticationController`. Declared structurally so this package
 * does not depend on `@metamask/profile-sync-controller`.
 */
type AuthenticationControllerGetBearerTokenAction = {
  type: 'AuthenticationController:getBearerToken';
  handler: (entropySourceId?: string) => Promise<string>;
};

/**
 * Actions from other messengers that {@link SentinelApiService} calls.
 */
type AllowedActions = AuthenticationControllerGetBearerTokenAction;

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
 * It exposes one method per Sentinel endpoint:
 * - {@link SentinelApiService.getNetworks} — the supported-network registry
 * (`/networks`), cached since it is stable and identical across subdomains.
 * - {@link SentinelApiService.simulateTransactions} — transaction simulation
 * (`infura_simulateTransactions`), used by `@metamask/transaction-controller`
 * and `@metamask/transaction-pay-controller`.
 * - {@link SentinelApiService.submitRelayTransaction} — gas station relay
 * submission (`eth_sendRelayTransaction`), used by the extension and mobile.
 * - {@link SentinelApiService.getRelayStatus} — relay status polling.
 *
 * Consumers derive higher-level concerns (whether a chain supports simulation
 * or relay, polling loops, etc.) from the raw endpoint responses.
 */
/**
 * Constructor options for {@link SentinelApiService}.
 */
export type SentinelApiServiceOptions = {
  /** The messenger suited for this service. */
  messenger: SentinelApiServiceMessenger;

  /**
   * The `fetch` function to use for requests. Defaults to the global `fetch`.
   */
  fetch?: typeof fetch;

  /**
   * The Sentinel API environment to target (`dev`, `uat`, or `prod`).
   * Defaults to `prod`.
   */
  environment?: SentinelEnvironment;

  /**
   * Identifier for the calling client (for example `extension` or `mobile`),
   * sent as the `X-Client-Id` header.
   */
  clientId?: string;

  /**
   * Version of the calling client, sent as the `X-Client-Version` header when
   * provided.
   */
  clientVersion?: string;

  /** Configuration for the underlying TanStack Query client. */
  queryClientConfig?: QueryClientConfig;

  /**
   * Options to pass to `createServicePolicy`. Retries are disabled by default
   * (`maxRetries: 0`) to preserve the single-attempt behaviour of the clients
   * this service replaces; pass `maxRetries` here to opt in.
   */
  policyOptions?: CreateServicePolicyOptions;
};

export class SentinelApiService extends BaseDataService<
  typeof serviceName,
  SentinelApiServiceMessenger
> {
  readonly #fetch: typeof fetch;

  readonly #clientId?: string;

  readonly #clientVersion?: string;

  readonly #environmentDomain: string;

  /**
   * Constructs a new SentinelApiService.
   *
   * @param options - The constructor options. See
   * {@link SentinelApiServiceOptions}.
   * @param options.messenger - The messenger suited for this service.
   * @param options.fetch - The `fetch` function to use for requests. Defaults
   * to the global `fetch`.
   * @param options.environment - The Sentinel API environment to target
   * (`dev`, `uat`, or `prod`). Defaults to `prod`.
   * @param options.clientId - Identifier for the calling client (for example
   * `extension` or `mobile`), sent as the `X-Client-Id` header.
   * @param options.clientVersion - Version of the calling client, sent as the
   * `X-Client-Version` header when provided.
   * @param options.queryClientConfig - Configuration for the underlying
   * TanStack Query client.
   * @param options.policyOptions - Options to pass to `createServicePolicy`.
   * Retries are disabled by default (`maxRetries: 0`) to preserve the
   * single-attempt behaviour of the clients this service replaces; pass
   * `maxRetries` here to opt in.
   */
  constructor({
    messenger,
    fetch: fetchFunction = globalThis.fetch,
    environment = DEFAULT_ENVIRONMENT,
    clientId,
    clientVersion,
    queryClientConfig = {},
    policyOptions = {},
  }: SentinelApiServiceOptions) {
    super({
      name: serviceName,
      messenger,
      queryClientConfig,
      policyOptions: {
        // Disable retries by default so the service is behaviourally
        // backwards-compatible with the single-request clients it replaces.
        // Callers can override via `policyOptions.maxRetries`.
        maxRetries: 0,
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
    this.#environmentDomain = ENVIRONMENT_DOMAIN[environment];
    this.#clientId = clientId;
    this.#clientVersion = clientVersion;

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
    const url = `${this.#buildUrl(NETWORKS_SUBDOMAIN)}${ENDPOINT_NETWORKS}`;

    const result = await this.fetchQuery({
      queryKey: [`${this.name}:getNetworks`],
      staleTime: NETWORKS_STALE_TIME_MS,
      queryFn: async (): Promise<Json> => {
        const headers = await this.#getHeaders();
        const response = await this.#fetch(url, { headers });

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
      queryKey: [`${this.name}:simulateTransactions`, chainId],
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
      queryKey: [`${this.name}:submitRelayTransaction`, request.chainId],
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
   * @returns The relay status: the current status, plus the on-chain
   * transaction hash and error reason once available.
   */
  async getRelayStatus(
    request: SentinelRelayStatusRequest,
  ): Promise<SentinelRelayStatusResponse> {
    const { chainId, uuid } = request;
    const baseUrl = await this.#resolveUrl(chainId, 'relayTransactions');
    const url = `${baseUrl}${ENDPOINT_RELAY_STATUS}/${uuid}`;

    const result = await this.fetchQuery({
      queryKey: [`${this.name}:getRelayStatus`, chainId, uuid],
      staleTime: 0,
      queryFn: async (): Promise<Json> => {
        const headers = await this.#getHeaders();
        const response = await this.#fetch(url, { headers });

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
          ...(first?.errorReason === undefined
            ? {}
            : { errorReason: first.errorReason }),
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
    const headers = await this.#getHeaders();

    const response = await this.#fetch(url, {
      method: 'POST',
      headers: {
        ...headers,
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
   * Builds the outbound headers for a Sentinel request: the client identity
   * headers plus a best-effort `Authorization` bearer token. Token retrieval
   * failures are swallowed so unauthenticated requests still proceed.
   *
   * @returns The headers to attach to the request.
   */
  async #getHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {};

    if (this.#clientId !== undefined) {
      headers['X-Client-Id'] = this.#clientId;
    }

    if (this.#clientVersion !== undefined) {
      headers['X-Client-Version'] = this.#clientVersion;
    }

    try {
      const token = await this.messenger.call(
        'AuthenticationController:getBearerToken',
      );
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
    } catch {
      // Proceed without auth if token retrieval fails.
    }

    return headers;
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

    return this.#buildUrl(network.network);
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

  /**
   * Builds a Sentinel base URL for the given network subdomain, targeting the
   * environment this service was constructed with.
   *
   * @param subdomain - The network subdomain (for example `ethereum-mainnet`).
   * @returns The full base URL.
   */
  #buildUrl(subdomain: string): string {
    return BASE_URL_TEMPLATE.replace('{0}', subdomain).replace(
      '{1}',
      this.#environmentDomain,
    );
  }
}
