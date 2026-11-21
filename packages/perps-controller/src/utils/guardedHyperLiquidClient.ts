import { ExchangeClient } from '@nktkas/hyperliquid';

export type GuardedExchangeHooks = {
  beforeSign?: () => Promise<void>;
  onExchangeResult?: (
    outcome: { answer: unknown } | { error: unknown },
  ) => void;
};

/**
 * Create an operation-local SDK client with a fence after signing and before
 * transport dispatch. The shared client and transport remain unchanged.
 *
 * @param client - Captured SDK client, including wallet and nonce configuration.
 * @param beforeDispatch - Authoritative operation precondition.
 * @param onDispatchRefused - Reports the exact signed exchange payload when
 * the precondition refuses dispatch.
 * @param hooks - Optional signer fence and observer for actual venue results.
 * @returns A client whose writes are fenced at the transport boundary.
 */
export function createGuardedHyperLiquidClient(
  client: ExchangeClient,
  beforeDispatch: () => Promise<void>,
  onDispatchRefused?: (payload: unknown) => void,
  hooks?: GuardedExchangeHooks,
): ExchangeClient {
  const { transport, wallet } = client.config_;
  const { beforeSign, onExchangeResult } = hooks ?? {};
  const guardedWallet = beforeSign
    ? new Proxy(wallet, {
        get(target, property): unknown {
          const member: unknown = Reflect.get(target, property, target);
          if (typeof member !== 'function') {
            return member;
          }
          if (property === 'signTypedData' || property === '_signTypedData') {
            // The SDK uses the signer function's arity to identify the wallet.
            return new Proxy(member, {
              async apply(
                signer,
                _receiver,
                args: unknown[],
              ): Promise<unknown> {
                await beforeSign();
                return await Reflect.apply(signer, target, args);
              },
            });
          }
          const bound: unknown = member.bind(target);
          return bound;
        },
      })
    : wallet;
  return new ExchangeClient({
    ...client.config_,
    wallet: guardedWallet,
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
        if (endpoint !== 'exchange' || !onExchangeResult) {
          return transport.request<Result>(endpoint, payload, signal);
        }
        const answer = await transport
          .request<Result>(endpoint, payload, signal)
          .catch((error: unknown) => {
            onExchangeResult({ error });
            throw error;
          });
        onExchangeResult({ answer });
        return answer;
      },
    },
  });
}
