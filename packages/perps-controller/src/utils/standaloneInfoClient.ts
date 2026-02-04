import { HttpTransport, InfoClient } from '@nktkas/hyperliquid';

import { PERPS_CONSTANTS } from '../constants/perpsConfig';

/**
 * Options for creating a standalone info client.
 */
export type StandaloneInfoClientOptions = {
  /** Whether to use testnet API endpoint */
  isTestnet: boolean;
  /** Request timeout in ms (default: CONNECTION_TIMEOUT_MS) */
  timeout?: number;
};

/**
 * Creates a standalone InfoClient for lightweight read-only queries.
 * Does not require full perps initialization (no wallet, WebSocket, etc.)
 *
 * Use cases:
 * - Discovery queries (checking if perps market exists)
 * - Portfolio analytics outside perps context
 * - Price feeds without full initialization
 *
 * @param options - Configuration options
 * @param options.isTestnet - Whether to use testnet API endpoint
 * @param options.timeout - Request timeout in ms (default: CONNECTION_TIMEOUT_MS)
 * @returns InfoClient instance
 * @example
 * ```typescript
 * const infoClient = createStandaloneInfoClient({ isTestnet: false });
 * const meta = await infoClient.meta();
 * ```
 */
export const createStandaloneInfoClient = (
  options: StandaloneInfoClientOptions,
): InfoClient => {
  const { isTestnet, timeout = PERPS_CONSTANTS.ConnectionTimeoutMs } = options;

  const httpTransport = new HttpTransport({
    isTestnet,
    timeout,
  });

  return new InfoClient({ transport: httpTransport });
};
