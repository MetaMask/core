import {
  array,
  boolean,
  nullable,
  number,
  optional,
  record,
  string,
  type,
} from '@metamask/superstruct';
import { StrictHexStruct } from '@metamask/utils';

/**
 * Validates a single network entry from the `/networks` registry, or the
 * single network configuration from the `/network` endpoint. Uses `type`
 * (loose) validation so that additional fields returned by the API do not
 * cause rejection; only the fields we depend on are asserted.
 */
export const SentinelNetworkStruct = type({
  chainID: optional(number()),
  confirmations: optional(boolean()),
  cubistSigners: optional(array(StrictHexStruct)),
  network: string(),
  relayTransactions: optional(boolean()),
  sendBundle: optional(boolean()),
  simulationIncludeFees: optional(boolean()),
  smartTransactions: optional(boolean()),
});

/**
 * Validates the `/networks` registry response (a map keyed by decimal chain
 * ID).
 */
export const SentinelNetworkRegistryStruct = record(
  string(),
  SentinelNetworkStruct,
);

/**
 * Validates a simulated-transaction result. Loose to tolerate the many
 * optional fields the API may return.
 */
const SentinelSimulationResponseTransactionStruct = type({
  error: optional(string()),
});

/**
 * Validates the top-level simulation response. Only the `transactions` array
 * is required by consumers.
 */
export const SentinelSimulationResponseStruct = type({
  transactions: array(SentinelSimulationResponseTransactionStruct),
});

/**
 * Validates the response from submitting a relay transaction.
 */
export const SentinelRelaySubmitResponseStruct = type({
  uuid: string(),
});

/**
 * Validates a single entry in the smart-transactions endpoint response.
 */
const SentinelSmartTransactionStruct = type({
  hash: optional(string()),
  status: string(),
  errorReason: optional(nullable(string())),
});

/**
 * Validates the smart-transactions endpoint response body (a list of
 * transactions).
 */
export const SentinelSmartTransactionResponseStruct = type({
  transactions: array(SentinelSmartTransactionStruct),
});
