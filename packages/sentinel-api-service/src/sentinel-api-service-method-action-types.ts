/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { SentinelApiService } from './sentinel-api-service.js';

/**
 * Fetches the configuration of a single network from the `/network`
 * endpoint of that network's subdomain. The subdomain is resolved from the
 * supported-network registry. The result is cached, as the configuration is
 * stable.
 *
 * @param chainId - The chain ID of the network.
 * @returns The network configuration.
 */
export type SentinelApiServiceGetNetworkAction = {
  type: `SentinelApiService:getNetwork`;
  handler: SentinelApiService['getNetwork'];
};

/**
 * Fetches the Sentinel supported-network registry. The result is cached, as
 * the registry is stable and identical across network subdomains.
 *
 * @returns The network registry, keyed by decimal chain ID.
 */
export type SentinelApiServiceGetNetworksAction = {
  type: `SentinelApiService:getNetworks`;
  handler: SentinelApiService['getNetworks'];
};

/**
 * Simulates transactions against the Sentinel API via
 * `infura_simulateTransactions`. Not cached, since each request body is
 * unique and stale simulations must not be reused. An authorization
 * override is represented in the query key by its SHA-256 digest so
 * concurrent calls only share an in-flight request when they use the same
 * token, without the token leaving the service in cache events.
 *
 * @param chainId - The chain ID to simulate on.
 * @param request - The simulation request.
 * @param options - Additional options.
 * @param options.getUrl - Optional callback that receives the default
 * Sentinel URL resolved for the chain and returns the URL to use instead,
 * or an object with that URL and an `authorization` header value. Lets
 * consumers rewrite the request URL (for example to route through the
 * MetaMask Shield proxy) without the service knowing about those concerns.
 * When `authorization` is returned, it replaces the bearer token.
 * @returns The simulation response.
 */
export type SentinelApiServiceSimulateTransactionsAction = {
  type: `SentinelApiService:simulateTransactions`;
  handler: SentinelApiService['simulateTransactions'];
};

/**
 * Submits a signed relay (gas station) transaction to the Sentinel API via
 * `eth_sendRelayTransaction`. Not cached.
 *
 * @param request - The relay submit request.
 * @returns The relay submit response containing the tracking UUID.
 */
export type SentinelApiServiceSubmitRelayTransactionAction = {
  type: `SentinelApiService:submitRelayTransaction`;
  handler: SentinelApiService['submitRelayTransaction'];
};

/**
 * Looks up the state of a submitted smart transaction by UUID against the
 * `/smart-transactions/{uuid}` endpoint. Performs a single request; callers
 * own any polling loop. Not cached.
 *
 * @param request - The smart-transaction lookup request.
 * @returns The response envelope containing the smart transaction(s)
 * associated with the requested UUID.
 */
export type SentinelApiServiceGetSmartTransactionAction = {
  type: `SentinelApiService:getSmartTransaction`;
  handler: SentinelApiService['getSmartTransaction'];
};

/**
 * Union of all SentinelApiService action types.
 */
export type SentinelApiServiceMethodActions =
  | SentinelApiServiceGetNetworkAction
  | SentinelApiServiceGetNetworksAction
  | SentinelApiServiceSimulateTransactionsAction
  | SentinelApiServiceSubmitRelayTransactionAction
  | SentinelApiServiceGetSmartTransactionAction;
