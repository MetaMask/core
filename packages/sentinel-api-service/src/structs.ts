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

/**
 * Validates a single network entry from the `/networks` registry. Uses `type`
 * (loose) validation so that additional fields returned by the API do not
 * cause rejection; only the fields we depend on are asserted.
 */
const SentinelNetworkStruct = type({
  network: string(),
  confirmations: optional(boolean()),
  chainID: optional(number()),
  relayTransactions: optional(boolean()),
  smartTransactions: optional(boolean()),
  sendBundle: optional(boolean()),
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
