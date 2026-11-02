import { BaseDataService } from '@metamask/base-data-service';
import { handleWhen, HttpError } from '@metamask/controller-utils';
import { validate } from '@metamask/superstruct';
import type { Hex, Json } from '@metamask/utils';

import {
  BASE_URL_TEMPLATE,
  DEFAULT_ENVIRONMENT,
  ENDPOINT_NETWORK,
  ENDPOINT_NETWORKS,
  ENDPOINT_SMART_TRANSACTIONS,
  ENVIRONMENT_DOMAIN,
  NETWORK_STALE_TIME_MS,
  NETWORKS_STALE_TIME_MS,
  NETWORKS_SUBDOMAIN,
  RPC_METHOD_SEND_RELAY,
  RPC_METHOD_SIMULATE,
  serviceName,
} from './constants.js';
import {
  SentinelApiResponseValidationError,
  SentinelChainNotSupportedError,
  SentinelJsonRpcError,
} from './errors.js';
import { projectLogger, createModuleLogger } from './logger.js';
import {
  SentinelSmartTransactionResponseStruct,
  SentinelNetworkRegistryStruct,
  SentinelNetworkStruct,
  SentinelCancelResponseStruct,
  SentinelGetFeesResponseStruct,
  SentinelRelaySubmitResponseStruct,
  SentinelSimulationResponseStruct,
  SentinelSubmitTransactionsResponseStruct,
} from './structs.js';
import type {
  SentinelApiServiceMessenger,
  SentinelApiServiceOptions,
  SentinelCancelRequest,
  SentinelCancelResponse,
  SentinelGetFeesRequest,
  SentinelGetFeesResponse,
  SentinelNetwork,
  SentinelNetworkRegistry,
  SentinelRelaySubmitRequest,
  SentinelRelaySubmitResponse,
  SentinelSimulationRequest,
  SentinelSimulationResponse,
  SentinelSmartTransactionRequest,
  SentinelSmartTransactionResponse,
  SentinelSubmitTransactionsRequest,
  SentinelSubmitTransactionsResponse,
} from './types.js';

const log = createModuleLogger(projectLogger, serviceName);

/**
 * Reads a response body as JSON. Returns undefined when the body is empty or
 * not JSON, so a failed request can still surface its HTTP status.
 *
 * @param response - The response to read.
 * @returns The parsed JSON body, or undefined.
 */
async function readJsonBody(response: Response): Promise<Json | undefined> {
  try {
    return (await response.json()) as Json;
  } catch {
    return undefined;
  }
}

const MESSENGER_EXPOSED_METHODS = [
  'cancel',
  'getFees',
  'getNetwork',
  'getNetworks',
  'simulateTransactions',
  'submitRelayTransaction',
  'submitTransactions',
  'getSmartTransaction',
] as const;

/**
 * Data service that centralises all interactions with the MetaMask Sentinel
 * API (`tx-sentinel-<network>.api.cx.metamask.io`).
 *
 * It exposes one method per Sentinel endpoint:
 * - {@link SentinelApiService.getNetwork} — the configuration of a single
 * network (`/network`), cached since it is stable.
 * - {@link SentinelApiService.getNetworks} — the supported-network registry
 * (`/networks`), cached since it is stable and identical across subdomains.
 * - {@link SentinelApiService.simulateTransactions} — transaction simulation
 * (`infura_simulateTransactions`), used by `@metamask/transaction-controller`
 * and `@metamask/transaction-pay-controller`.
 * - {@link SentinelApiService.submitRelayTransaction} — gas station relay
 * submission (`eth_sendRelayTransaction`), used by the extension and mobile.
 * - {@link SentinelApiService.getSmartTransaction} — smart-transaction status
 * lookup (`/smart-transactions/{uuid}`).
 * - {@link SentinelApiService.getFees} — smart-transaction fee quotes
 * (`POST /v1/networks/{chainId}/getFees`). Not cached.
 * - {@link SentinelApiService.submitTransactions} — signed smart-transaction
 * submission (`POST /v1/networks/{chainId}/submitTransactions`). Not cached.
 * - {@link SentinelApiService.cancel} — smart-transaction cancellation
 * (`POST /v1/networks/{chainId}/cancel`). Not cached.
 *
 * Consumers derive higher-level concerns (whether a chain supports simulation
 * or relay, polling loops, etc.) from the raw endpoint responses.
 */
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
            !(error instanceof SentinelJsonRpcError),
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
   * Fetches the configuration of a single network from the `/network`
   * endpoint of that network's subdomain. The subdomain is resolved from the
   * supported-network registry. The result is cached, as the configuration is
   * stable.
   *
   * @param chainId - The chain ID of the network.
   * @returns The network configuration.
   */
  async getNetwork(chainId: Hex): Promise<SentinelNetwork> {
    const registryEntry = await this.#getRegistryEntry(chainId);

    if (!registryEntry) {
      throw new SentinelChainNotSupportedError(chainId);
    }

    const url = `${this.#buildUrl(registryEntry.network)}${ENDPOINT_NETWORK}`;

    const result = await this.fetchQuery({
      queryKey: [`${this.name}:getNetwork`, chainId],
      staleTime: NETWORK_STALE_TIME_MS,
      queryFn: async (): Promise<Json> => {
        const headers = await this.#getHeaders();

        log('getNetwork', 'Request', url);

        const response = await this.#fetch(url, { headers });

        if (!response.ok) {
          throw new HttpError(
            response.status,
            `Sentinel API: Network request failed with status '${response.status}'`,
          );
        }

        const json = (await response.json()) as Json;

        const [error] = validate(json, SentinelNetworkStruct);
        if (error) {
          throw new SentinelApiResponseValidationError(
            `Sentinel API: Malformed response from network endpoint: ${error.message}`,
          );
        }

        log('getNetwork', 'Response', json);

        return json;
      },
    });

    return result as unknown as SentinelNetwork;
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

        log('getNetworks', 'Request', url);

        const response = await this.#fetch(url, { headers });

        if (!response.ok) {
          throw new HttpError(
            response.status,
            `Sentinel API: Networks request failed with status '${response.status}'`,
          );
        }

        const json: Json = await response.json();

        const [error] = validate(json, SentinelNetworkRegistryStruct);
        if (error) {
          throw new SentinelApiResponseValidationError(
            `Sentinel API: Malformed response from networks endpoint: ${error.message}`,
          );
        }

        log('getNetworks', 'Response', json);

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
   * @param options - Additional options.
   * @param options.getUrl - Optional callback that receives the default
   * Sentinel URL resolved for the chain and returns the URL to use instead.
   * Lets consumers rewrite the request URL (for example to route through the
   * MetaMask Shield proxy) without the service knowing about those concerns.
   * @returns The simulation response.
   */
  async simulateTransactions(
    chainId: Hex,
    request: SentinelSimulationRequest,
    options: { getUrl?: (defaultUrl: string) => string | Promise<string> } = {},
  ): Promise<SentinelSimulationResponse> {
    const defaultUrl = await this.#resolveUrl(chainId, 'confirmations');
    const url = options.getUrl ? await options.getUrl(defaultUrl) : defaultUrl;

    const result = await this.fetchQuery({
      queryKey: [`${this.name}:simulateTransactions`, chainId, request, url],
      staleTime: 0,
      queryFn: async (): Promise<Json> => {
        log('simulateTransactions', 'Request', url, request);

        const rpcResult = await this.#jsonRpc(url, RPC_METHOD_SIMULATE, [
          request,
        ]);

        const [error] = validate(rpcResult, SentinelSimulationResponseStruct);
        if (error) {
          throw new SentinelApiResponseValidationError(
            `Sentinel API: Malformed response from simulation endpoint: ${error.message}`,
          );
        }

        log('simulateTransactions', 'Response', rpcResult);

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
      queryKey: [`${this.name}:submitRelayTransaction`, request],
      staleTime: 0,
      queryFn: async (): Promise<Json> => {
        log('submitRelayTransaction', 'Request', url, request);

        const rpcResult = await this.#jsonRpc(url, RPC_METHOD_SEND_RELAY, [
          request,
        ]);

        const [error] = validate(rpcResult, SentinelRelaySubmitResponseStruct);
        if (error) {
          throw new SentinelApiResponseValidationError(
            `Sentinel API: Malformed response from relay submit endpoint: ${error.message}`,
          );
        }

        log('submitRelayTransaction', 'Response', rpcResult);

        return rpcResult;
      },
    });

    return result as unknown as SentinelRelaySubmitResponse;
  }

  /**
   * Looks up the state of a submitted smart transaction by UUID against the
   * `/smart-transactions/{uuid}` endpoint. Performs a single request; callers
   * own any polling loop. Not cached.
   *
   * @param request - The smart-transaction lookup request.
   * @returns The response envelope containing the smart transaction(s)
   * associated with the requested UUID.
   */
  async getSmartTransaction(
    request: SentinelSmartTransactionRequest,
  ): Promise<SentinelSmartTransactionResponse> {
    const { chainId, uuid } = request;
    const baseUrl = await this.#resolveUrl(chainId, 'relayTransactions');
    const url = `${baseUrl}${ENDPOINT_SMART_TRANSACTIONS}/${uuid}`;

    const result = await this.fetchQuery({
      queryKey: [`${this.name}:getSmartTransaction`, chainId, uuid],
      staleTime: 0,
      queryFn: async (): Promise<Json> => {
        const headers = await this.#getHeaders();

        log('getSmartTransaction', 'Request', url);

        const response = await this.#fetch(url, { headers });

        if (!response.ok) {
          throw new HttpError(
            response.status,
            `Sentinel API: Smart-transaction request failed with status '${response.status}'`,
          );
        }

        const json: Json = await response.json();

        const [error] = validate(json, SentinelSmartTransactionResponseStruct);
        if (error) {
          throw new SentinelApiResponseValidationError(
            `Sentinel API: Malformed response from smart-transactions endpoint: ${error.message}`,
          );
        }

        log('getSmartTransaction', 'Response', json);

        return json;
      },
    });

    return result as unknown as SentinelSmartTransactionResponse;
  }

  /**
   * Quotes gas fees for unsigned smart transactions via
   * `POST /v1/networks/{chainId}/getFees`. Not cached, since a quote goes
   * stale immediately.
   *
   * @param request - The fee quote request.
   * @returns The fee quote response. One entry in `txs` per transaction, in
   * request order.
   */
  async getFees(
    request: SentinelGetFeesRequest,
  ): Promise<SentinelGetFeesResponse> {
    const { chainId, transactions } = request;
    const baseUrl = await this.#resolveUrl(chainId, 'smartTransactions');
    const chainIdDecimal = BigInt(chainId).toString(10);
    const url = `${baseUrl}v1/networks/${chainIdDecimal}/getFees`;

    const result = await this.fetchQuery({
      queryKey: [`${this.name}:getFees`, request],
      staleTime: 0,
      queryFn: async (): Promise<Json> => {
        const headers = await this.#getHeaders();

        log('getFees', 'Request', url, request);

        const response = await this.#fetch(url, {
          method: 'POST',
          headers: {
            ...headers,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ txs: transactions }),
        });

        if (!response.ok) {
          const data = await readJsonBody(response);
          const error = new HttpError(
            response.status,
            `Sentinel API: Fees request failed with status '${response.status}'`,
          );
          if (data !== undefined) {
            Object.assign(error, { data });
          }
          throw error;
        }

        const json = (await response.json()) as Json;

        const [error] = validate(json, SentinelGetFeesResponseStruct);
        if (error) {
          throw new SentinelApiResponseValidationError(
            `Sentinel API: Malformed response from fees endpoint: ${error.message}`,
          );
        }

        log('getFees', 'Response', json);

        return json;
      },
    });

    return result as unknown as SentinelGetFeesResponse;
  }

  /**
   * Submits signed smart transactions via
   * `POST /v1/networks/{chainId}/submitTransactions`. Not cached.
   *
   * @param request - The submit request.
   * @returns The UUID assigned to the submitted batch.
   */
  async submitTransactions(
    request: SentinelSubmitTransactionsRequest,
  ): Promise<SentinelSubmitTransactionsResponse> {
    const { chainId, rawTxs, rawCancelTxs, rawTxsWithMetadata } = request;
    const baseUrl = await this.#resolveUrl(chainId, 'smartTransactions');
    const chainIdDecimal = BigInt(chainId).toString(10);
    const url = `${baseUrl}v1/networks/${chainIdDecimal}/submitTransactions`;

    const result = await this.fetchQuery({
      queryKey: [`${this.name}:submitTransactions`, request],
      staleTime: 0,
      queryFn: async (): Promise<Json> => {
        const headers = await this.#getHeaders();

        log('submitTransactions', 'Request', url, request);

        const response = await this.#fetch(url, {
          method: 'POST',
          headers: {
            ...headers,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            rawTxs,
            ...(rawCancelTxs === undefined ? {} : { rawCancelTxs }),
            ...(rawTxsWithMetadata === undefined ? {} : { rawTxsWithMetadata }),
          }),
        });

        if (!response.ok) {
          const data = await readJsonBody(response);
          const error = new HttpError(
            response.status,
            `Sentinel API: Submit transactions request failed with status '${response.status}'`,
          );
          if (data !== undefined) {
            Object.assign(error, { data });
          }
          throw error;
        }

        const json = (await response.json()) as Json;

        const [error] = validate(
          json,
          SentinelSubmitTransactionsResponseStruct,
        );
        if (error) {
          throw new SentinelApiResponseValidationError(
            `Sentinel API: Malformed response from submit-transactions endpoint: ${error.message}`,
          );
        }

        log('submitTransactions', 'Response', json);

        return json;
      },
    });

    return result as unknown as SentinelSubmitTransactionsResponse;
  }

  /**
   * Cancels a smart transaction via `POST /v1/networks/{chainId}/cancel`.
   * Not cached.
   *
   * @param request - The cancel request.
   * @returns The cancel result. `cancelled` is `true` on success.
   */
  async cancel(
    request: SentinelCancelRequest,
  ): Promise<SentinelCancelResponse> {
    const { chainId, uuid } = request;
    const baseUrl = await this.#resolveUrl(chainId, 'smartTransactions');
    const chainIdDecimal = BigInt(chainId).toString(10);
    const url = `${baseUrl}v1/networks/${chainIdDecimal}/cancel`;

    const result = await this.fetchQuery({
      queryKey: [`${this.name}:cancel`, request],
      staleTime: 0,
      queryFn: async (): Promise<Json> => {
        const headers = await this.#getHeaders();

        log('cancel', 'Request', url, request);

        const response = await this.#fetch(url, {
          method: 'POST',
          headers: {
            ...headers,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ uuid }),
        });

        if (!response.ok) {
          const data = await readJsonBody(response);
          const error = new HttpError(
            response.status,
            `Sentinel API: Cancel request failed with status '${response.status}'`,
          );
          if (data !== undefined) {
            Object.assign(error, { data });
          }
          throw error;
        }

        const json = (await response.json()) as Json;

        const [error] = validate(json, SentinelCancelResponseStruct);
        if (error) {
          throw new SentinelApiResponseValidationError(
            `Sentinel API: Malformed response from cancel endpoint: ${error.message}`,
          );
        }

        log('cancel', 'Response', json);

        return json;
      },
    });

    return result as unknown as SentinelCancelResponse;
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
        `Sentinel API: JSON-RPC request '${method}' failed with status '${response.status}'`,
      );
    }

    const responseJson = (await response.json()) as {
      error?: { code?: number; message?: string };
      result?: Json;
    };

    if (responseJson.error) {
      const { code, message } = responseJson.error;
      throw new SentinelJsonRpcError(
        `Sentinel API: JSON-RPC error: ${message}`,
        code,
      );
    }

    if (responseJson.result === undefined) {
      throw new SentinelJsonRpcError(
        'Sentinel API: JSON-RPC response missing result',
        -32603,
      );
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
    } catch (error: unknown) {
      // Proceed without auth if token retrieval fails.
      log(
        'getHeaders',
        'Auth token unavailable, proceeding unauthenticated',
        error,
      );
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
    capability: 'confirmations' | 'relayTransactions' | 'smartTransactions',
  ): Promise<string> {
    const network = await this.#getRegistryEntry(chainId);

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
  async #getRegistryEntry(chainId: Hex): Promise<SentinelNetwork | undefined> {
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
