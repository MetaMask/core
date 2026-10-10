import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock, Mocked, MockInstance } from 'vitest';

import {
  CHASE_ORDER_CONFIG,
  CHASE_ORDER_STATUS,
} from '../../../src/constants/perpsConfig.js';
import { PERPS_ERROR_CODES } from '../../../src/perpsErrorCodes.js';
import { HyperLiquidProvider } from '../../../src/providers/HyperLiquidProvider.js';
import { HyperLiquidSubscriptionService } from '../../../src/services/HyperLiquidSubscriptionService.js';
import { HyperLiquidWalletService } from '../../../src/services/HyperLiquidWalletService.js';
import type { OrderParams } from '../../../src/types/index.js';
import {
  baseOrder,
  createClearinghouseBalance,
  createTestProvider,
  mockPlatformDependencies,
  mockValidateOrderParams,
  setUpStrategyProvider,
  useStrategyClients,
} from '../../helpers/hyperLiquidStrategyOrders.js';
import type { MockClient } from '../../helpers/hyperLiquidStrategyOrders.js';
import { createMockPosition } from '../../helpers/providerMocks.js';

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
  let mockWalletService: Mocked<HyperLiquidWalletService>;
  let mockSubscriptionService: Mocked<HyperLiquidSubscriptionService>;

  beforeEach(() => {
    ({ provider, mockWalletService, mockSubscriptionService } =
      setUpStrategyProvider());
  });

  describe('Chase placement', () => {
    const chaseRested = {
      status: 'ok',
      response: { data: { statuses: [{ resting: { oid: 55 } }] } },
    };

    it('rests post-only at the near touch for a buy', async () => {
      const { exchangeClient } = useStrategyClients({
        exchange: { order: vi.fn().mockResolvedValue(chaseRested) },
      });

      await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
      } satisfies OrderParams);

      const submitted = exchangeClient.order.mock.calls[0][0];
      expect(submitted.orders).toHaveLength(1);
      // One tick above the best bid, which is how the venue defines a chase: a
      // post-only buy that improves the bid rather than joining the queue at it.
      // ETH's tick at ~3000 is 0.1.
      expect(submitted.orders[0].p).toBe('2999.1');
      expect(submitted.orders[0].t).toStrictEqual({ limit: { tif: 'Alo' } });
    });

    it('refreshes the touch and retries an initial post-only rejection', async () => {
      const order = vi
        .fn()
        .mockRejectedValueOnce(
          new Error('Post only order would have immediately matched'),
        )
        .mockResolvedValue(chaseRested);
      const l2Book = vi
        .fn()
        .mockResolvedValueOnce({
          coin: 'ETH',
          levels: [
            [{ px: '2999', sz: '10', n: 1 }],
            [{ px: '3001', sz: '10', n: 1 }],
          ],
        })
        .mockResolvedValue({
          coin: 'ETH',
          levels: [
            [{ px: '2998', sz: '10', n: 1 }],
            [{ px: '3001', sz: '10', n: 1 }],
          ],
        });
      const { exchangeClient } = useStrategyClients({
        exchange: { order },
        info: { l2Book },
      });

      const result = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
      });

      expect(result.success).toBe(true);
      expect(exchangeClient.order).toHaveBeenCalledTimes(2);
      expect(exchangeClient.order.mock.calls[1][0].orders[0].p).toBe('2998.1');
    });

    it('refreshes the touch and retries an initial oracle-distance rejection', async () => {
      const order = vi
        .fn()
        .mockRejectedValueOnce(new Error('Price too far from oracle'))
        .mockResolvedValue(chaseRested);
      const l2Book = vi
        .fn()
        .mockResolvedValueOnce({
          coin: 'ETH',
          levels: [
            [{ px: '2999', sz: '10', n: 1 }],
            [{ px: '3001', sz: '10', n: 1 }],
          ],
        })
        .mockResolvedValue({
          coin: 'ETH',
          levels: [
            [{ px: '2997', sz: '10', n: 1 }],
            [{ px: '3001', sz: '10', n: 1 }],
          ],
        });
      const { exchangeClient } = useStrategyClients({
        exchange: { order },
        info: { l2Book },
      });

      const result = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
      });

      expect(result.success).toBe(true);
      expect(exchangeClient.order).toHaveBeenCalledTimes(2);
      expect(exchangeClient.order.mock.calls[1][0].orders[0].p).toBe('2997.1');
    });

    it('stops after three retryable initial-placement rejections', async () => {
      const order = vi
        .fn()
        .mockRejectedValue(
          new Error('Post only order would have immediately matched'),
        );
      const { exchangeClient } = useStrategyClients({ exchange: { order } });

      const result = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
      });

      expect(result.success).toBe(false);
      expect(exchangeClient.order).toHaveBeenCalledTimes(3);
    });

    it('does not retry a non-retryable initial-placement rejection', async () => {
      const order = vi.fn().mockRejectedValue(new Error('insufficient margin'));
      const { exchangeClient } = useStrategyClients({ exchange: { order } });

      const result = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
      });

      expect(result.success).toBe(false);
      expect(exchangeClient.order).toHaveBeenCalledTimes(1);
    });

    it('rests at the best ask for a sell', async () => {
      const { exchangeClient } = useStrategyClients({
        exchange: { order: vi.fn().mockResolvedValue(chaseRested) },
      });

      await provider.placeOrder({
        ...baseOrder,
        isBuy: false,
        orderType: 'chase',
      } satisfies OrderParams);

      const submitted = exchangeClient.order.mock.calls[0][0];
      // One tick below the best ask, mirroring the buy side.
      expect(submitted.orders[0].p).toBe('3000.9');
    });

    it('returns a session handle carrying the live order', async () => {
      useStrategyClients({
        exchange: { order: vi.fn().mockResolvedValue(chaseRested) },
      });

      const result = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
      } satisfies OrderParams);

      expect(result.success).toBe(true);
      expect(result.orderId).toMatch(/^chase-/u);
      expect(result.childOrderIds).toStrictEqual(['55']);
    });

    it('exposes the running session state needed by clients', async () => {
      useStrategyClients({
        exchange: { order: vi.fn().mockResolvedValue(chaseRested) },
      });

      const result = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseMaxDistanceBps: 100,
      });

      expect(await provider.getChaseOrders()).toStrictEqual([
        expect.objectContaining({
          handle: result.orderId,
          symbol: 'ETH',
          side: 'buy',
          originalSize: '1',
          remainingSize: '1',
          arrivalPrice: '2999.1',
          restingPrice: '2999.1',
          restingOrderId: '55',
          distanceChasedBps: 0,
          maxDistanceBps: 100,
          repricings: 0,
          status: 'active',
        }),
      ]);
    });

    it('refreshes the snapshot remaining size after a partial fill', async () => {
      const { infoClient } = useStrategyClients({
        exchange: { order: vi.fn().mockResolvedValue(chaseRested) },
      });
      const result = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
      });
      infoClient.orderStatus.mockResolvedValueOnce({
        status: 'order',
        order: {
          status: 'open',
          order: {
            coin: 'ETH',
            side: 'B',
            limitPx: '2999.1',
            sz: '0.2',
            origSz: '1',
            oid: 55,
            timestamp: 1_700_000_000_000,
            isTrigger: false,
            triggerCondition: 'N/A',
            triggerPx: '0',
            children: [],
            isPositionTpsl: false,
            reduceOnly: false,
            orderType: 'Limit',
            tif: 'Alo',
            cloid: null,
          },
        },
      });

      const firstSnapshots = await provider.getChaseOrders();
      const cachedSnapshots = await provider.getChaseOrders();

      expect(firstSnapshots).toContainEqual(
        expect.objectContaining({
          handle: result.orderId,
          remainingSize: '0.2',
        }),
      );
      expect(cachedSnapshots).toContainEqual(
        expect.objectContaining({
          handle: result.orderId,
          remainingSize: '0.2',
        }),
      );
    });

    it('retries a temporarily unknown child before refreshing Chase state', async () => {
      const { exchangeClient, infoClient } = useStrategyClients({
        exchange: { order: vi.fn().mockResolvedValue(chaseRested) },
      });
      const result = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
      });
      infoClient.orderStatus.mockResolvedValueOnce({ status: 'unknownOid' });

      const snapshots = await provider.getChaseOrders();

      expect(snapshots).toContainEqual(
        expect.objectContaining({
          handle: result.orderId,
          remainingSize: '1',
          restingOrderId: '55',
          status: 'active',
        }),
      );
      expect(infoClient.orderStatus).toHaveBeenCalledTimes(2);

      expect(
        await provider.cancelOrder({
          orderId: result.orderId,
          symbol: 'ETH',
          orderType: 'chase',
        }),
      ).toStrictEqual({ success: true, orderId: result.orderId });
      expect(exchangeClient.cancel).toHaveBeenCalledWith({
        cancels: [{ a: 1, o: 55 }],
      });
    });

    it('marks a confirmed fill and stops the Chase timer', async () => {
      vi.useFakeTimers();
      const order = vi.fn().mockResolvedValue(chaseRested);
      const { exchangeClient, infoClient } = useStrategyClients({
        exchange: { order },
      });
      const result = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
      } satisfies OrderParams);
      infoClient.orderStatus.mockResolvedValueOnce({
        status: 'order',
        order: {
          status: 'filled',
          order: {
            coin: 'ETH',
            side: 'B',
            limitPx: '2999.1',
            sz: '0',
            origSz: '1',
            oid: 55,
            timestamp: 1_700_000_000_000,
            isTrigger: false,
            triggerCondition: 'N/A',
            triggerPx: '0',
            children: [],
            isPositionTpsl: false,
            reduceOnly: false,
            orderType: 'Limit',
          },
        },
      });

      expect(await provider.getChaseOrders()).toContainEqual(
        expect.objectContaining({
          handle: result.orderId,
          remainingSize: '0',
          restingOrderId: null,
          status: 'filled',
        }),
      );

      await vi.advanceTimersByTimeAsync(5000);

      expect(order).toHaveBeenCalledTimes(1);
      expect(exchangeClient.cancel).not.toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('does not report an externally cancelled child as filled', async () => {
      const { infoClient } = useStrategyClients({
        exchange: { order: vi.fn().mockResolvedValue(chaseRested) },
      });
      const result = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
      } satisfies OrderParams);
      infoClient.orderStatus.mockResolvedValueOnce({
        status: 'order',
        order: {
          status: 'canceled',
          order: {
            coin: 'ETH',
            side: 'B',
            limitPx: '2999.1',
            sz: '0.4',
            origSz: '1',
            oid: 55,
            timestamp: 1_700_000_000_000,
            isTrigger: false,
            triggerCondition: 'N/A',
            triggerPx: '0',
            children: [],
            isPositionTpsl: false,
            reduceOnly: false,
            orderType: 'Limit',
          },
        },
      });

      expect(await provider.getChaseOrders()).toContainEqual(
        expect.objectContaining({
          handle: result.orderId,
          remainingSize: '0.4',
          restingOrderId: null,
          status: CHASE_ORDER_STATUS.Canceled,
        }),
      );
    });

    it('reports a canceled child with no remainder as filled', async () => {
      const { infoClient } = useStrategyClients({
        exchange: { order: vi.fn().mockResolvedValue(chaseRested) },
      });
      const result = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
      } satisfies OrderParams);
      infoClient.orderStatus.mockResolvedValueOnce({
        status: 'order',
        order: {
          status: 'canceled',
          order: {
            coin: 'ETH',
            side: 'B',
            limitPx: '2999.1',
            sz: '0',
            origSz: '1',
            oid: 55,
            timestamp: 1_700_000_000_000,
            isTrigger: false,
            triggerCondition: 'N/A',
            triggerPx: '0',
            children: [],
            isPositionTpsl: false,
            reduceOnly: false,
            orderType: 'Limit',
          },
        },
      });

      expect(await provider.getChaseOrders()).toContainEqual(
        expect.objectContaining({
          handle: result.orderId,
          remainingSize: '0',
          restingOrderId: null,
          status: CHASE_ORDER_STATUS.Filled,
        }),
      );
    });

    it('backgrounds every active session without cancelling its resting child', async () => {
      const { exchangeClient } = useStrategyClients({
        exchange: { order: vi.fn().mockResolvedValue(chaseRested) },
      });

      const result = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
      });

      const backgrounded = await provider.suspendChaseOrders();

      expect(backgrounded).toStrictEqual([
        expect.objectContaining({
          handle: result.orderId,
          restingOrderId: '55',
          status: 'backgrounded',
        }),
      ]);
      expect(exchangeClient.cancel).not.toHaveBeenCalled();
      expect(await provider.getChaseOrders()).toStrictEqual(backgrounded);
    });

    it('retains HIP-3 collateral while a Chase child rests and retries cleanup', async () => {
      let chasePlaced = false;
      const clearinghouseState = vi.fn().mockImplementation(({ dex }) => {
        let withdrawable = '1000';
        if (dex === 'xyz') {
          withdrawable = chasePlaced ? '20' : '0';
        }
        return Promise.resolve(createClearinghouseBalance(withdrawable));
      });
      useStrategyClients({
        exchange: {
          order: vi.fn().mockImplementation(async () => {
            chasePlaced = true;
            return chaseRested;
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
        },
      });
      provider = createTestProvider({
        hip3Enabled: true,
        allowlistMarkets: ['xyz:*'],
        useUnifiedAccount: false,
        initialAssetMapping: [['xyz:TSLA', 110000]],
      });
      const transfer = vi
        .spyOn(provider, 'transferBetweenDexs')
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValueOnce({ success: false, error: 'Transfer failed' })
        .mockResolvedValue({ success: true });

      const placed = await provider.placeOrder({
        ...baseOrder,
        symbol: 'xyz:TSLA',
        orderType: 'chase',
      } satisfies OrderParams);

      expect(placed.success).toBe(true);
      expect(transfer).toHaveBeenCalledTimes(1);

      await provider.suspendChaseOrders();

      expect(transfer).toHaveBeenCalledTimes(1);
      await provider.cancelOrder({
        orderId: placed.orderId,
        symbol: 'xyz:TSLA',
        orderType: 'chase',
      });
      expect(transfer).toHaveBeenCalledTimes(2);
      await provider.getChaseOrders();
      expect(transfer).toHaveBeenCalledTimes(3);
      await provider.getChaseOrders();
      expect(transfer).toHaveBeenCalledTimes(3);
    });

    it('reports a backgrounded child that later fills as filled', async () => {
      vi.useFakeTimers();
      const { infoClient } = useStrategyClients({
        exchange: { order: vi.fn().mockResolvedValue(chaseRested) },
      });
      const result = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
      } satisfies OrderParams);

      await provider.suspendChaseOrders();
      infoClient.orderStatus.mockResolvedValueOnce({
        status: 'order',
        order: {
          status: 'filled',
          order: {
            coin: 'ETH',
            side: 'B',
            limitPx: '2999.1',
            sz: '0',
            origSz: '1',
            oid: 55,
            timestamp: 1_700_000_000_000,
            isTrigger: false,
            triggerCondition: 'N/A',
            triggerPx: '0',
            children: [],
            isPositionTpsl: false,
            reduceOnly: false,
            orderType: 'Limit',
          },
        },
      });
      await vi.advanceTimersByTimeAsync(CHASE_ORDER_CONFIG.DefaultIntervalMs);

      expect(await provider.getChaseOrders()).toContainEqual(
        expect.objectContaining({
          handle: result.orderId,
          remainingSize: '0',
          restingOrderId: null,
          status: 'filled',
        }),
      );
      vi.useRealTimers();
    });

    it('fails when the book has no price on the side it must rest at', async () => {
      useStrategyClients({
        exchange: { order: vi.fn().mockResolvedValue(chaseRested) },
        info: {
          l2Book: vi.fn().mockResolvedValue({ coin: 'ETH', levels: [[], []] }),
        },
      });

      const result = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
      } satisfies OrderParams);

      expect(result.success).toBe(false);
      expect(result.error).toBe(
        PERPS_ERROR_CODES.ORDER_CHASE_TOUCH_UNAVAILABLE,
      );
    });

    it('cancels the live order and stops the session', async () => {
      const { exchangeClient } = useStrategyClients({
        exchange: { order: vi.fn().mockResolvedValue(chaseRested) },
      });

      const placed = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
      } satisfies OrderParams);

      const result = await provider.cancelOrder({
        orderId: placed.orderId,
        symbol: 'ETH',
        orderType: 'chase',
      });

      expect(result.success).toBe(true);
      expect(exchangeClient.cancel).toHaveBeenCalledWith({
        cancels: [{ a: 1, o: 55 }],
      });

      // Retrying a completed termination is idempotent. Mobile can receive a
      // stale lifecycle snapshot while the first request is settling.
      const second = await provider.cancelOrder({
        orderId: placed.orderId,
        symbol: 'ETH',
        orderType: 'chase',
      });
      expect(second.success).toBe(true);
      expect(exchangeClient.cancel).toHaveBeenCalledTimes(1);
    });

    it('deduplicates concurrent termination of the same Chase', async () => {
      const cancel = vi.fn().mockResolvedValue({
        status: 'ok',
        response: { data: { statuses: ['success'] } },
      });
      useStrategyClients({
        exchange: { order: vi.fn().mockResolvedValue(chaseRested), cancel },
      });
      const placed = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
      });

      const first = provider.cancelOrder({
        orderId: placed.orderId,
        symbol: 'ETH',
        orderType: 'chase',
      });
      const second = provider.cancelOrder({
        orderId: placed.orderId,
        symbol: 'ETH',
        orderType: 'chase',
      });

      const results = await Promise.all([first, second]);

      expect(results).toStrictEqual([
        { success: true, orderId: placed.orderId },
        { success: true, orderId: placed.orderId },
      ]);
      expect(cancel).toHaveBeenCalledTimes(1);
    });

    it('stops the owning session when its child is cancelled directly', async () => {
      useStrategyClients({
        exchange: { order: vi.fn().mockResolvedValue(chaseRested) },
      });

      await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
      });

      expect(
        await provider.cancelOrder({ orderId: '55', symbol: 'ETH' }),
      ).toStrictEqual({ success: true, orderId: '55' });
      expect(await provider.getChaseOrders()).toStrictEqual([]);
    });

    it('returns an error result when child cancellation setup fails', async () => {
      useStrategyClients({
        exchange: { order: vi.fn().mockResolvedValue(chaseRested) },
      });

      await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
      });
      mockWalletService.getUserAddressWithDefault.mockRejectedValueOnce(
        new Error('Trading setup failed'),
      );

      const result = await provider.cancelOrder({
        orderId: '55',
        symbol: 'ETH',
      });

      expect(result).toStrictEqual({
        success: false,
        error: 'Trading setup failed',
        orderId: '55',
      });
    });

    it('backgrounds an admitted placement while blocking newer placements', async () => {
      let settleOrder: ((value: typeof chaseRested) => void) | undefined;
      let notifyOrderStarted: (() => void) | undefined;
      const orderStarted = new Promise<void>((resolve) => {
        notifyOrderStarted = resolve;
      });
      const order = vi.fn().mockImplementation(async () => {
        notifyOrderStarted?.();
        return await new Promise<typeof chaseRested>((resolve) => {
          settleOrder = resolve;
        });
      });
      useStrategyClients({ exchange: { order } });

      const admitted = provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
      });
      await orderStarted;
      const suspension = provider.suspendChaseOrders();
      const blocked = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
      });
      settleOrder?.(chaseRested);

      const admittedResult = await admitted;
      const backgrounded = await suspension;
      expect(blocked.success).toBe(false);
      expect(blocked.error).toBe(PERPS_ERROR_CODES.ORDER_CHASE_ABANDONED);
      expect(admittedResult.success).toBe(true);
      expect(backgrounded).toStrictEqual([
        expect.objectContaining({
          handle: admittedResult.orderId,
          restingOrderId: '55',
          status: 'backgrounded',
        }),
      ]);
      expect(await provider.getChaseOrders()).toStrictEqual(backgrounded);
      expect(order).toHaveBeenCalledTimes(1);
    });

    it('reports an incomplete chase cancel and keeps the handle for a retry', async () => {
      const cancel = vi
        .fn()
        .mockResolvedValueOnce({
          status: 'ok',
          response: { data: { statuses: [{ error: 'multi-sig required' }] } },
        })
        .mockResolvedValue({
          status: 'ok',
          response: { data: { statuses: ['success'] } },
        });
      useStrategyClients({
        exchange: { order: vi.fn().mockResolvedValue(chaseRested), cancel },
      });

      const placed = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
      } satisfies OrderParams);

      const first = await provider.cancelOrder({
        orderId: placed.orderId,
        symbol: 'ETH',
        orderType: 'chase',
      });
      expect(first.success).toBe(false);
      expect(first.error).toBe(
        PERPS_ERROR_CODES.ORDER_STRATEGY_CANCEL_INCOMPLETE,
      );
      expect(await provider.getChaseOrders()).toStrictEqual([
        expect.objectContaining({
          handle: placed.orderId,
          restingOrderId: '55',
          status: 'termination_pending',
        }),
      ]);

      const second = await provider.cancelOrder({
        orderId: placed.orderId,
        symbol: 'ETH',
        orderType: 'chase',
      });
      expect(second.success).toBe(true);
    });

    it('keeps the terminal reason when cancelling a stopped Chase fails', async () => {
      vi.useFakeTimers();
      const cancel = vi.fn().mockResolvedValue({
        status: 'ok',
        response: { data: { statuses: [{ error: 'multi-sig required' }] } },
      });
      useStrategyClients({
        exchange: { order: vi.fn().mockResolvedValue(chaseRested), cancel },
      });
      const placed = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
        chaseMaxDurationMs: 1000,
      });
      await vi.advanceTimersByTimeAsync(1000);

      const result = await provider.cancelOrder({
        orderId: placed.orderId,
        symbol: 'ETH',
        orderType: 'chase',
      });

      expect(result).toMatchObject({
        success: false,
        error: PERPS_ERROR_CODES.ORDER_STRATEGY_CANCEL_INCOMPLETE,
      });
      expect(await provider.getChaseOrders()).toStrictEqual([
        expect.objectContaining({
          handle: placed.orderId,
          status: 'duration_reached',
        }),
      ]);
      vi.useRealTimers();
    });

    it('rejects a cancel for a session it does not hold', async () => {
      useStrategyClients();

      const result = await provider.cancelOrder({
        orderId: 'chase-does-not-exist',
        symbol: 'ETH',
        orderType: 'chase',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe(
        PERPS_ERROR_CODES.ORDER_STRATEGY_HANDLE_UNKNOWN,
      );
    });
  });

  describe('Placement validation', () => {
    it('does not reach the exchange when shared validation rejects', async () => {
      const { exchangeClient, infoClient } = useStrategyClients();
      mockValidateOrderParams.mockReturnValue({
        isValid: false,
        error: PERPS_ERROR_CODES.ORDER_TWAP_DURATION_INVALID,
      });

      const result = await provider.placeOrder({
        ...baseOrder,
        orderType: 'twap',
        twapDuration: 30,
      } satisfies OrderParams);

      expect(result.success).toBe(false);
      expect(exchangeClient.order).not.toHaveBeenCalled();
      expect(exchangeClient.twapOrder).not.toHaveBeenCalled();
      expect(exchangeClient.updateLeverage).not.toHaveBeenCalled();
      expect(infoClient.l2Book).not.toHaveBeenCalled();
    });

    it.each([
      ['twap', { orderType: 'twap', twapDuration: 30 }],
      [
        'scale',
        {
          orderType: 'scale',
          scaleMinPrice: '2900',
          scaleMaxPrice: '3100',
          scaleNumOrders: 3,
        },
      ],
      ['chase', { orderType: 'chase' }],
    ] as const)(
      'places a %s strategy on a HIP-3 market',
      async (_, strategy) => {
        provider = createTestProvider({
          hip3Enabled: true,
          allowlistMarkets: ['xyz:*'],
          initialAssetMapping: [['xyz:TSLA', 110000]],
        });
        const { exchangeClient } = useStrategyClients({
          info: {
            meta: vi.fn().mockResolvedValue({
              universe: [{ name: 'xyz:TSLA', szDecimals: 3, maxLeverage: 20 }],
              collateralToken: 0,
            }),
            perpDexs: vi.fn().mockResolvedValue([null, { name: 'xyz' }]),
            allMids: vi.fn().mockResolvedValue({ 'xyz:TSLA': '3000' }),
          },
        });

        const result = await provider.placeOrder({
          ...baseOrder,
          ...strategy,
          symbol: 'xyz:TSLA',
        } satisfies OrderParams);

        expect(result.error).toBeUndefined();
        expect(result.success).toBe(true);
        const isTwap = strategy.orderType === 'twap';
        expect(exchangeClient.twapOrder).toHaveBeenCalledTimes(isTwap ? 1 : 0);
        expect(exchangeClient.order).toHaveBeenCalledTimes(isTwap ? 0 : 1);

        const assetIds = isTwap
          ? exchangeClient.twapOrder.mock.calls.map(
              ([request]) => request.twap.a,
            )
          : exchangeClient.order.mock.calls.flatMap(([request]) =>
              request.orders.map((order) => order.a),
            );
        expect(assetIds).toContain(110000);
      },
    );
  });

  describe('HIP-3 collateral transfers after an order', () => {
    /**
     * A HIP-3 market order placed outside unified accounts, so collateral
     * moves to the xyz DEX before the order and back after it.
     *
     * @param orderResponse - The venue's answer to the order.
     * @returns The provider's DEX transfers, which the test answers, and the
     * mocked exchange client.
     */
    const useHip3MarketOrder = (
      orderResponse: Record<string, unknown>,
    ): {
      transfer: MockInstance;
      order: Mock;
      exchangeClient: MockClient;
    } => {
      let ordered = false;
      const order = vi.fn(async () => {
        ordered = true;
        return orderResponse;
      });
      const { exchangeClient } = useStrategyClients({
        exchange: { order },
        info: {
          clearinghouseState: vi
            .fn()
            .mockImplementation(({ dex }: { dex?: string }) => {
              let withdrawable = '10000';
              if (dex === 'xyz') {
                // Empty before the order, with excess left after it.
                withdrawable = ordered ? '20' : '0';
              }
              return Promise.resolve(createClearinghouseBalance(withdrawable));
            }),
          perpDexs: vi.fn().mockResolvedValue([null, { name: 'xyz' }]),
          meta: vi.fn().mockResolvedValue({
            universe: [{ name: 'xyz:TSLA', szDecimals: 3, maxLeverage: 20 }],
            collateralToken: 0,
          }),
          allMids: vi.fn().mockResolvedValue({ 'xyz:TSLA': '3000' }),
        },
      });
      provider = createTestProvider({
        hip3Enabled: true,
        allowlistMarkets: ['xyz:*'],
        useUnifiedAccount: false,
        initialAssetMapping: [['xyz:TSLA', 110000]],
      });
      return {
        transfer: vi.spyOn(provider, 'transferBetweenDexs'),
        order,
        exchangeClient,
      };
    };

    const HIP3_MARKET_ORDER = {
      ...baseOrder,
      orderType: 'market',
      symbol: 'xyz:TSLA',
    } satisfies OrderParams;
    // The order's margin, with its buffer, moved to the xyz DEX and back.
    const PRE_ORDER_TRANSFER = {
      sourceDex: '',
      destinationDex: 'xyz',
      amount: '154.963500',
    };
    const ROLLBACK_TRANSFER = {
      sourceDex: 'xyz',
      destinationDex: '',
      amount: '154.963500',
    };
    // The 20 USDC left on xyz after the order, less the 0.1 USDC buffer.
    const REBALANCE_TRANSFER = {
      sourceDex: 'xyz',
      destinationDex: '',
      amount: '19.900000',
    };
    const REFUSED_ORDER = { status: 'err', response: 'venue busy' };
    const ORDER_FAILURE = `Order failed: ${JSON.stringify(REFUSED_ORDER)}`;
    const ROLLBACK_NOT_SIGNED =
      'HyperLiquidProvider: Rollback not signed - funds remain on HIP-3 DEX';
    const REBALANCE_NOT_SIGNED =
      'HyperLiquidProvider: Auto-rebalance not signed - funds remain on HIP-3 DEX';

    /**
     * The transfers noted as not signed, with their details.
     *
     * @returns Each note's message and details.
     */
    const unsignedTransferNotes = (): [unknown, unknown][] =>
      (
        mockPlatformDependencies.debugLogger.log as Mock<
          (message: unknown, details: unknown) => void
        >
      ).mock.calls.filter(
        ([message]) =>
          message === ROLLBACK_NOT_SIGNED || message === REBALANCE_NOT_SIGNED,
      );

    /**
     * The errors reported, with the provider method named in each.
     *
     * @returns Each reported error's message and method.
     */
    const reportedErrors = (): [string, unknown][] =>
      (
        mockPlatformDependencies.logger.error as unknown as Mock<
          (
            error: Error,
            options: { context: { data: { method: unknown } } },
          ) => void
        >
      ).mock.calls.map(([error, options]) => [
        error.message,
        options.context.data.method,
      ]);

    it('reads an omitted margin mode from the HIP-3 DEX position slice', async () => {
      const { transfer, exchangeClient } = useHip3MarketOrder(REFUSED_ORDER);
      transfer.mockResolvedValueOnce({
        success: false,
        error: PERPS_ERROR_CODES.KEYRING_LOCKED,
      });
      // Only the xyz slice holds the position, so its mode proves the lookup
      // routes a HIP-3 symbol to its own DEX cache.
      mockSubscriptionService.getCachedPositionsForDex.mockImplementation(
        (dexName: string) =>
          dexName === 'xyz'
            ? [
                createMockPosition({
                  symbol: 'xyz:TSLA',
                  leverage: { type: 'cross', value: 5 },
                }),
              ]
            : null,
      );

      await provider.placeOrder({ ...HIP3_MARKET_ORDER, leverage: 5 });

      expect(exchangeClient.updateLeverage).toHaveBeenCalledWith({
        asset: 110000,
        isCross: true,
        leverage: 5,
      });
    });

    it('fails a HIP-3 order with KEYRING_LOCKED, sending nothing, when its collateral transfer cannot be signed', async () => {
      const { transfer, order } = useHip3MarketOrder(REFUSED_ORDER);
      transfer.mockResolvedValueOnce({
        success: false,
        error: PERPS_ERROR_CODES.KEYRING_LOCKED,
      });

      const result = await provider.placeOrder(HIP3_MARKET_ORDER);

      expect(result).toStrictEqual({
        success: false,
        error: PERPS_ERROR_CODES.KEYRING_LOCKED,
      });
      expect(transfer.mock.calls).toStrictEqual([
        [PRE_ORDER_TRANSFER, expect.any(Object)],
      ]);
      expect(order).not.toHaveBeenCalled();
      expect(reportedErrors()).toStrictEqual([]);
    });

    it.each([
      {
        transferError: PERPS_ERROR_CODES.KEYRING_LOCKED,
        reported: [[ORDER_FAILURE, 'placeOrder']],
        notes: [[ROLLBACK_NOT_SIGNED, { dex: 'xyz', amount: 154.9635 }]],
      },
      {
        transferError: 'transfer failed',
        reported: [
          ['transfer failed', 'placeOrder:rollback'],
          [ORDER_FAILURE, 'placeOrder'],
        ],
        notes: [],
      },
    ])(
      'reports the rollback of a failed HIP-3 order only when it fails for a reason other than the signer ($transferError)',
      async ({ transferError, reported, notes }) => {
        const { transfer } = useHip3MarketOrder(REFUSED_ORDER);
        transfer
          .mockResolvedValueOnce({ success: true })
          .mockResolvedValueOnce({ success: false, error: transferError });

        const result = await provider.placeOrder(HIP3_MARKET_ORDER);

        expect(result).toStrictEqual({ success: false, error: ORDER_FAILURE });
        expect(transfer.mock.calls).toStrictEqual([
          [PRE_ORDER_TRANSFER, expect.any(Object)],
          [ROLLBACK_TRANSFER, expect.any(Object)],
        ]);
        expect(reportedErrors()).toStrictEqual(reported);
        expect(unsignedTransferNotes()).toStrictEqual(notes);
      },
    );

    it.each([
      {
        transferError: PERPS_ERROR_CODES.KEYRING_LOCKED,
        reported: [],
        notes: [[REBALANCE_NOT_SIGNED, { dex: 'xyz', excessAmount: 19.9 }]],
      },
      {
        transferError: 'transfer failed',
        reported: [['transfer failed', 'placeOrder:autoRebalance']],
        notes: [],
      },
    ])(
      'reports the rebalance after a HIP-3 order only when it fails for a reason other than the signer ($transferError)',
      async ({ transferError, reported, notes }) => {
        const { transfer } = useHip3MarketOrder({
          status: 'ok',
          response: {
            data: {
              statuses: [{ filled: { oid: 7, totalSz: '1', avgPx: '3000' } }],
            },
          },
        });
        transfer
          .mockResolvedValueOnce({ success: true })
          .mockResolvedValueOnce({ success: false, error: transferError });

        const result = await provider.placeOrder(HIP3_MARKET_ORDER);

        // The order succeeded either way.
        expect(result).toStrictEqual({
          success: true,
          orderId: '7',
          filledSize: '1',
          submittedSize: '1',
          averagePrice: '3000',
        });
        expect(transfer.mock.calls).toStrictEqual([
          [PRE_ORDER_TRANSFER, expect.any(Object)],
          [REBALANCE_TRANSFER, expect.any(Object)],
        ]);
        expect(reportedErrors()).toStrictEqual(reported);
        expect(unsignedTransferNotes()).toStrictEqual(notes);
      },
    );
  });

  describe('Existing order types are unaffected', () => {
    it('still routes a market order through the order action', async () => {
      const { exchangeClient } = useStrategyClients();

      const result = await provider.placeOrder({
        ...baseOrder,
        orderType: 'market',
      } satisfies OrderParams);

      expect(result.success).toBe(true);
      expect(exchangeClient.order).toHaveBeenCalledTimes(1);
      expect(exchangeClient.twapOrder).not.toHaveBeenCalled();
    });

    it('still routes a limit order through the order action', async () => {
      const { exchangeClient } = useStrategyClients();

      const result = await provider.placeOrder({
        ...baseOrder,
        orderType: 'limit',
        price: '2900',
      } satisfies OrderParams);

      expect(result.success).toBe(true);
      expect(exchangeClient.order).toHaveBeenCalledTimes(1);
      expect(exchangeClient.twapOrder).not.toHaveBeenCalled();
    });
  });

  describe('Chase re-pricing loop', () => {
    /**
     * A successful single-order response resting the given exchange ID.
     *
     * @param oid - Exchange order ID to report as resting.
     * @returns The exchange response.
     */
    const chaseRested = (oid: number): Record<string, unknown> => ({
      status: 'ok',
      response: { data: { statuses: [{ resting: { oid } }] } },
    });

    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    /**
     * Build an l2Book mock that walks through the supplied best bids.
     *
     * @param bids - Best bid for each successive read; the last repeats.
     * @returns The mock.
     */
    const bookWalkingBids = (bids: string[]): Mock => {
      let call = 0;
      return vi.fn().mockImplementation(async () => {
        const px = bids[Math.min(call, bids.length - 1)];
        call += 1;
        return {
          coin: 'ETH',
          levels: [[{ px, sz: '10', n: 1 }], [{ px: '3001', sz: '10', n: 1 }]],
        };
      });
    };

    it('cancels and re-places when the touch moves', async () => {
      const order = vi
        .fn()
        .mockResolvedValueOnce(chaseRested(55))
        .mockResolvedValue(chaseRested(66));
      const { exchangeClient } = useStrategyClients({
        exchange: { order },
        info: { l2Book: bookWalkingBids(['2999', '2998']) },
      });

      await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
      } satisfies OrderParams);

      await vi.advanceTimersByTimeAsync(1000);

      expect(exchangeClient.cancel).toHaveBeenCalledWith({
        cancels: [{ a: 1, o: 55 }],
      });
      expect(order).toHaveBeenCalledTimes(2);
      expect(order.mock.calls[1][0].orders[0].p).toBe('2998.1');
      expect(order.mock.calls[1][0].orders[0].t).toStrictEqual({
        limit: { tif: 'Alo' },
      });
    });

    it('does not replace a child cancelled directly during a reprice', async () => {
      let settleCancel: ((value: Record<string, unknown>) => void) | undefined;
      let notifyCancelStarted: (() => void) | undefined;
      const cancelStarted = new Promise<void>((resolve) => {
        notifyCancelStarted = resolve;
      });
      const cancel = vi.fn().mockImplementation(async () => {
        notifyCancelStarted?.();
        return await new Promise<Record<string, unknown>>((resolve) => {
          settleCancel = resolve;
        });
      });
      const order = vi
        .fn()
        .mockResolvedValueOnce(chaseRested(55))
        .mockResolvedValue(chaseRested(66));
      useStrategyClients({
        exchange: { order, cancel },
        info: { l2Book: bookWalkingBids(['2999', '2998']) },
      });

      await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
      });
      const ticking = vi.advanceTimersByTimeAsync(1000);
      await cancelStarted;
      const directCancellation = provider.cancelOrder({
        orderId: '55',
        symbol: 'ETH',
      });
      settleCancel?.({
        status: 'ok',
        response: { data: { statuses: ['success'] } },
      });

      await ticking;
      expect(await directCancellation).toMatchObject({ success: true });
      expect(order).toHaveBeenCalledTimes(1);
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(await provider.getChaseOrders()).toStrictEqual([]);
    });

    it('does not replace a Chase child cancelled in a batch during a reprice', async () => {
      let settleCancel: ((value: Record<string, unknown>) => void) | undefined;
      let notifyCancelStarted: (() => void) | undefined;
      const cancelStarted = new Promise<void>((resolve) => {
        notifyCancelStarted = resolve;
      });
      const cancel = vi.fn().mockImplementation(async () => {
        notifyCancelStarted?.();
        return await new Promise<Record<string, unknown>>((resolve) => {
          settleCancel = resolve;
        });
      });
      const order = vi
        .fn()
        .mockResolvedValueOnce(chaseRested(55))
        .mockResolvedValue(chaseRested(66));
      useStrategyClients({
        exchange: { order, cancel },
        info: { l2Book: bookWalkingBids(['2999', '2998']) },
      });

      await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
      });
      const ticking = vi.advanceTimersByTimeAsync(1000);
      await cancelStarted;
      const batchCancellation = provider.cancelOrders([
        { orderId: '55', symbol: 'ETH' },
      ]);
      settleCancel?.({
        status: 'ok',
        response: { data: { statuses: ['success'] } },
      });

      await ticking;
      expect(await batchCancellation).toStrictEqual({
        success: true,
        successCount: 1,
        failureCount: 0,
        results: [{ orderId: '55', symbol: 'ETH', success: true }],
      });
      expect(order).toHaveBeenCalledTimes(1);
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(await provider.getChaseOrders()).toStrictEqual([]);
    });

    it('finishes an admitted reprice before suspending its replacement', async () => {
      let settleCancel: ((value: Record<string, unknown>) => void) | undefined;
      let notifyCancelStarted: (() => void) | undefined;
      const cancelStarted = new Promise<void>((resolve) => {
        notifyCancelStarted = resolve;
      });
      const cancel = vi.fn().mockImplementation(async () => {
        notifyCancelStarted?.();
        return await new Promise<Record<string, unknown>>((resolve) => {
          settleCancel = resolve;
        });
      });
      const order = vi
        .fn()
        .mockResolvedValueOnce(chaseRested(55))
        .mockResolvedValue(chaseRested(66));
      useStrategyClients({
        exchange: { order, cancel },
        info: { l2Book: bookWalkingBids(['2999', '2998']) },
      });

      const placed = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
      });
      const ticking = vi.advanceTimersByTimeAsync(1000);
      await cancelStarted;

      const suspension = provider.suspendChaseOrders();
      settleCancel?.({
        status: 'ok',
        response: { data: { statuses: ['success'] } },
      });

      await ticking;
      expect(await suspension).toStrictEqual([
        expect.objectContaining({
          handle: placed.orderId,
          restingOrderId: '66',
          status: 'backgrounded',
        }),
      ]);
      expect(order).toHaveBeenCalledTimes(2);
      expect(cancel).toHaveBeenCalledTimes(1);
    });

    it('leaves the order alone while the touch holds still', async () => {
      const order = vi.fn().mockResolvedValue(chaseRested(55));
      const { exchangeClient } = useStrategyClients({
        exchange: { order },
        info: { l2Book: bookWalkingBids(['2999']) },
      });

      await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
      } satisfies OrderParams);

      await vi.advanceTimersByTimeAsync(3000);

      expect(exchangeClient.cancel).not.toHaveBeenCalled();
      expect(order).toHaveBeenCalledTimes(1);
    });

    it('uses the throttled default interval when none is supplied', async () => {
      const order = vi
        .fn()
        .mockResolvedValueOnce(chaseRested(55))
        .mockResolvedValue(chaseRested(66));
      const { exchangeClient } = useStrategyClients({
        exchange: { order },
        info: { l2Book: bookWalkingBids(['2999', '2998']) },
      });

      await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
      });

      await vi.advanceTimersByTimeAsync(
        CHASE_ORDER_CONFIG.DefaultIntervalMs - 1,
      );
      expect(exchangeClient.cancel).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      expect(exchangeClient.cancel).toHaveBeenCalledTimes(1);
      expect(order).toHaveBeenCalledTimes(2);
    });

    it('defers re-pricing while another Chase placement is in flight', async () => {
      const order = vi
        .fn()
        .mockResolvedValueOnce(chaseRested(55))
        .mockResolvedValueOnce(chaseRested(66));
      const { exchangeClient, infoClient } = useStrategyClients({
        exchange: { order },
        info: { l2Book: bookWalkingBids(['2999', '2998', '2998']) },
      });

      await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
      });

      let finishBookRead: (() => void) | undefined;
      infoClient.l2Book.mockImplementationOnce(
        (): Promise<Record<string, unknown>> =>
          new Promise<Record<string, unknown>>((resolve) => {
            finishBookRead = (): void =>
              resolve({
                coin: 'ETH',
                levels: [
                  [{ px: '2998', sz: '10', n: 1 }],
                  [{ px: '3001', sz: '10', n: 1 }],
                ],
              });
          }),
      );
      const secondPlacement = provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
      });
      await vi.advanceTimersByTimeAsync(0);
      for (let turn = 0; turn < 20; turn += 1) {
        if (finishBookRead !== undefined) {
          break;
        }
        await Promise.resolve();
      }
      expect(finishBookRead).toBeDefined();

      await vi.advanceTimersByTimeAsync(1000);

      expect(exchangeClient.cancel).not.toHaveBeenCalled();
      expect(order).toHaveBeenCalledTimes(1);

      finishBookRead?.();
      expect(await secondPlacement).toMatchObject({ success: true });
      expect(order).toHaveBeenCalledTimes(2);
    });

    it('drains an in-flight re-price before starting another Chase placement', async () => {
      const order = vi
        .fn()
        .mockResolvedValueOnce(chaseRested(55))
        .mockResolvedValueOnce(chaseRested(66))
        .mockResolvedValueOnce(chaseRested(77));
      const { infoClient } = useStrategyClients({
        exchange: { order },
        info: { l2Book: bookWalkingBids(['2999']) },
      });

      await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
      });

      let finishTickBookRead: (() => void) | undefined;
      infoClient.l2Book.mockImplementationOnce(
        (): Promise<Record<string, unknown>> =>
          new Promise<Record<string, unknown>>((resolve) => {
            finishTickBookRead = (): void =>
              resolve({
                coin: 'ETH',
                levels: [
                  [{ px: '2998', sz: '10', n: 1 }],
                  [{ px: '3001', sz: '10', n: 1 }],
                ],
              });
          }),
      );
      await vi.advanceTimersByTimeAsync(1000);
      expect(finishTickBookRead).toBeDefined();

      const secondPlacement = provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
      });
      await vi.advanceTimersByTimeAsync(0);

      expect(order).toHaveBeenCalledTimes(1);

      finishTickBookRead?.();
      expect(await secondPlacement).toMatchObject({ success: true });
      expect(order).toHaveBeenCalledTimes(3);
    });

    it('stops chasing once the order is no longer resting', async () => {
      const order = vi.fn().mockResolvedValue(chaseRested(55));
      const { exchangeClient, infoClient } = useStrategyClients({
        exchange: {
          order,
          // A cancel the exchange refuses means the order already left the book.
          cancel: vi.fn().mockResolvedValue({
            status: 'ok',
            response: {
              data: { statuses: [{ error: 'Order was never placed' }] },
            },
          }),
        },
        info: {
          l2Book: vi
            .fn()
            .mockResolvedValueOnce({
              coin: 'ETH',
              levels: [
                [{ px: '2999', sz: '10', n: 1 }],
                [{ px: '3001', sz: '10', n: 1 }],
              ],
            })
            .mockResolvedValue({
              coin: 'ETH',
              levels: [
                [
                  { px: '2999.1', sz: '10', n: 1 },
                  { px: '2998', sz: '10', n: 1 },
                ],
                [{ px: '3001', sz: '10', n: 1 }],
              ],
            }),
          orderStatus: vi.fn().mockResolvedValue({ status: 'unknownOid' }),
        },
      });

      await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
      } satisfies OrderParams);

      await vi.advanceTimersByTimeAsync(5000);

      expect(exchangeClient.cancel).toHaveBeenCalledTimes(1);
      // No replacement was rested after the failed cancel.
      expect(order).toHaveBeenCalledTimes(1);
      expect(infoClient.orderStatus).toHaveBeenCalledTimes(3);
      expect(await provider.getChaseOrders()).toContainEqual(
        expect.objectContaining({
          restingOrderId: null,
          status: CHASE_ORDER_STATUS.Failed,
        }),
      );
    });

    it('stops re-pricing at the repricing cap', async () => {
      const order = vi.fn().mockResolvedValue(chaseRested(55));
      useStrategyClients({
        exchange: { order },
        info: { l2Book: bookWalkingBids(['2999', '2998', '2997', '2996']) },
      });

      await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
        chaseMaxRepricings: 1,
      } satisfies OrderParams);

      await vi.advanceTimersByTimeAsync(5000);

      // One initial placement plus exactly one re-price.
      expect(order).toHaveBeenCalledTimes(2);
    });

    it('stops re-pricing once the window closes', async () => {
      const order = vi.fn().mockResolvedValue(chaseRested(55));
      useStrategyClients({
        exchange: { order },
        info: { l2Book: bookWalkingBids(['2999', '2998', '2997', '2996']) },
      });

      await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
        chaseMaxDurationMs: 2000,
      } satisfies OrderParams);

      await vi.advanceTimersByTimeAsync(10_000);

      // Ticks at 1s and 2s; the 2s tick finds the deadline reached and stops,
      // so only the first one re-prices.
      expect(order).toHaveBeenCalledTimes(2);
    });

    it('rests at the configured max-distance boundary and stops chasing', async () => {
      const onChaseOrderMaxDistanceReached = vi.fn();
      provider = createTestProvider({ onChaseOrderMaxDistanceReached });
      const order = vi
        .fn()
        .mockResolvedValueOnce(chaseRested(55))
        .mockResolvedValue(chaseRested(66));
      useStrategyClients({
        exchange: { order },
        info: { l2Book: bookWalkingBids(['2999', '3040']) },
      });

      const placed = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
        chaseMaxDistanceBps: 100,
      } satisfies OrderParams);

      await vi.advanceTimersByTimeAsync(5000);

      expect(order).toHaveBeenCalledTimes(2);
      expect(order.mock.calls[1][0].orders[0].p).toBe('3029');
      expect(await provider.getChaseOrders()).toStrictEqual([
        expect.objectContaining({
          handle: placed.orderId,
          restingOrderId: '66',
          restingPrice: '3029',
          distanceChasedBps: 100,
          status: 'max_distance_reached',
        }),
      ]);
      expect(onChaseOrderMaxDistanceReached).toHaveBeenCalledWith({
        handle: placed.orderId,
        symbol: 'ETH',
        side: 'buy',
        restingOrderId: '66',
        restingPrice: '3029',
        maxDistanceBps: 100,
        timestamp: expect.any(Number),
        providerId: 'hyperliquid',
      });
    });

    it('keeps chasing when the touch moves favorably beyond max distance', async () => {
      const order = vi
        .fn()
        .mockResolvedValueOnce(chaseRested(55))
        .mockResolvedValue(chaseRested(66));
      useStrategyClients({
        exchange: { order },
        info: { l2Book: bookWalkingBids(['2999', '2900']) },
      });

      await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
        chaseMaxDistanceBps: 100,
      });

      await vi.advanceTimersByTimeAsync(1000);

      expect(order).toHaveBeenCalledTimes(2);
      expect(await provider.getChaseOrders()).toStrictEqual([
        expect.objectContaining({
          status: 'active',
          restingPrice: '2900.1',
          distanceChasedBps: 0,
        }),
      ]);
    });

    it('stops every running chase on disconnect', async () => {
      const order = vi.fn().mockResolvedValue(chaseRested(55));
      const { exchangeClient } = useStrategyClients({
        exchange: { order },
        info: { l2Book: bookWalkingBids(['2999', '2998', '2997']) },
      });

      await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
      } satisfies OrderParams);

      await provider.disconnect();
      await vi.advanceTimersByTimeAsync(5000);

      // Disconnecting stops the loop; it does not cancel what is already resting.
      expect(order).toHaveBeenCalledTimes(1);
      expect(exchangeClient.cancel).not.toHaveBeenCalled();
    });
  });
});
