/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { SentinelApiService } from './sentinel-api-service';

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
 * Determines whether simulation is supported for a given chain.
 *
 * @param chainId - The chain ID to check.
 * @returns True if simulation is supported.
 */
export type SentinelApiServiceIsSimulationSupportedAction = {
  type: `SentinelApiService:isSimulationSupported`;
  handler: SentinelApiService['isSimulationSupported'];
};

/**
 * Determines whether the gas station relay is supported for a given chain.
 *
 * @param chainId - The chain ID to check.
 * @returns True if the relay is supported.
 */
export type SentinelApiServiceIsRelaySupportedAction = {
  type: `SentinelApiService:isRelaySupported`;
  handler: SentinelApiService['isRelaySupported'];
};

/**
 * Simulates transactions against the Sentinel API via
 * `infura_simulateTransactions`. Not cached, since each request body is
 * unique and stale simulations must not be reused.
 *
 * @param chainId - The chain ID to simulate on.
 * @param request - The simulation request.
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
 * Retrieves the current status of a submitted relay transaction. Performs a
 * single request; callers own any polling loop. Not cached.
 *
 * @param request - The relay status request.
 * @returns The normalized relay status.
 */
export type SentinelApiServiceGetRelayStatusAction = {
  type: `SentinelApiService:getRelayStatus`;
  handler: SentinelApiService['getRelayStatus'];
};

/**
 * Union of all SentinelApiService action types.
 */
export type SentinelApiServiceMethodActions =
  | SentinelApiServiceGetNetworksAction
  | SentinelApiServiceIsSimulationSupportedAction
  | SentinelApiServiceIsRelaySupportedAction
  | SentinelApiServiceSimulateTransactionsAction
  | SentinelApiServiceSubmitRelayTransactionAction
  | SentinelApiServiceGetRelayStatusAction;
