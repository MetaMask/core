import { ExchangeClient } from '@nktkas/hyperliquid';
import { describe, expect, it, vi } from 'vitest';

import { HYPERLIQUID_ACCOUNT_SUPPORT_RECHECK_MS } from '../../../src/constants/hyperLiquidConfig.js';
import { PERPS_ERROR_CODES } from '../../../src/perpsErrorCodes.js';
import type { GuardedExchangeHooks } from '../../../src/utils/guardedHyperLiquidClient.js';
import { createGuardedHyperLiquidClient } from '../../../src/utils/guardedHyperLiquidClient.js';
import {
  baseOrder,
  setUpStrategyProvider,
  useStrategyClients,
} from '../../helpers/hyperLiquidStrategyOrders.js';
import { createDeferred } from '../../helpers/serviceMocks.js';

vi.mock('../../../src/services/HyperLiquidClientService');
vi.mock('../../../src/services/HyperLiquidWalletService');
vi.mock('../../../src/services/HyperLiquidSubscriptionService');
vi.mock('../../../src/services/TradingReadinessCache');
vi.mock('../../../src/utils/hyperLiquidValidation', () => ({
  validateOrderParams: vi.fn(),
  validateWithdrawalParams: vi.fn(),
  validateDepositParams: vi.fn(),
  validateCoinExists: vi.fn(),
  validateAssetSupport: vi.fn(),
  validateBalance: vi.fn(),
  getSupportedPaths: vi
    .fn()
    .mockReturnValue([
      'eip155:42161/erc20:0xa0b86a33e6776e681a06e0e1622c5e5e3e6a8b13/default',
      'eip155:1/erc20:0xa0b86a33e6776e681a06e0e1622c5e5e3e6a8b13/default',
    ]),
  getBridgeInfo: vi.fn().mockReturnValue({
    chainId: 'eip155:42161',
    contractAddress: '0x1234567890123456789012345678901234567890',
  }),
  createErrorResult: vi.fn(
    (error: unknown, defaultResponse: Record<string, unknown>) => ({
      ...defaultResponse,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }),
  ),
}));
vi.mock('../../../src/utils/hyperLiquidAdapter', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../src/utils/hyperLiquidAdapter.js')
  >()),
  adaptHyperLiquidLedgerUpdateToUserHistoryItem: vi.fn(),
}));

/**
 * Build a real SDK client over controlled exchange responses.
 *
 * @param routes - Responses keyed by exchange action.
 * @param onAction - Records dispatched actions.
 * @param options - Optional nonce manager and signer overrides.
 * @returns The configured SDK client.
 */
function createExchange(
  routes: ReadonlyMap<string, () => Promise<unknown>>,
  onAction: (action: unknown) => void,
  options: {
    nonceManager?: () => number | Promise<number>;
    signTypedData?: (payload: unknown) => Promise<`0x${string}`>;
  } = {},
): ExchangeClient {
  return new ExchangeClient({
    nonceManager: options.nonceManager,
    wallet: {
      address: '0x1234567890123456789012345678901234567890',
      signTypedData:
        options.signTypedData ??
        (async (_payload: unknown): Promise<`0x${string}`> =>
          `0x${'11'.repeat(64)}1b`),
    },
    transport: {
      isTestnet: false,
      async request<Result>(
        _endpoint: string,
        payload: unknown,
      ): Promise<Result> {
        const { action } = payload as { action: { type: string } };
        onAction(action);
        const result = await routes.get(action.type)?.();
        return (result ?? {
          status: 'ok',
          response: { type: 'default' },
        }) as Result;
      },
    },
  });
}

/**
 * Install the provider's requested fence on the real SDK transport.
 *
 * @param client - The base SDK client.
 * @param guard - The dispatch fence selected by the provider.
 * @param hooks - The additional hooks selected by the provider.
 * @returns The SDK client with the requested fence.
 */
function guardExchange(
  client: ExchangeClient,
  guard?: () => Promise<void>,
  hooks?: GuardedExchangeHooks,
): ExchangeClient {
  return guard
    ? createGuardedHyperLiquidClient(client, guard, undefined, hooks)
    : client;
}

describe('strategy rollback after teardown', () => {
  const childIds = [11, 22, 33];
  it.each([
    {
      params: { orderType: 'twap' as const, twapDuration: 30 },
      placement: 'twapOrder',
      cancellation: 'twapCancel',
      acknowledgement: { status: { running: { twapId: 987 } } },
      cancelled: { status: 'success' },
      expectedChildIds: undefined,
      expectedAction: { type: 'twapCancel', a: 1, t: 987 },
    },
    {
      params: {
        orderType: 'scale' as const,
        scaleMinPrice: '2900',
        scaleMaxPrice: '2950',
        scaleNumOrders: 3,
      },
      placement: 'order',
      cancellation: 'cancel',
      acknowledgement: {
        statuses: childIds.map((oid) => ({ resting: { oid } })),
      },
      cancelled: { statuses: childIds.map(() => 'success') },
      expectedChildIds: [],
      expectedAction: {
        type: 'cancel',
        cancels: childIds.map((orderId) => ({ a: 1, o: orderId })),
      },
    },
  ])(
    'retracts an acknowledged $params.orderType after disconnect',
    async ({
      params,
      placement,
      cancellation,
      acknowledgement,
      cancelled,
      expectedAction,
      expectedChildIds,
    }) => {
      const { provider, mockClientService } = setUpStrategyProvider();
      useStrategyClients({
        info: { userToMultiSigSigners: vi.fn().mockResolvedValue(null) },
      });
      const dispatched = createDeferred<void>();
      const acknowledge = createDeferred<void>();
      const rollback = vi.fn();
      const routes = new Map<string, () => Promise<unknown>>([
        [
          placement,
          async (): Promise<unknown> => {
            dispatched.resolve();
            await acknowledge.promise;
            return {
              status: 'ok',
              response: { type: placement, data: acknowledgement },
            };
          },
        ],
        [
          cancellation,
          async (): Promise<unknown> => ({
            status: 'ok',
            response: { type: cancellation, data: cancelled },
          }),
        ],
      ]);
      const sdk = createExchange(routes, rollback);
      mockClientService.getExchangeClient.mockImplementation(
        guardExchange.bind(undefined, sdk),
      );

      const pending = provider.placeOrder({ ...baseOrder, ...params });
      await Promise.race([
        dispatched.promise,
        pending.then((result) => {
          throw new Error(
            `Placement ended before acknowledgement: ${result.error}`,
          );
        }),
      ]);
      try {
        await provider.disconnect();
      } finally {
        acknowledge.resolve();
      }

      const result = await pending;
      expect(result).toMatchObject({
        success: false,
        error: PERPS_ERROR_CODES.PROVIDER_LIFECYCLE_STALE,
      });
      expect(result.orderId).toBeUndefined();
      expect(result.childOrderIds).toStrictEqual(expectedChildIds);
      expect(rollback).toHaveBeenCalledWith(expectedAction);
    },
  );

  it.each([
    { change: 'account', phase: 'signing', rollbackSignatures: 0 },
    { change: 'network', phase: 'signing', rollbackSignatures: 0 },
    { change: 'support', phase: 'signing', rollbackSignatures: 0 },
    { change: 'support', phase: 'dispatch', rollbackSignatures: 1 },
  ] as const)(
    'blocks TWAP rollback on $change change before $phase',
    async ({ change, phase, rollbackSignatures }) => {
      vi.useFakeTimers({ toFake: ['Date'] });
      const { provider, mockClientService, mockWalletService } =
        setUpStrategyProvider();
      const { infoClient } = useStrategyClients();
      const probe = vi.fn().mockResolvedValue(null);
      infoClient.userToMultiSigSigners = probe;
      const dispatched = createDeferred<void>();
      const acknowledge = createDeferred<void>();
      const queued = createDeferred<void>();
      const resume = createDeferred<void>();
      const recordAction = vi.fn();
      const routes = new Map<string, () => Promise<unknown>>([
        [
          'twapOrder',
          async (): Promise<unknown> => {
            dispatched.resolve();
            await acknowledge.promise;
            return {
              status: 'ok',
              response: {
                type: 'twapOrder',
                data: { status: { running: { twapId: 987 } } },
              },
            };
          },
        ],
      ]);
      let nonce = 1000;
      const pause = {
        signing: async (): Promise<void> => undefined,
        dispatch: async (): Promise<void> => undefined,
      };
      const sign = vi.fn(async (_payload: unknown): Promise<`0x${string}`> => {
        await pause.dispatch();
        return `0x${'11'.repeat(64)}1b`;
      });
      const sdk = createExchange(routes, recordAction, {
        signTypedData: sign,
        nonceManager: async () => {
          await pause.signing();
          nonce += 1;
          return nonce;
        },
      });
      const changeScope = {
        account: (): void => {
          mockWalletService.getUserAddressWithDefault.mockResolvedValue(
            '0x2222222222222222222222222222222222222222',
          );
        },
        network: (): void => {
          mockClientService.isTestnetMode.mockReturnValue(true);
        },
        support: (): void => {
          vi.advanceTimersByTime(HYPERLIQUID_ACCOUNT_SUPPORT_RECHECK_MS);
          probe.mockResolvedValue({ authorizedUsers: [], threshold: 2 });
        },
      };
      mockClientService.getExchangeClient.mockImplementation(
        guardExchange.bind(undefined, sdk),
      );

      try {
        const pending = provider.placeOrder({
          ...baseOrder,
          orderType: 'twap',
          twapDuration: 30,
        });
        const ended = pending.then(({ error }) => {
          throw new Error(`Placement ended before the rollback gate: ${error}`);
        });
        await Promise.race([dispatched.promise, ended]);
        await provider.disconnect();
        mockClientService.getInfoClient.mockImplementation(() => {
          throw new Error('Provider info client was disconnected');
        });
        const signaturesBeforeRollback = sign.mock.calls.length;
        // Initial trading setup can sign before the placement itself.
        pause[phase] = async (): Promise<void> => {
          queued.resolve();
          await resume.promise;
        };
        acknowledge.resolve();
        await Promise.race([queued.promise, ended]);

        changeScope[change]();
        resume.resolve();

        const result = await pending;
        expect(result).toMatchObject({ success: false, orderId: '987' });
        expect(sign).toHaveBeenCalledTimes(
          signaturesBeforeRollback + rollbackSignatures,
        );
        expect(recordAction).not.toHaveBeenCalledWith(
          expect.objectContaining({ type: 'twapCancel' }),
        );
      } finally {
        acknowledge.resolve();
        resume.resolve();
        vi.useRealTimers();
      }
    },
  );
});
