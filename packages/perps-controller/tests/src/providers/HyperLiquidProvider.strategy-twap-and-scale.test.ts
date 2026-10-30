import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mocked } from 'vitest';

import { BUILDER_FEE_CONFIG } from '../../../src/constants/hyperLiquidConfig.js';
import {
  HYPERLIQUID_TWAP_LIMITS,
  SUBSCRIPTION_CLOID_FLAGS,
} from '../../../src/constants/perpsConfig.js';
import { PERPS_ERROR_CODES } from '../../../src/perpsErrorCodes.js';
import { HyperLiquidProvider } from '../../../src/providers/HyperLiquidProvider.js';
import { HyperLiquidSubscriptionService } from '../../../src/services/HyperLiquidSubscriptionService.js';
import type {
  Order,
  OrderParams,
  OrderResult,
} from '../../../src/types/index.js';
import { HYPERLIQUID_SCALE_CLOID_MARKER } from '../../../src/utils/hyperLiquidAdapter.js';
import {
  hasFeeReductionAppliedFlag,
  readSubscriptionCloidFlags,
} from '../../../src/utils/subscriptionFeeWaiver.js';
import {
  activeEthTwapHistory,
  baseOrder,
  createClearinghouseBalance,
  createTestProvider,
  setUpStrategyProvider,
  useStrategyClients,
} from '../../helpers/hyperLiquidStrategyOrders.js';
import { createDeferred } from '../../helpers/serviceMocks.js';

vi.mock('../../../src/services/HyperLiquidClientService');
vi.mock('../../../src/services/HyperLiquidWalletService');
vi.mock('../../../src/services/HyperLiquidSubscriptionService');

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
  createErrorResult: vi.fn((error, defaultResponse) => ({
    ...defaultResponse,
    success: false,
    error: error instanceof Error ? error.message : String(error),
  })),
}));

// Mock adapter functions
vi.mock('../../../src/utils/hyperLiquidAdapter', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../../src/utils/hyperLiquidAdapter.js')
    >();
  return {
    ...actual,
    adaptHyperLiquidLedgerUpdateToUserHistoryItem: vi.fn((updates) => {
      // Return mock history items based on input
      if (!updates || !Array.isArray(updates) || updates.length === 0) {
        return [];
      }
      return updates.map((_update: unknown) => ({
        type: 'deposit' as const,
        amount: '100',
        timestamp: Date.now(),
        hash: '0x123',
      }));
    }),
  };
});

// Mock TradingReadinessCache - global singleton for signing operation caching
vi.mock('../../../src/services/TradingReadinessCache');

describe('HyperLiquidProvider - strategy order types', () => {
  let provider: HyperLiquidProvider;
  let mockSubscriptionService: Mocked<HyperLiquidSubscriptionService>;

  beforeEach(() => {
    ({ provider, mockSubscriptionService } = setUpStrategyProvider());
  });

  describe('TWAP placement', () => {
    it('does not request builder-fee approval', async () => {
      const { exchangeClient } = useStrategyClients({
        info: { maxBuilderFee: vi.fn().mockResolvedValue(0) },
      });

      await provider.placeOrder({
        ...baseOrder,
        orderType: 'twap',
        twapDuration: 30,
      });

      expect(exchangeClient.approveBuilderFee).not.toHaveBeenCalled();
      expect(exchangeClient.twapOrder).toHaveBeenCalledWith({
        twap: expect.objectContaining({ a: 1, m: 30 }),
      });
    });

    it('approves the builder fee when a standard order follows a TWAP', async () => {
      const { exchangeClient } = useStrategyClients({
        info: { maxBuilderFee: vi.fn().mockResolvedValue(0) },
      });

      await provider.placeOrder({
        ...baseOrder,
        orderType: 'twap',
        twapDuration: 30,
      });
      expect(exchangeClient.approveBuilderFee).not.toHaveBeenCalled();

      await provider.placeOrder({
        ...baseOrder,
        orderType: 'market',
      });

      expect(exchangeClient.approveBuilderFee).toHaveBeenCalledTimes(1);
    });

    it.each([
      [undefined, PERPS_ERROR_CODES.ORDER_TWAP_DURATION_REQUIRED],
      [1.5, PERPS_ERROR_CODES.ORDER_TWAP_DURATION_INVALID],
      [0, PERPS_ERROR_CODES.ORDER_TWAP_DURATION_INVALID],
      [
        HYPERLIQUID_TWAP_LIMITS.MaxDurationMinutes + 1,
        PERPS_ERROR_CODES.ORDER_TWAP_DURATION_INVALID,
      ],
      [2 ** 53, PERPS_ERROR_CODES.ORDER_TWAP_DURATION_INVALID],
    ])(
      'rejects provider-level TWAP duration %p before submission',
      async (twapDuration, expectedError) => {
        const { exchangeClient } = useStrategyClients();

        const result = await provider.placeOrder({
          ...baseOrder,
          orderType: 'twap',
          twapDuration,
        } satisfies OrderParams);

        expect(result.error).toBe(expectedError);
        expect(exchangeClient.twapOrder).not.toHaveBeenCalled();
      },
    );

    it('still approves the builder fee when a standard order joins TWAP setup', async () => {
      const spotMetaRequestStarted = createDeferred<void>();
      const pendingSpotMeta = createDeferred<{
        tokens: { name: string; tokenId: string; index: number }[];
        universe: never[];
      }>();
      const { exchangeClient } = useStrategyClients({
        info: {
          maxBuilderFee: vi.fn().mockResolvedValue(0),
          perpDexs: vi.fn().mockResolvedValue([null]),
          spotMeta: vi.fn().mockImplementation(() => {
            spotMetaRequestStarted.resolve();
            return pendingSpotMeta.promise;
          }),
        },
      });
      provider = createTestProvider({ hip3Enabled: true });

      const twapOrder = provider.placeOrder({
        ...baseOrder,
        orderType: 'twap',
        twapDuration: 30,
      });
      await spotMetaRequestStarted.promise;
      const standardOrder = provider.placeOrder({
        ...baseOrder,
        orderType: 'market',
      });
      pendingSpotMeta.resolve({
        tokens: [{ name: 'USDC', tokenId: '0xdef456', index: 0 }],
        universe: [],
      });

      await Promise.all([twapOrder, standardOrder]);
      expect(exchangeClient.approveBuilderFee).toHaveBeenCalledTimes(1);
    });

    it('does not restore spot metadata after disconnect', async () => {
      provider = createTestProvider({
        hip3Enabled: true,
        allowlistMarkets: ['xyz:*'],
      });
      const spotMetaRequestStarted = createDeferred<void>();
      const pendingSpotMeta = createDeferred<{
        tokens: { name: string; tokenId: string; index: number }[];
        universe: never[];
      }>();
      const spotMeta = vi
        .fn()
        .mockImplementationOnce(() => {
          spotMetaRequestStarted.resolve();
          return pendingSpotMeta.promise;
        })
        .mockResolvedValue({
          tokens: [{ name: 'USDC', tokenId: '0xdef456', index: 0 }],
          universe: [],
        });
      useStrategyClients({ info: { spotMeta } });

      const staleOrder = provider.placeOrder({
        ...baseOrder,
        orderType: 'market',
      });
      await spotMetaRequestStarted.promise;
      const disconnectPromise = provider.disconnect();
      pendingSpotMeta.resolve({
        tokens: [{ name: 'USDC', tokenId: '0xdef456', index: 0 }],
        universe: [],
      });

      expect(await staleOrder).toMatchObject({
        success: false,
        error: PERPS_ERROR_CODES.PROVIDER_LIFECYCLE_STALE,
      });
      expect(await disconnectPromise).toStrictEqual({ success: true });

      expect(await provider.initialize()).toMatchObject({
        success: true,
      });
      expect(
        await provider.placeOrder({
          ...baseOrder,
          orderType: 'market',
        }),
      ).toMatchObject({ success: true });
      expect(spotMeta).toHaveBeenCalledTimes(2);
    });

    it('submits the venue TWAP action rather than an order', async () => {
      const { exchangeClient } = useStrategyClients();

      const result = await provider.placeOrder({
        ...baseOrder,
        orderType: 'twap',
        twapDuration: 30,
        twapRandomize: true,
      } satisfies OrderParams);

      expect(result.success).toBe(true);
      expect(exchangeClient.twapOrder).toHaveBeenCalledWith({
        twap: {
          a: 1,
          b: true,
          s: '1',
          r: false,
          m: 30,
          t: true,
        },
      });
      expect(exchangeClient.order).not.toHaveBeenCalled();
    });

    it('returns the venue TWAP id as the handle', async () => {
      useStrategyClients();

      const result = await provider.placeOrder({
        ...baseOrder,
        orderType: 'twap',
        twapDuration: 30,
      } satisfies OrderParams);

      expect(result).toMatchObject({
        success: true,
        orderId: '987',
        submittedSize: '1',
      });
    });

    it('defaults randomize and reduce-only to false', async () => {
      const { exchangeClient } = useStrategyClients();

      await provider.placeOrder({
        ...baseOrder,
        orderType: 'twap',
        twapDuration: 5,
      } satisfies OrderParams);

      expect(exchangeClient.twapOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          twap: expect.objectContaining({ r: false, t: false }),
        }),
      );
    });

    it('surfaces a venue rejection as a failed result', async () => {
      useStrategyClients({
        exchange: {
          twapOrder: vi.fn().mockResolvedValue({
            status: 'ok',
            response: {
              type: 'twapOrder',
              data: { status: { error: 'Insufficient margin' } },
            },
          }),
        },
      });

      const result = await provider.placeOrder({
        ...baseOrder,
        orderType: 'twap',
        twapDuration: 30,
      } satisfies OrderParams);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Insufficient margin');
    });

    it('surfaces a minimum-value rejection without resubmitting', async () => {
      const { exchangeClient } = useStrategyClients({
        exchange: {
          twapOrder: vi
            .fn()
            .mockRejectedValue(
              new Error('Order must have minimum value of $10'),
            ),
        },
      });

      const result = await provider.placeOrder({
        ...baseOrder,
        orderType: 'twap',
        twapDuration: 30,
      } satisfies OrderParams);

      expect(result.success).toBe(false);
      expect(result.error).toContain('minimum value of $10');
      expect(exchangeClient.twapOrder).toHaveBeenCalledTimes(1);
      expect(exchangeClient.order).not.toHaveBeenCalled();
    });

    it.each(['987', Number.NaN, Number.POSITIVE_INFINITY, -1, 1.5])(
      'rejects malformed TWAP response id %p',
      async (twapId) => {
        useStrategyClients({
          exchange: {
            twapOrder: vi.fn().mockResolvedValue({
              status: 'ok',
              response: {
                type: 'twapOrder',
                data: { status: { running: { twapId } } },
              },
            }),
          },
        });

        const result = await provider.placeOrder({
          ...baseOrder,
          orderType: 'twap',
          twapDuration: 30,
        } satisfies OrderParams);

        expect(result.success).toBe(false);
        expect(result.orderId).toBeUndefined();
        expect(result.error).toBe('TWAP order rejected');
      },
    );
  });

  describe('TWAP cancellation', () => {
    it('uses the TWAP cancel endpoint, never the order cancel endpoint', async () => {
      const { exchangeClient } = useStrategyClients({
        info: {
          twapHistory: vi.fn().mockResolvedValue(activeEthTwapHistory),
        },
      });

      const result = await provider.cancelOrder({
        orderId: '987',
        symbol: 'ETH',
        orderType: 'twap',
        providerId: 'hyperliquid',
      });

      expect(result).toStrictEqual({ success: true, orderId: '987' });
      expect(exchangeClient.twapCancel).toHaveBeenCalledWith({ a: 1, t: 987 });
      expect(exchangeClient.cancel).not.toHaveBeenCalled();
      expect(exchangeClient.approveBuilderFee).not.toHaveBeenCalled();
    });

    it.each(['987junk', 'NaN', '-1', '1.5', '9007199254740992'])(
      'rejects malformed TWAP handle %p before signing',
      async (orderId) => {
        const { exchangeClient } = useStrategyClients();

        const result = await provider.cancelOrder({
          orderId,
          symbol: 'ETH',
          orderType: 'twap',
          providerId: 'hyperliquid',
        });

        expect(result).toStrictEqual({
          success: false,
          orderId,
          error: PERPS_ERROR_CODES.ORDER_STRATEGY_HANDLE_UNKNOWN,
        });
        expect(exchangeClient.twapCancel).not.toHaveBeenCalled();
        expect(exchangeClient.approveBuilderFee).not.toHaveBeenCalled();
      },
    );

    it('treats an already-finished TWAP cancel as successful', async () => {
      useStrategyClients({
        exchange: {
          twapCancel: vi.fn().mockResolvedValue({
            status: 'ok',
            response: {
              type: 'twapCancel',
              data: { status: { error: 'Twap not found' } },
            },
          }),
        },
        info: {
          twapHistory: vi.fn().mockResolvedValue(activeEthTwapHistory),
        },
      });

      const result = await provider.cancelOrder({
        orderId: '987',
        symbol: 'ETH',
        orderType: 'twap',
        providerId: 'hyperliquid',
      });

      expect(result).toStrictEqual({ success: true, orderId: '987' });
    });

    it('reports a refused TWAP cancel as a failure', async () => {
      useStrategyClients({
        exchange: {
          twapCancel: vi.fn().mockResolvedValue({
            status: 'ok',
            response: {
              type: 'twapCancel',
              data: { status: { error: 'Invalid nonce' } },
            },
          }),
        },
        info: {
          twapHistory: vi.fn().mockResolvedValue(activeEthTwapHistory),
        },
      });

      const result = await provider.cancelOrder({
        orderId: '987',
        symbol: 'ETH',
        orderType: 'twap',
        providerId: 'hyperliquid',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe(PERPS_ERROR_CODES.EXCHANGE_INVALID_NONCE);
    });

    it('rejects a handle that neither tracking nor venue history can authenticate', async () => {
      const { exchangeClient } = useStrategyClients();

      const result = await provider.cancelOrder({
        orderId: '654321',
        symbol: 'ETH',
        orderType: 'twap',
        providerId: 'hyperliquid',
      });

      expect(result).toStrictEqual({
        success: false,
        orderId: '654321',
        error: PERPS_ERROR_CODES.ORDER_STRATEGY_HANDLE_UNKNOWN,
      });
      expect(exchangeClient.twapCancel).not.toHaveBeenCalled();
    });

    it('cancels an untracked TWAP when venue history is temporarily unavailable', async () => {
      const { exchangeClient } = useStrategyClients({
        info: {
          twapHistory: vi
            .fn()
            .mockRejectedValue(new Error('History unavailable')),
        },
      });

      const result = await provider.cancelOrder({
        orderId: '987',
        symbol: 'ETH',
        orderType: 'twap',
        providerId: 'hyperliquid',
      });

      expect(result).toStrictEqual({ success: true, orderId: '987' });
      expect(exchangeClient.twapCancel).toHaveBeenCalledWith({ a: 1, t: 987 });
    });

    it('does not authenticate an unknown TWAP through a failed history read', async () => {
      const { exchangeClient } = useStrategyClients({
        exchange: {
          twapCancel: vi.fn().mockResolvedValue({
            status: 'ok',
            response: {
              type: 'twapCancel',
              data: { status: { error: 'Twap not found' } },
            },
          }),
        },
        info: {
          twapHistory: vi
            .fn()
            .mockRejectedValue(new Error('History unavailable')),
        },
      });

      const result = await provider.cancelOrder({
        orderId: '987',
        symbol: 'ETH',
        orderType: 'twap',
        providerId: 'hyperliquid',
      });

      expect(result).toStrictEqual({
        success: false,
        orderId: '987',
        error: PERPS_ERROR_CODES.ORDER_STRATEGY_HANDLE_UNKNOWN,
      });
      expect(exchangeClient.twapCancel).toHaveBeenCalledWith({ a: 1, t: 987 });
    });

    it('preserves handle ownership across provider recreation', async () => {
      const { exchangeClient } = useStrategyClients();
      const placed = await provider.placeOrder({
        ...baseOrder,
        orderType: 'twap',
        twapDuration: 30,
      } satisfies OrderParams);
      await provider.disconnect();
      const recreatedProvider = createTestProvider({
        initialAssetMapping: [
          ['BTC', 0],
          ['ETH', 1],
        ],
      });

      expect(
        await recreatedProvider.cancelOrder({
          orderId: placed.orderId,
          symbol: 'BTC',
          orderType: 'twap',
          providerId: 'hyperliquid',
        }),
      ).toStrictEqual({
        success: false,
        orderId: placed.orderId,
        error: PERPS_ERROR_CODES.ORDER_STRATEGY_HANDLE_UNKNOWN,
      });
      expect(exchangeClient.twapCancel).not.toHaveBeenCalled();

      expect(
        await recreatedProvider.cancelOrder({
          orderId: placed.orderId,
          symbol: 'ETH',
          orderType: 'twap',
          providerId: 'hyperliquid',
        }),
      ).toStrictEqual({
        success: true,
        orderId: placed.orderId,
      });
      expect(exchangeClient.twapCancel).toHaveBeenCalledWith({ a: 1, t: 987 });
    });

    it('leaves an ordinary cancel on the order endpoint', async () => {
      const { exchangeClient } = useStrategyClients();

      await provider.cancelOrder({ orderId: '123', symbol: 'ETH' });

      expect(exchangeClient.cancel).toHaveBeenCalledWith({
        cancels: [{ a: 1, o: 123 }],
      });
      expect(exchangeClient.twapCancel).not.toHaveBeenCalled();
      expect(exchangeClient.approveBuilderFee).not.toHaveBeenCalled();
    });

    it('retains the requested exchange ID when an ordinary cancel rejects', async () => {
      useStrategyClients({
        exchange: {
          cancel: vi.fn().mockRejectedValue(new Error('Cancel unavailable')),
        },
      });

      const result = await provider.cancelOrder({
        orderId: '123',
        symbol: 'ETH',
      });

      expect(result).toStrictEqual({
        success: false,
        orderId: '123',
        error: 'Cancel unavailable',
      });
    });

    it('rejects every ordinary cancel when the batch response is truncated', async () => {
      useStrategyClients({
        exchange: {
          cancel: vi.fn().mockResolvedValue({
            status: 'ok',
            response: { data: { statuses: ['success', 'success'] } },
          }),
        },
      });

      const result = await provider.cancelOrders([
        { orderId: '123', symbol: 'ETH' },
        { orderId: '456', symbol: 'BTC' },
        { orderId: '789', symbol: 'ETH' },
      ]);

      expect(result).toStrictEqual({
        success: false,
        successCount: 0,
        failureCount: 3,
        results: [
          {
            orderId: '123',
            symbol: 'ETH',
            success: false,
            error: PERPS_ERROR_CODES.BATCH_CANCEL_FAILED,
          },
          {
            orderId: '456',
            symbol: 'BTC',
            success: false,
            error: PERPS_ERROR_CODES.BATCH_CANCEL_FAILED,
          },
          {
            orderId: '789',
            symbol: 'ETH',
            success: false,
            error: PERPS_ERROR_CODES.BATCH_CANCEL_FAILED,
          },
        ],
      });
    });
  });

  describe('TWAP lifecycle', () => {
    const userAddress = '0x1234567890123456789012345678901234567890';
    const startedAt = 1_700_000_000_000;

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(startedAt + 5 * 60_000);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('adapts active progress and slice fills from the venue', async () => {
      const { infoClient } = useStrategyClients({
        info: {
          twapHistory: vi.fn().mockResolvedValue([
            {
              time: 1_700_000_030,
              twapId: 987,
              state: {
                coin: 'ETH',
                executedNtl: '1200',
                executedSz: '0.4',
                minutes: 10,
                randomize: true,
                reduceOnly: false,
                side: 'B',
                sz: '1',
                timestamp: startedAt,
                user: userAddress,
              },
              status: { status: 'activated' },
            },
          ]),
          userTwapSliceFills: vi.fn().mockResolvedValue([
            {
              twapId: 987,
              fill: {
                coin: 'ETH',
                px: '3000',
                sz: '0.4',
                side: 'B',
                time: startedAt + 2 * 60_000,
                startPosition: '0',
                dir: 'Open Long',
                closedPnl: '0',
                hash: '0xabc',
                oid: 321,
                crossed: true,
                fee: '1.20',
                tid: 456,
                feeToken: 'USDC',
                twapId: 987,
              },
            },
          ]),
        },
      });

      expect(await provider.getTwapOrders()).toStrictEqual([
        {
          orderId: '987',
          symbol: 'ETH',
          side: 'buy',
          size: '1',
          executedSize: '0.4',
          remainingSize: '0.6',
          executedNotional: '1200',
          averagePrice: '3000',
          fillProgressBps: 4000,
          timeProgressBps: 5000,
          elapsedTimeMilliseconds: 300_000,
          durationMinutes: 10,
          randomize: true,
          reduceOnly: false,
          status: 'active',
          startedAt,
          lastUpdated: startedAt + 2 * 60_000,
          fills: [
            {
              fillId: '456',
              orderId: '321',
              side: 'buy',
              price: '3000',
              size: '0.4',
              fee: '1.20',
              feeToken: 'USDC',
              timestamp: startedAt + 2 * 60_000,
              transactionHash: '0xabc',
            },
          ],
        },
      ]);
      expect(infoClient.twapHistory).toHaveBeenCalledWith({
        user: userAddress,
      });
      expect(infoClient.userTwapSliceFills).toHaveBeenCalledWith({
        user: userAddress,
      });
    });

    it('deduplicates history and distinguishes an underfilled completion', async () => {
      useStrategyClients({
        info: {
          twapHistory: vi.fn().mockResolvedValue([
            {
              time: 1_700_000_001,
              twapId: 987,
              state: {
                coin: 'ETH',
                executedNtl: '0',
                executedSz: '0',
                minutes: 10,
                randomize: false,
                reduceOnly: false,
                side: 'A',
                sz: '1',
                timestamp: startedAt,
                user: userAddress,
              },
              status: { status: 'activated' },
            },
            {
              time: 1_700_000_600,
              twapId: 987,
              state: {
                coin: 'ETH',
                executedNtl: '2400',
                executedSz: '0.8',
                minutes: 10,
                randomize: false,
                reduceOnly: false,
                side: 'A',
                sz: '1',
                timestamp: startedAt,
                user: userAddress,
              },
              status: { status: 'finished' },
            },
          ]),
        },
      });

      const orders = await provider.getTwapOrders();

      expect(orders).toHaveLength(1);
      expect(orders[0]).toMatchObject({
        orderId: '987',
        side: 'sell',
        status: 'completed_underfilled',
        executedSize: '0.8',
        remainingSize: '0.2',
        averagePrice: '3000',
        fillProgressBps: 8000,
        timeProgressBps: 10000,
        elapsedTimeMilliseconds: 600_000,
      });
    });

    describe('when a completing fill ties lastUpdated across history entries', () => {
      // The venue reports one lifecycle as an activation plus a terminal
      // record, and every entry sharing a twapId receives the same slice
      // fills. A schedule finished by its last fill therefore derives an
      // identical lastUpdated on both entries, because that fill outranks
      // each entry's own whole-second timestamp.
      const finishedAtSeconds = 1_700_000_600;
      const completingFillTimestamp = finishedAtSeconds * 1_000 + 500;

      const activationEntry = {
        time: 1_700_000_000,
        twapId: 987,
        state: {
          coin: 'ETH',
          executedNtl: '0',
          executedSz: '0',
          minutes: 10,
          randomize: false,
          reduceOnly: false,
          side: 'B',
          sz: '1',
          timestamp: startedAt,
          user: userAddress,
        },
        status: { status: 'activated' },
      };

      const terminalEntry = {
        time: finishedAtSeconds,
        twapId: 987,
        state: {
          coin: 'ETH',
          executedNtl: '3000',
          executedSz: '1',
          minutes: 10,
          randomize: false,
          reduceOnly: false,
          side: 'B',
          sz: '1',
          timestamp: startedAt,
          user: userAddress,
        },
        status: { status: 'finished' },
      };

      const completingSliceFills = [
        {
          twapId: 987,
          fill: {
            coin: 'ETH',
            px: '3000',
            sz: '1',
            side: 'B',
            time: completingFillTimestamp,
            startPosition: '0',
            dir: 'Open Long',
            closedPnl: '0',
            hash: '0xabc',
            oid: 321,
            crossed: true,
            fee: '3.00',
            tid: 456,
            feeToken: 'USDC',
            twapId: 987,
          },
        },
      ];

      it.each([
        [
          'venue order, terminal record first',
          [terminalEntry, activationEntry],
        ],
        ['reversed, activation first', [activationEntry, terminalEntry]],
      ])('keeps the terminal record (%s)', async (_label, history) => {
        useStrategyClients({
          info: {
            twapHistory: vi.fn().mockResolvedValue(history),
            userTwapSliceFills: vi.fn().mockResolvedValue(completingSliceFills),
          },
        });

        const orders = await provider.getTwapOrders();

        expect(orders).toHaveLength(1);
        // Reading 'active' here means the activation overwrote the terminal
        // record, which leaves a finished schedule listed as live forever.
        expect(orders[0]).toMatchObject({
          orderId: '987',
          status: 'completed',
          executedSize: '1',
          remainingSize: '0',
          lastUpdated: completingFillTimestamp,
        });
      });
    });

    it.each([
      ['negative', '-1', '0', '10', 0, 'completed_underfilled'],
      ['oversized', '11', '10', '0', 10_000, 'completed'],
    ] as const)(
      'bounds %s venue execution before reporting TWAP progress',
      async (
        _label,
        venueExecutedSize,
        executedSize,
        remainingSize,
        fillProgressBps,
        status,
      ) => {
        useStrategyClients({
          info: {
            twapHistory: vi.fn().mockResolvedValue([
              {
                time: 1_700_000_600,
                twapId: 987,
                state: {
                  coin: 'ETH',
                  executedNtl: '0',
                  executedSz: venueExecutedSize,
                  minutes: 10,
                  randomize: false,
                  reduceOnly: false,
                  side: 'B',
                  sz: '10',
                  timestamp: startedAt,
                  user: userAddress,
                },
                status: { status: 'finished' },
              },
            ]),
          },
        });

        expect(await provider.getTwapOrders()).toContainEqual(
          expect.objectContaining({
            orderId: '987',
            executedSize,
            remainingSize,
            fillProgressBps,
            status,
          }),
        );
      },
    );

    it.each([
      ['waitingForTrigger', 'active'],
      ['stopped', 'canceled'],
      ['futureStatus', 'active'],
    ] as const)('maps the venue %s status to %s', async (status, expected) => {
      useStrategyClients({
        info: {
          twapHistory: vi.fn().mockResolvedValue([
            {
              time: 1_700_000_030,
              twapId: 987,
              state: {
                coin: 'ETH',
                executedNtl: '0',
                executedSz: '0',
                minutes: 10,
                randomize: false,
                reduceOnly: false,
                side: 'B',
                sz: '1',
                timestamp: startedAt,
                user: userAddress,
              },
              status: { status },
            },
          ]),
        },
      });

      expect(await provider.getTwapOrders()).toContainEqual(
        expect.objectContaining({ orderId: '987', status: expected }),
      );
    });

    it('omits a TWAP with malformed venue decimals', async () => {
      useStrategyClients({
        info: {
          twapHistory: vi.fn().mockResolvedValue([
            {
              time: 1_700_000_030,
              twapId: 987,
              state: {
                coin: 'ETH',
                executedNtl: 'NaN',
                executedSz: '0',
                minutes: 10,
                randomize: false,
                reduceOnly: false,
                side: 'B',
                sz: '1',
                timestamp: startedAt,
                user: userAddress,
              },
              status: { status: 'activated' },
            },
          ]),
        },
      });

      expect(await provider.getTwapOrders()).toStrictEqual([]);
    });

    it('coalesces concurrent HIP-3 TWAP collateral cleanup', async () => {
      let twapPlaced = false;
      const clearinghouseState = vi.fn().mockImplementation(({ dex }) => {
        let withdrawable = '1000';
        if (dex === 'xyz') {
          withdrawable = twapPlaced ? '20' : '0';
        }
        return Promise.resolve(createClearinghouseBalance(withdrawable));
      });
      const cleanupStarted = createDeferred<void>();
      const pendingCleanup = createDeferred<{ status: 'ok' }>();
      const sendAsset = vi
        .fn()
        .mockResolvedValueOnce({ status: 'ok' })
        .mockImplementationOnce(() => {
          cleanupStarted.resolve();
          return pendingCleanup.promise;
        });
      useStrategyClients({
        exchange: {
          sendAsset,
          twapOrder: vi.fn().mockImplementation(async () => {
            twapPlaced = true;
            return {
              status: 'ok',
              response: {
                type: 'twapOrder',
                data: { status: { running: { twapId: 987 } } },
              },
            };
          }),
        },
        info: {
          clearinghouseState,
          perpDexs: vi.fn().mockResolvedValue([null, { name: 'xyz' }]),
          meta: vi.fn().mockResolvedValue({
            universe: [{ name: 'xyz:TSLA', szDecimals: 3, maxLeverage: 20 }],
            collateralToken: 0,
          }),
          allMids: vi.fn().mockResolvedValue({ 'xyz:TSLA': '3000' }),
          twapHistory: vi.fn().mockResolvedValue([
            {
              time: 1_700_000_600,
              twapId: 987,
              state: {
                coin: 'xyz:TSLA',
                executedNtl: '3000',
                executedSz: '1',
                minutes: 30,
                randomize: false,
                reduceOnly: false,
                side: 'B',
                sz: '1',
                timestamp: startedAt,
                user: userAddress,
              },
              status: { status: 'finished' },
            },
          ]),
        },
      });
      provider = createTestProvider({
        hip3Enabled: true,
        allowlistMarkets: ['xyz:*'],
        useUnifiedAccount: false,
        initialAssetMapping: [['xyz:TSLA', 110000]],
      });

      expect(
        await provider.placeOrder({
          ...baseOrder,
          symbol: 'xyz:TSLA',
          orderType: 'twap',
          twapDuration: 30,
        } satisfies OrderParams),
      ).toMatchObject({ success: true, orderId: '987' });

      const reads = [provider.getTwapOrders(), provider.getTwapOrders()];
      await cleanupStarted.promise;
      expect(sendAsset).toHaveBeenCalledTimes(2);
      pendingCleanup.resolve({ status: 'ok' });
      await Promise.all(reads);

      expect(sendAsset).toHaveBeenCalledTimes(2);
    });

    it('retries a failed HIP-3 collateral rebalance with fresh context after reconnect', async () => {
      let twapPlaced = false;
      const clearinghouseState = vi.fn().mockImplementation(({ dex }) => {
        let withdrawable = '1000';
        if (dex === 'xyz') {
          withdrawable = twapPlaced ? '20' : '0';
        }
        return Promise.resolve(createClearinghouseBalance(withdrawable));
      });
      const twapOrder = vi.fn().mockImplementation(async () => {
        twapPlaced = true;
        return {
          status: 'ok',
          response: {
            type: 'twapOrder',
            data: { status: { running: { twapId: 987 } } },
          },
        };
      });
      const sendAsset = vi.fn().mockResolvedValue({ status: 'ok' });
      useStrategyClients({
        exchange: { sendAsset, twapOrder },
        info: {
          clearinghouseState,
          perpDexs: vi.fn().mockResolvedValue([null, { name: 'xyz' }]),
          meta: vi.fn().mockResolvedValue({
            universe: [{ name: 'xyz:TSLA', szDecimals: 3, maxLeverage: 20 }],
            collateralToken: 0,
          }),
          allMids: vi.fn().mockResolvedValue({ 'xyz:TSLA': '3000' }),
          twapHistory: vi.fn().mockResolvedValue([
            {
              time: 1_700_000_600,
              twapId: 987,
              state: {
                coin: 'xyz:TSLA',
                executedNtl: '3000',
                executedSz: '1',
                minutes: 30,
                randomize: false,
                reduceOnly: false,
                side: 'B',
                sz: '1',
                timestamp: startedAt,
                user: userAddress,
              },
              status: { status: 'finished' },
            },
          ]),
        },
      });
      provider = createTestProvider({
        hip3Enabled: true,
        allowlistMarkets: ['xyz:*'],
        useUnifiedAccount: false,
        initialAssetMapping: [['xyz:TSLA', 110000]],
      });

      expect(
        await provider.placeOrder({
          ...baseOrder,
          symbol: 'xyz:TSLA',
          orderType: 'twap',
          twapDuration: 30,
        } satisfies OrderParams),
      ).toMatchObject({ success: true, orderId: '987' });
      expect(sendAsset).toHaveBeenCalledTimes(1);
      await provider.disconnect();
      expect(await provider.initialize()).toMatchObject({ success: true });
      sendAsset
        .mockReset()
        .mockResolvedValueOnce({ status: 'err' })
        .mockResolvedValue({ status: 'ok' });

      await provider.getTwapOrders();
      expect(sendAsset).toHaveBeenCalledTimes(1);

      await provider.getTwapOrders();
      expect(sendAsset).toHaveBeenCalledTimes(2);

      await provider.getTwapOrders();
      expect(sendAsset).toHaveBeenCalledTimes(2);
    });
  });

  describe('Scale placement', () => {
    const scaleStatuses = {
      status: 'ok',
      response: {
        data: {
          statuses: [
            { resting: { oid: 11 } },
            { resting: { oid: 22 } },
            { resting: { oid: 33 } },
          ],
        },
      },
    };

    it('fans out one order per rung, spread across the range', async () => {
      const { exchangeClient } = useStrategyClients({
        exchange: { order: vi.fn().mockResolvedValue(scaleStatuses) },
      });

      await provider.placeOrder({
        ...baseOrder,
        orderType: 'scale',
        scaleMinPrice: '2000',
        scaleMaxPrice: '3000',
        scaleNumOrders: 3,
      } satisfies OrderParams);

      expect(exchangeClient.order).toHaveBeenCalledTimes(1);
      const submitted = exchangeClient.order.mock.calls[0][0];
      expect(submitted.grouping).toBe('na');
      expect(submitted.orders).toHaveLength(3);
      expect(submitted.builder).toStrictEqual({
        b: BUILDER_FEE_CONFIG.MainnetBuilder,
        f: BUILDER_FEE_CONFIG.MaxFeeTenthsBps,
      });
      expect(
        submitted.orders.map((order: { p: string }) => order.p),
      ).toStrictEqual(['2000', '2500', '3000']);
    });

    it('marks every rung cloid when subscription wins and keeps the ladder recoverable', async () => {
      const { exchangeClient } = useStrategyClients({
        exchange: { order: vi.fn().mockResolvedValue(scaleStatuses) },
      });
      provider.setUserFeeResolution({
        feeBips: 0,
        discountBips: 10000,
        source: 'subscription',
        subscription: { eligible: true, reason: 'eligible' },
        subscriptionWaiverKind: 'full',
      });

      await provider.placeOrder({
        ...baseOrder,
        orderType: 'scale',
        scaleMinPrice: '2000',
        scaleMaxPrice: '3000',
        scaleNumOrders: 3,
      } satisfies OrderParams);

      const submitted = exchangeClient.order.mock.calls[0][0];
      const cloids = submitted.orders.map((order: { c?: string }) => order.c);

      // Every rung carries the attribution in its flag byte...
      cloids.forEach((cloid: string) => {
        expect(readSubscriptionCloidFlags(cloid)).toBe(
          SUBSCRIPTION_CLOID_FLAGS.FeeReductionApplied,
        );
        // ...while keeping the Scale marker, so the group stays recoverable
        // from open orders and cancel-by-cloid keeps working.
        expect(cloid.startsWith(`0x${HYPERLIQUID_SCALE_CLOID_MARKER}`)).toBe(
          true,
        );
        // A decoder still will not trust that byte behind the Scale marker,
        // since legacy ladders carry random entropy there. Scale attribution
        // needs a correlation other than the cloid.
        expect(hasFeeReductionAppliedFlag(cloid)).toBe(false);
      });
      // And each rung is still a distinct id.
      expect(new Set(cloids).size).toBe(3);
    });

    it('leaves rung cloids unmarked when subscription did not win', async () => {
      const { exchangeClient } = useStrategyClients({
        exchange: { order: vi.fn().mockResolvedValue(scaleStatuses) },
      });

      await provider.placeOrder({
        ...baseOrder,
        orderType: 'scale',
        scaleMinPrice: '2000',
        scaleMaxPrice: '3000',
        scaleNumOrders: 3,
      } satisfies OrderParams);

      const submitted = exchangeClient.order.mock.calls[0][0];
      submitted.orders.forEach((order: { c?: string }) => {
        // The reserved flag byte stays zero when subscription did not win.
        expect(readSubscriptionCloidFlags(order.c)).toBe(0);
        expect(order.c?.startsWith(`0x${HYPERLIQUID_SCALE_CLOID_MARKER}`)).toBe(
          true,
        );
      });
    });

    it('submits the provider preview prices for fractional bounds', async () => {
      const { exchangeClient } = useStrategyClients({
        exchange: { order: vi.fn().mockResolvedValue(scaleStatuses) },
      });
      const { symbol } = baseOrder;
      const minPrice = 12.341;
      const maxPrice = 12.381;
      const count = 3;
      const preview = await provider.getScalePriceLadder({
        symbol,
        minPrice,
        maxPrice,
        count,
      });
      if (preview.status !== 'ready') {
        throw new Error('Expected Scale price ladder preview to be ready');
      }
      expect(preview.prices).toStrictEqual(['12.34', '12.36', '12.38']);

      await provider.placeOrder({
        ...baseOrder,
        symbol,
        currentPrice: 12.36,
        usdAmount: '300',
        orderType: 'scale',
        scaleMinPrice: minPrice.toString(),
        scaleMaxPrice: maxPrice.toString(),
        scaleNumOrders: count,
      } satisfies OrderParams);

      const submitted = exchangeClient.order.mock.calls[0][0];
      expect(
        submitted.orders.map((order: { p: string }) => order.p),
      ).toStrictEqual(preview.prices);
    });

    it('splits the size across the rungs so the total is preserved', async () => {
      const { exchangeClient } = useStrategyClients({
        exchange: { order: vi.fn().mockResolvedValue(scaleStatuses) },
      });

      await provider.placeOrder({
        ...baseOrder,
        orderType: 'scale',
        scaleMinPrice: '2000',
        scaleMaxPrice: '3000',
        scaleNumOrders: 3,
      } satisfies OrderParams);

      const submitted = exchangeClient.order.mock.calls[0][0];
      const sizes = submitted.orders.map((order: { s: string }) => order.s);
      expect(sizes).toStrictEqual(['0.3334', '0.3333', '0.3333']);
      expect(
        sizes.reduce(
          (total: number, size: string) => total + parseFloat(size),
          0,
        ),
      ).toBeCloseTo(1, 8);
    });

    it('weights the rungs along the ladder when a skew is supplied', async () => {
      const { exchangeClient } = useStrategyClients({
        exchange: { order: vi.fn().mockResolvedValue(scaleStatuses) },
      });

      await provider.placeOrder({
        ...baseOrder,
        orderType: 'scale',
        scaleMinPrice: '2000',
        scaleMaxPrice: '3000',
        scaleNumOrders: 3,
        scaleSkew: 2,
      } satisfies OrderParams);

      const submitted = exchangeClient.order.mock.calls[0][0];
      const sizes = submitted.orders.map((order: { s: string }) => order.s);
      // The largest rung is the one at scaleMaxPrice, and the ladder still adds
      // up to the size that was validated.
      expect(sizes).toStrictEqual(['0.2222', '0.3333', '0.4445']);
      expect(
        sizes.reduce(
          (total: number, size: string) => total + parseFloat(size),
          0,
        ),
      ).toBeCloseTo(1, 8);
    });

    it('weights the bottom of the ladder for a skew below 1', async () => {
      const { exchangeClient } = useStrategyClients({
        exchange: { order: vi.fn().mockResolvedValue(scaleStatuses) },
      });

      await provider.placeOrder({
        ...baseOrder,
        orderType: 'scale',
        scaleMinPrice: '2000',
        scaleMaxPrice: '3000',
        scaleNumOrders: 3,
        scaleSkew: 0.5,
      } satisfies OrderParams);

      const submitted = exchangeClient.order.mock.calls[0][0];
      expect(
        submitted.orders.map((order: { s: string }) => order.s),
      ).toStrictEqual(['0.4445', '0.3333', '0.2222']);
    });

    it('splits evenly for a skew of exactly 1', async () => {
      const { exchangeClient } = useStrategyClients({
        exchange: { order: vi.fn().mockResolvedValue(scaleStatuses) },
      });

      await provider.placeOrder({
        ...baseOrder,
        orderType: 'scale',
        scaleMinPrice: '2000',
        scaleMaxPrice: '3000',
        scaleNumOrders: 3,
        scaleSkew: 1,
      } satisfies OrderParams);

      const submitted = exchangeClient.order.mock.calls[0][0];
      expect(
        submitted.orders.map((order: { s: string }) => order.s),
      ).toStrictEqual(['0.3334', '0.3333', '0.3333']);
    });

    it('rests every rung as a plain GTC limit order', async () => {
      const { exchangeClient } = useStrategyClients({
        exchange: { order: vi.fn().mockResolvedValue(scaleStatuses) },
      });

      await provider.placeOrder({
        ...baseOrder,
        orderType: 'scale',
        scaleMinPrice: '2000',
        scaleMaxPrice: '3000',
        scaleNumOrders: 3,
      } satisfies OrderParams);

      const submitted = exchangeClient.order.mock.calls[0][0];
      submitted.orders.forEach((order: { t: unknown; b: boolean }) => {
        expect(order.t).toStrictEqual({ limit: { tif: 'Gtc' } });
        expect(order.b).toBe(true);
      });
    });

    it('returns the ladder children alongside a group handle', async () => {
      useStrategyClients({
        exchange: { order: vi.fn().mockResolvedValue(scaleStatuses) },
      });

      const result = await provider.placeOrder({
        ...baseOrder,
        orderType: 'scale',
        scaleMinPrice: '2000',
        scaleMaxPrice: '3000',
        scaleNumOrders: 3,
      } satisfies OrderParams);

      expect(result.success).toBe(true);
      expect(result.childOrderIds).toStrictEqual(['11', '22', '33']);
      expect(result.acceptedChildren).toStrictEqual([
        { orderId: '11', state: 'resting' },
        { orderId: '22', state: 'resting' },
        { orderId: '33', state: 'resting' },
      ]);
      expect(result.submittedSize).toBe('1');
      expect(result.acceptedSize).toBe('1');
      expect(result.weightedAverageLimitPrice).toBe('2499.95');
      expect(result.averagePrice).toBeUndefined();
      expect(result.orderId).toMatch(/^scale:/u);
    });

    it('fails when every rung is rejected', async () => {
      useStrategyClients({
        exchange: {
          order: vi.fn().mockResolvedValue({
            status: 'ok',
            response: {
              data: {
                statuses: [
                  { error: 'Insufficient margin' },
                  { error: 'Insufficient margin' },
                  { error: 'Insufficient margin' },
                ],
              },
            },
          }),
        },
      });

      const result = await provider.placeOrder({
        ...baseOrder,
        orderType: 'scale',
        scaleMinPrice: '2000',
        scaleMaxPrice: '3000',
        scaleNumOrders: 3,
      } satisfies OrderParams);

      expect(result.success).toBe(false);
      expect(result.error).toBe(PERPS_ERROR_CODES.ORDER_REJECTED);
    });

    it('corrects account support when every rung is rejected for multi-signature', async () => {
      useStrategyClients({
        exchange: {
          order: vi.fn().mockResolvedValue({
            status: 'ok',
            response: {
              data: {
                statuses: [
                  { error: 'Multi-sig required' },
                  { error: 'Multi-sig required' },
                  { error: 'Multi-sig required' },
                ],
              },
            },
          }),
        },
      });

      const result = await provider.placeOrder({
        ...baseOrder,
        orderType: 'scale',
        scaleMinPrice: '2000',
        scaleMaxPrice: '3000',
        scaleNumOrders: 3,
      } satisfies OrderParams);

      expect(result).toMatchObject({
        success: false,
        error: PERPS_ERROR_CODES.EXCHANGE_MULTI_SIG_REQUIRED,
      });
      expect(await provider.getAccountSupport()).toStrictEqual({
        isSupported: false,
        reason: 'multi_sig_account',
      });
    });

    it.each([
      ['missing', undefined],
      ['non-array', { resting: { oid: 11 } }],
    ])('rejects %s placement statuses', async (_label, statuses) => {
      useStrategyClients({
        exchange: {
          order: vi.fn().mockResolvedValue({
            status: 'ok',
            response: { data: { statuses } },
          }),
        },
      });

      const result = await provider.placeOrder({
        ...baseOrder,
        orderType: 'scale',
        scaleMinPrice: '2000',
        scaleMaxPrice: '3000',
        scaleNumOrders: 3,
      } satisfies OrderParams);

      expect(result).toMatchObject({
        success: false,
        error: PERPS_ERROR_CODES.ORDER_REJECTED,
      });
    });

    it('reports accepted IDs after a non-ok response but keeps only resting rungs recoverable', async () => {
      const cancel = vi
        .fn()
        .mockResolvedValueOnce({
          status: 'ok',
          response: {
            data: { statuses: [{ error: 'cancel refused' }] },
          },
        })
        .mockResolvedValueOnce({
          status: 'ok',
          response: { data: { statuses: ['success'] } },
        });
      const { exchangeClient } = useStrategyClients({
        exchange: {
          order: vi.fn().mockResolvedValue({
            status: 'err',
            response: {
              data: {
                statuses: [
                  {
                    filled: { oid: 11, avgPx: '2050', totalSz: '0.2' },
                  },
                  { resting: { oid: 22 } },
                  { error: 'Insufficient margin' },
                ],
              },
            },
          }),
          cancel,
        },
      });

      const placed = await provider.placeOrder({
        ...baseOrder,
        orderType: 'scale',
        scaleMinPrice: '2000',
        scaleMaxPrice: '3000',
        scaleNumOrders: 3,
      } satisfies OrderParams);

      expect(placed).toMatchObject({
        success: false,
        error: PERPS_ERROR_CODES.ORDER_STRATEGY_CANCEL_INCOMPLETE,
        childOrderIds: ['22'],
        submittedSize: '1',
        acceptedSize: '0.6667',
        filledSize: '0.2',
        averagePrice: '2050',
      });
      expect(placed.orderId).toMatch(/^scale:/u);
      if (!placed.orderId) {
        throw new Error('Expected a recovery group handle');
      }

      const cancelled = await provider.cancelOrder({
        orderId: placed.orderId,
        symbol: 'ETH',
        orderType: 'scale',
      });

      expect(cancelled.success).toBe(true);
      expect(exchangeClient.cancel).toHaveBeenLastCalledWith({
        cancels: [{ a: 1, o: 22 }],
      });
    });

    it('cancels every child of the group in one batch', async () => {
      const { exchangeClient } = useStrategyClients({
        exchange: {
          order: vi.fn().mockResolvedValue(scaleStatuses),
          cancel: vi.fn().mockResolvedValue({
            status: 'ok',
            response: { data: { statuses: ['success', 'success', 'success'] } },
          }),
        },
      });

      const placed = await provider.placeOrder({
        ...baseOrder,
        orderType: 'scale',
        scaleMinPrice: '2000',
        scaleMaxPrice: '3000',
        scaleNumOrders: 3,
      } satisfies OrderParams);
      exchangeClient.approveBuilderFee.mockClear();

      const result = await provider.cancelOrder({
        orderId: placed.orderId,
        symbol: 'ETH',
        orderType: 'scale',
      });

      expect(result.success).toBe(true);
      expect(exchangeClient.cancel).toHaveBeenCalledWith({
        cancels: [
          { a: 1, o: 11 },
          { a: 1, o: 22 },
          { a: 1, o: 33 },
        ],
      });
      expect(exchangeClient.approveBuilderFee).not.toHaveBeenCalled();
    });

    /**
     * The Scale group handle from a successful placement.
     *
     * @param placed - The placement result.
     * @returns The group handle.
     */
    const requireScaleGroupHandle = (placed: OrderResult): string => {
      if (!placed.orderId) {
        throw new Error('Expected a Scale group handle');
      }
      return placed.orderId;
    };

    it('corrects account support when Scale cancellation requires multi-signature', async () => {
      useStrategyClients({
        exchange: {
          order: vi.fn().mockResolvedValue(scaleStatuses),
          cancel: vi.fn().mockResolvedValue({
            status: 'ok',
            response: {
              data: {
                statuses: [
                  { error: 'Multi-sig required' },
                  { error: 'Multi-sig required' },
                  { error: 'Multi-sig required' },
                ],
              },
            },
          }),
        },
      });

      const placed = await provider.placeOrder({
        ...baseOrder,
        orderType: 'scale',
        scaleMinPrice: '2000',
        scaleMaxPrice: '3000',
        scaleNumOrders: 3,
      } satisfies OrderParams);
      const result = await provider.cancelOrder({
        orderId: requireScaleGroupHandle(placed),
        symbol: 'ETH',
        orderType: 'scale',
      });

      expect(result).toMatchObject({
        success: false,
        error: PERPS_ERROR_CODES.ORDER_STRATEGY_CANCEL_INCOMPLETE,
      });
      expect(await provider.getAccountSupport()).toStrictEqual({
        isSupported: false,
        reason: 'multi_sig_account',
      });
    });

    it('does not restore a canceled group from a stale open-order cache', async () => {
      const { exchangeClient } = useStrategyClients({
        exchange: {
          order: vi.fn().mockResolvedValue(scaleStatuses),
          cancel: vi.fn().mockResolvedValue({
            status: 'ok',
            response: { data: { statuses: ['success', 'success', 'success'] } },
          }),
        },
      });
      const placed = await provider.placeOrder({
        ...baseOrder,
        orderType: 'scale',
        scaleMinPrice: '2000',
        scaleMaxPrice: '3000',
        scaleNumOrders: 3,
      } satisfies OrderParams);
      if (!placed.orderId) {
        throw new Error('Expected a Scale group handle');
      }

      expect(
        await provider.cancelOrder({
          orderId: placed.orderId,
          symbol: 'ETH',
          orderType: 'scale',
        }),
      ).toStrictEqual({ success: true, orderId: placed.orderId });

      const staleOrder = {
        orderId: '11',
        symbol: 'ETH',
        side: 'buy',
        orderType: 'limit',
        size: '1',
        originalSize: '1',
        price: '2000',
        filledSize: '0',
        remainingSize: '1',
        status: 'open',
        timestamp: 1_700_000_000_000,
        strategyGroupId: placed.orderId,
      } satisfies Order;
      mockSubscriptionService.getOrdersCacheIfInitialized.mockReturnValue([
        staleOrder,
      ]);
      await provider.getOpenOrders();

      expect(
        await provider.cancelOrder({
          orderId: placed.orderId,
          symbol: 'ETH',
          orderType: 'scale',
        }),
      ).toStrictEqual({
        success: false,
        orderId: placed.orderId,
        error: PERPS_ERROR_CODES.ORDER_STRATEGY_HANDLE_UNKNOWN,
      });
      expect(exchangeClient.cancel).toHaveBeenCalledTimes(1);
    });

    it('does not shrink a live Scale group from a partial open-order snapshot', async () => {
      const { exchangeClient } = useStrategyClients({
        exchange: {
          order: vi.fn().mockResolvedValue(scaleStatuses),
          cancel: vi.fn().mockResolvedValue({
            status: 'ok',
            response: { data: { statuses: ['success', 'success', 'success'] } },
          }),
        },
      });
      const placed = await provider.placeOrder({
        ...baseOrder,
        orderType: 'scale',
        scaleMinPrice: '2000',
        scaleMaxPrice: '3000',
        scaleNumOrders: 3,
      } satisfies OrderParams);
      if (!placed.orderId) {
        throw new Error('Expected a Scale group handle');
      }

      mockSubscriptionService.getOrdersCacheIfInitialized.mockReturnValue(
        ['11', '22'].map(
          (orderId) =>
            ({
              orderId,
              symbol: 'ETH',
              side: 'buy',
              orderType: 'limit',
              size: '1',
              originalSize: '1',
              price: '2000',
              filledSize: '0',
              remainingSize: '1',
              status: 'open',
              timestamp: 1_700_000_000_000,
              strategyGroupId: placed.orderId,
            }) satisfies Order,
        ),
      );

      await provider.getOpenOrders();
      await provider.cancelOrder({
        orderId: placed.orderId,
        symbol: 'ETH',
        orderType: 'scale',
      });

      expect(exchangeClient.cancel).toHaveBeenLastCalledWith({
        cancels: [
          { a: 1, o: 11 },
          { a: 1, o: 22 },
          { a: 1, o: 33 },
        ],
      });
    });

    it('cleans a waiting child instead of registering it for later recovery', async () => {
      const order = vi.fn().mockResolvedValue({
        status: 'ok',
        response: {
          data: {
            statuses: [
              'waitingForFill',
              { error: 'Insufficient margin' },
              { error: 'Insufficient margin' },
            ],
          },
        },
      });
      const { exchangeClient } = useStrategyClients({
        exchange: { order },
      });
      const placed = await provider.placeOrder({
        ...baseOrder,
        orderType: 'scale',
        scaleMinPrice: '2000',
        scaleMaxPrice: '3000',
        scaleNumOrders: 3,
      } satisfies OrderParams);

      expect(placed).toMatchObject({
        success: false,
        error: PERPS_ERROR_CODES.ORDER_REJECTED,
      });
      expect(placed.orderId).toBeUndefined();
      const submittedOrders = order.mock.calls[0][0].orders;
      expect(exchangeClient.cancelByCloid).toHaveBeenCalledWith({
        cancels: [{ asset: 1, cloid: submittedOrders[0].c }],
      });
      expect(exchangeClient.cancel).not.toHaveBeenCalled();
    });

    it('adds later Scale rungs to a partially recovered group', async () => {
      const { exchangeClient } = useStrategyClients({
        exchange: {
          order: vi.fn().mockResolvedValue(scaleStatuses),
          cancel: vi.fn().mockResolvedValue({
            status: 'ok',
            response: { data: { statuses: ['success', 'success', 'success'] } },
          }),
        },
      });
      const placed = await provider.placeOrder({
        ...baseOrder,
        orderType: 'scale',
        scaleMinPrice: '2000',
        scaleMaxPrice: '3000',
        scaleNumOrders: 3,
      } satisfies OrderParams);
      if (!placed.orderId) {
        throw new Error('Expected a Scale group handle');
      }
      const recreatedProvider = createTestProvider({
        initialAssetMapping: [
          ['BTC', 0],
          ['ETH', 1],
        ],
      });
      const openOrders = (orderIds: string[]): Order[] =>
        orderIds.map(
          (orderId) =>
            ({
              orderId,
              symbol: 'ETH',
              side: 'buy',
              orderType: 'limit',
              size: '1',
              originalSize: '1',
              price: '2000',
              filledSize: '0',
              remainingSize: '1',
              status: 'open',
              timestamp: 1_700_000_000_000,
              strategyGroupId: placed.orderId,
            }) satisfies Order,
        );

      mockSubscriptionService.getOrdersCacheIfInitialized.mockReturnValue(
        openOrders(['11', '22']),
      );
      await recreatedProvider.getOpenOrders();
      mockSubscriptionService.getOrdersCacheIfInitialized.mockReturnValue(
        openOrders(['11', '22', '33']),
      );
      await recreatedProvider.getOpenOrders();
      await recreatedProvider.cancelOrder({
        orderId: placed.orderId,
        symbol: 'ETH',
        orderType: 'scale',
      });

      expect(exchangeClient.cancel).toHaveBeenLastCalledWith({
        cancels: [
          { a: 1, o: 11 },
          { a: 1, o: 22 },
          { a: 1, o: 33 },
        ],
      });
    });

    it('reports an incomplete group cancel and keeps the handle for a retry', async () => {
      const cancel = vi
        .fn()
        .mockResolvedValueOnce({
          status: 'ok',
          response: {
            data: {
              statuses: ['success', { error: 'cancel refused' }, 'success'],
            },
          },
        })
        .mockResolvedValue({
          status: 'ok',
          response: { data: { statuses: ['success'] } },
        });
      const { exchangeClient } = useStrategyClients({
        exchange: { order: vi.fn().mockResolvedValue(scaleStatuses), cancel },
      });

      const placed = await provider.placeOrder({
        ...baseOrder,
        orderType: 'scale',
        scaleMinPrice: '2000',
        scaleMaxPrice: '3000',
        scaleNumOrders: 3,
      } satisfies OrderParams);

      const first = await provider.cancelOrder({
        orderId: placed.orderId,
        symbol: 'ETH',
        orderType: 'scale',
      });
      expect(first.success).toBe(false);
      expect(first.error).toBe(
        PERPS_ERROR_CODES.ORDER_STRATEGY_CANCEL_INCOMPLETE,
      );

      // The handle still resolves, and now covers only the rung left resting.
      const second = await provider.cancelOrder({
        orderId: placed.orderId,
        symbol: 'ETH',
        orderType: 'scale',
      });
      expect(second.success).toBe(true);
      expect(exchangeClient.cancel).toHaveBeenLastCalledWith({
        cancels: [{ a: 1, o: 22 }],
      });
    });

    it('rejects a cancel for a group it does not hold', async () => {
      useStrategyClients();

      const result = await provider.cancelOrder({
        orderId: 'scale-does-not-exist',
        symbol: 'ETH',
        orderType: 'scale',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe(
        PERPS_ERROR_CODES.ORDER_STRATEGY_HANDLE_UNKNOWN,
      );
    });
  });
});
