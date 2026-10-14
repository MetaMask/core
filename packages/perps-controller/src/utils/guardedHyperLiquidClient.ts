import { ExchangeClient } from '@nktkas/hyperliquid';

/**
 * Create an operation-local SDK client with a fence after signing and before
 * transport dispatch. The shared client and transport remain unchanged.
 *
 * @param client - Captured SDK client, including wallet and nonce configuration.
 * @param beforeDispatch - Authoritative operation precondition.
 * @param onDispatchRefused - Reports the exact signed exchange payload when
 * the precondition refuses dispatch.
 * @returns A client whose writes are fenced at the transport boundary.
 */
export function createGuardedHyperLiquidClient(
  client: ExchangeClient,
  beforeDispatch: () => Promise<void>,
  onDispatchRefused?: (payload: unknown) => void,
): ExchangeClient {
  const { transport } = client.config_;
  return new ExchangeClient({
    ...client.config_,
    transport: {
      isTestnet: transport.isTestnet,
      async request<Result>(
        endpoint: 'info' | 'exchange',
        payload: unknown,
        signal?: AbortSignal,
      ): Promise<Result> {
        try {
          await beforeDispatch();
        } catch (error) {
          if (endpoint === 'exchange') {
            try {
              onDispatchRefused?.(payload);
            } catch {
              // Reporting must preserve the authoritative refusal error.
            }
          }
          throw error;
        }
        return transport.request<Result>(endpoint, payload, signal);
      },
    },
  });
}
