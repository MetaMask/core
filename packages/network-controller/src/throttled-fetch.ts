/**
 * Configuration for network throttling by chain ID.
 * Maps chain IDs (in hex format) to delay in milliseconds.
 */
export const NETWORK_THROTTLE_CONFIG: Record<string, number> = {
  // '0x2019': 2000, // Klaytn - 2s delay
  // '0x504': 1000, // Moonbeam - 1s delay
  // '0x505': 1000, // Moonriver - 1s delay
  // '0x4e454152': 1500, // Aurora - 1.5s delay
  '0x1': 10000, // Ethereum Mainnet - 10s delay
};

/**
 * Creates a throttled fetch function that adds artificial delays before making requests.
 * Useful for testing slow network conditions.
 *
 * @param delayMs - The delay in milliseconds to add before each request
 * @param originalFetch - The original fetch function to wrap
 * @returns A throttled fetch function
 */
export function createThrottledFetch(
  delayMs: number,
  originalFetch: typeof fetch,
): typeof fetch {
  if (delayMs <= 0) {
    return originalFetch;
  }

  return async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    // Add artificial delay before making the request
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return originalFetch(input, init);
  };
}

/**
 * Creates a fetch function that applies throttling based on the chain ID.
 * Extracts chain ID from the RPC endpoint URL to determine the appropriate delay.
 *
 * @param rpcEndpointUrl - The RPC endpoint URL (may contain chain ID context)
 * @param chainId - The chain ID in hex format (e.g., '0x2019')
 * @param originalFetch - The original fetch function to wrap
 * @param throttleConfig - Optional custom throttle configuration map
 * @returns A throttled fetch function if configured for this chain, otherwise the original
 */
export function createThrottledFetchForChainId(
  rpcEndpointUrl: string,
  chainId: string,
  originalFetch: typeof fetch,
  throttleConfig: Record<string, number> = NETWORK_THROTTLE_CONFIG,
): typeof fetch {
  const delayMs = throttleConfig[chainId] || 0;

  if (delayMs === 0) {
    return originalFetch;
  }

  console.log(
    `[NetworkThrottle] Applying ${delayMs}ms delay to chain ${chainId} (${rpcEndpointUrl})`,
  );

  return createThrottledFetch(delayMs, originalFetch);
}

/**
 * Creates a wrapped getRpcServiceOptions function that applies network throttling
 * based on chain ID. This is meant to be used in NetworkController initialization.
 *
 * @param originalGetRpcServiceOptions - The original getRpcServiceOptions function
 * @param getChainIdForUrl - Function to get the chain ID for a given RPC endpoint URL
 * @param throttleConfig - Optional custom throttle configuration map
 * @returns A wrapped getRpcServiceOptions function that applies throttling
 *
 * @example
 * ```typescript
 * const networkController = new NetworkController({
 *   getRpcServiceOptions: createThrottledGetRpcServiceOptions(
 *     (rpcEndpointUrl) => ({ fetch, btoa }),
 *     (rpcEndpointUrl) => '0x1', // Get chainId from your config
 *   ),
 *   // ... other options
 * });
 * ```
 */
export function createThrottledGetRpcServiceOptions(
  originalGetRpcServiceOptions: (rpcEndpointUrl: string) => {
    fetch: typeof fetch;
    btoa: typeof btoa;
    [key: string]: unknown;
  },
  getChainIdForUrl: (rpcEndpointUrl: string) => string | undefined,
  throttleConfig: Record<string, number> = NETWORK_THROTTLE_CONFIG,
): typeof originalGetRpcServiceOptions {
  return (rpcEndpointUrl: string) => {
    const options = originalGetRpcServiceOptions(rpcEndpointUrl);
    const chainId = getChainIdForUrl(rpcEndpointUrl);

    if (!chainId) {
      return options;
    }

    const throttledFetch = createThrottledFetchForChainId(
      rpcEndpointUrl,
      chainId,
      options.fetch,
      throttleConfig,
    );

    return {
      ...options,
      fetch: throttledFetch,
    };
  };
}
