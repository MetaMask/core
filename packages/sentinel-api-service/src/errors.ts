/**
 * Thrown when the Sentinel API returns a JSON-RPC error object (for example
 * from `infura_simulateTransactions` or `eth_sendRelayTransaction`).
 */
export class SentinelJsonRpcError extends Error {
  /** The JSON-RPC error code, if provided by the API. */
  readonly code?: number;

  constructor(message: string, code?: number) {
    super(message);
    this.name = 'SentinelJsonRpcError';
    this.code = code;
  }
}

/**
 * Thrown when a Sentinel operation is requested for a chain that the API does
 * not support (either not present in the network registry, or the required
 * capability flag is not enabled for that chain).
 */
export class SentinelChainNotSupportedError extends Error {
  constructor(chainId: string, capability?: string) {
    super(
      capability
        ? `Sentinel API: Does not support '${capability}' for chain ${chainId}`
        : `Sentinel API: Does not support chain ${chainId}`,
    );
    this.name = 'SentinelChainNotSupportedError';
  }
}

/**
 * Thrown when a response from the Sentinel API fails superstruct validation.
 * Indicates a contract mismatch between client and server. Excluded from the
 * service policy's retry filter, since retrying will not fix a malformed
 * response.
 */
export class SentinelApiResponseValidationError extends Error {
  constructor(message?: string) {
    super(message ?? 'Sentinel API: Malformed response received');
    this.name = 'SentinelApiResponseValidationError';
  }
}
