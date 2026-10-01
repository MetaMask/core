import { ExchangeClient } from '@nktkas/hyperliquid';

/**
 * Create an operation-local SDK client with a fence after signing and before
 * transport dispatch. The shared client and transport remain unchanged.
 *
 * @param client - Captured SDK client, including wallet and nonce configuration.
 * @param beforeDispatch - Authoritative operation precondition.
 * @returns A client whose writes are fenced at the transport boundary.
 */
export function createGuardedHyperLiquidClient(
  client: ExchangeClient,
  beforeDispatch: () => Promise<void>,
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
        await beforeDispatch();
        return transport.request<Result>(endpoint, payload, signal);
      },
    },
  });
}
