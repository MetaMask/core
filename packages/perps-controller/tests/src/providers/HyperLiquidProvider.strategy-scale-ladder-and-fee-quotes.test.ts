import { HyperliquidError } from '@nktkas/hyperliquid';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mocked } from 'vitest';

import { BUILDER_FEE_CONFIG } from '../../../src/constants/hyperLiquidConfig.js';
import { PERPS_ERROR_CODES } from '../../../src/perpsErrorCodes.js';
import { HyperLiquidProvider } from '../../../src/providers/HyperLiquidProvider.js';
import { HyperLiquidWalletService } from '../../../src/services/HyperLiquidWalletService.js';
import type {
  CancelOrderResult,
  FeeCalculationParams,
  OrderParams,
} from '../../../src/types/index.js';
import type { OrderType } from '../../../src/types/perps-types.js';
import {
  baseOrder,
  mockPlatformDependencies,
  setUpStrategyProvider,
  TestApiRequestError,
  useStrategyClients,
} from '../../helpers/hyperLiquidStrategyOrders.js';

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

  beforeEach(() => {
    ({ provider, mockWalletService } = setUpStrategyProvider());
  });

  describe('Scale ladder is not atomic', () => {
    // grouping 'na' evaluates each entry independently, so the venue can rest
    // some rungs and reject others in the same response.
    const partlyRested = {
      status: 'ok',
      response: {
        type: 'order',
        data: {
          statuses: [
            { resting: { oid: 11 } },
            { error: 'Insufficient margin' },
            { resting: { oid: 33 } },
          ],
        },
      },
    };

    const mixedStatuses = [
      { resting: { oid: 11 } },
      'waitingForFill',
      { filled: { oid: 33, avgPx: '2400', totalSz: '0.1' } },
      'waitingForTrigger',
      { filled: { oid: 55, avgPx: '2800', totalSz: '0.05' } },
      { error: 'Insufficient margin' },
    ];

    it.each(['resolved', 'thrown'] as const)(
      'rejects and cleans every accepted status in a mixed %s response containing waiting children',
      async (responseKind) => {
        const response = {
          status: 'ok' as const,
          response: {
            type: 'order' as const,
            data: { statuses: mixedStatuses },
          },
        };
        const order =
          responseKind === 'resolved'
            ? vi.fn().mockResolvedValue(response)
            : vi
                .fn()
                .mockRejectedValue(
                  new TestApiRequestError(
                    response,
                    'order 5: Insufficient margin',
                  ),
                );
        const { exchangeClient } = useStrategyClients({
          exchange: { order },
        });

        const placed = await provider.placeOrder({
          ...baseOrder,
          orderType: 'scale',
          scaleMinPrice: '2000',
          scaleMaxPrice: '3000',
          scaleNumOrders: 6,
        } satisfies OrderParams);

        expect(placed).toMatchObject({
          success: false,
          error: PERPS_ERROR_CODES.ORDER_REJECTED,
          childOrderIds: [],
          acceptedChildren: [
            { orderId: '11', state: 'resting' },
            { state: 'waitingForFill' },
            { orderId: '33', state: 'filled' },
            { state: 'waitingForTrigger' },
            { orderId: '55', state: 'filled' },
          ],
          submittedSize: '1',
          acceptedSize: '0.8334',
          filledSize: '0.15',
          averagePrice: '2533.33333333333333333333',
          weightedAverageLimitPrice: '2399.80801535877129829614',
        });
        expect(placed.orderId).toBeUndefined();
        expect(exchangeClient.cancel).toHaveBeenCalledWith({
          cancels: [{ a: 1, o: 11 }],
        });
        const submittedOrders = order.mock.calls[0][0].orders;
        expect(exchangeClient.cancelByCloid).toHaveBeenCalledWith({
          cancels: [
            { asset: 1, cloid: submittedOrders[1].c },
            { asset: 1, cloid: submittedOrders[2].c },
            { asset: 1, cloid: submittedOrders[3].c },
            { asset: 1, cloid: submittedOrders[4].c },
          ],
        });
      },
    );

    it('treats already-gone waiting-child cleanup as complete', async () => {
      const response = {
        status: 'ok' as const,
        response: {
          type: 'order' as const,
          data: {
            statuses: [
              'waitingForFill',
              'waitingForTrigger',
              { error: 'Insufficient margin' },
            ],
          },
        },
      };
      const cancelResponse = {
        status: 'ok' as const,
        response: {
          type: 'cancel' as const,
          data: {
            statuses: [
              {
                error: 'Order was never placed, already canceled, or filled.',
              },
              'success',
            ],
          },
        },
      };
      const { exchangeClient } = useStrategyClients({
        exchange: {
          order: vi.fn().mockResolvedValue(response),
          cancelByCloid: vi
            .fn()
            .mockRejectedValue(new TestApiRequestError(cancelResponse)),
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
        error: PERPS_ERROR_CODES.ORDER_REJECTED,
        childOrderIds: [],
      });
      expect(placed.orderId).toBeUndefined();
      expect(exchangeClient.cancelByCloid).toHaveBeenCalledTimes(1);
    });

    it('rejects an all-waiting Scale batch and cleans every rung by CLOID', async () => {
      const order = vi.fn().mockResolvedValue({
        status: 'ok',
        response: {
          data: {
            statuses: ['waitingForFill', 'waitingForTrigger', 'waitingForFill'],
          },
        },
      });
      const { exchangeClient } = useStrategyClients({ exchange: { order } });

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
        childOrderIds: [],
      });
      expect(placed.orderId).toBeUndefined();
      const submittedOrders = order.mock.calls[0][0].orders;
      expect(exchangeClient.cancelByCloid).toHaveBeenCalledWith({
        cancels: submittedOrders.map((submittedOrder) => ({
          asset: 1,
          cloid: submittedOrder.c,
        })),
      });
      expect(exchangeClient.cancel).not.toHaveBeenCalled();
    });

    it.each([
      [
        'future status',
        [
          { resting: { oid: 11 } },
          { scheduled: { oid: 22 } },
          { error: 'Insufficient margin' },
        ],
        [1],
        [11],
      ],
      [
        'malformed status',
        [
          { resting: { oid: 11 } },
          { filled: { oid: '22' } },
          { error: 'Insufficient margin' },
        ],
        [1],
        [11],
      ],
      [
        'multi-key hybrid status',
        [
          { resting: { oid: 11 } },
          { resting: { oid: 22 }, error: 'Unknown status' },
          { error: 'Insufficient margin' },
        ],
        [1],
        [11],
      ],
      ['truncated status array', [{ resting: { oid: 11 } }], [1, 2], [11]],
      ['malformed status payload', { resting: { oid: 11 } }, [0, 1, 2], []],
    ])(
      'cancels every unclassified rung by CLOID for a %s',
      async (_label, statuses, unclassifiedIndexes, restingOrderIds) => {
        const order = vi.fn().mockResolvedValue({
          status: 'ok',
          response: { data: { statuses } },
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
        const submittedOrders = order.mock.calls[0][0].orders;
        expect(exchangeClient.cancelByCloid).toHaveBeenCalledWith({
          cancels: unclassifiedIndexes.map((index) => ({
            asset: 1,
            cloid: submittedOrders[index].c,
          })),
        });
        expect(exchangeClient.cancel.mock.calls[0]?.[0]).toStrictEqual(
          restingOrderIds.length > 0
            ? {
                cancels: restingOrderIds.map((orderId) => ({
                  a: 1,
                  o: orderId,
                })),
              }
            : undefined,
        );
      },
    );

    it('keeps an unclassified rung retryable when CLOID cleanup is refused', async () => {
      const order = vi.fn().mockResolvedValue({
        status: 'ok',
        response: {
          data: {
            statuses: [
              { error: 'Insufficient margin' },
              { scheduled: { oid: 22 } },
              { error: 'Insufficient margin' },
            ],
          },
        },
      });
      const cancelByCloid = vi
        .fn()
        .mockResolvedValueOnce({
          status: 'ok',
          response: { data: { statuses: [{ error: 'Invalid nonce' }] } },
        })
        .mockResolvedValueOnce({
          status: 'ok',
          response: { data: { statuses: ['success'] } },
        });
      const { exchangeClient } = useStrategyClients({
        exchange: { order, cancelByCloid },
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
        childOrderIds: [],
      });
      expect(placed.orderId).toMatch(/^scale:/u);
      const submittedOrders = order.mock.calls[0][0].orders;
      expect(cancelByCloid).toHaveBeenNthCalledWith(1, {
        cancels: [{ asset: 1, cloid: submittedOrders[1].c }],
      });

      const retried = await provider.cancelOrder({
        orderId: placed.orderId,
        symbol: 'ETH',
        orderType: 'scale',
      });

      expect(retried).toMatchObject({ success: true, orderId: placed.orderId });
      expect(cancelByCloid).toHaveBeenNthCalledWith(2, {
        cancels: [{ asset: 1, cloid: submittedOrders[1].c }],
      });
      expect(exchangeClient.cancel).not.toHaveBeenCalled();
    });

    it('recovers a mixed Scale response thrown by the SDK', async () => {
      const response = {
        status: 'ok' as const,
        response: {
          type: 'order' as const,
          data: {
            statuses: [
              { resting: { oid: 11 } },
              { filled: { oid: 22, avgPx: '2475', totalSz: '0.2' } },
              { error: 'Insufficient margin' },
            ],
          },
        },
      };
      const { exchangeClient } = useStrategyClients({
        exchange: {
          order: vi
            .fn()
            .mockRejectedValue(
              new TestApiRequestError(response, 'order 2: Insufficient margin'),
            ),
          cancel: vi.fn().mockResolvedValue({
            status: 'ok',
            response: { data: { statuses: ['success'] } },
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

      expect(placed).toMatchObject({
        success: true,
        childOrderIds: ['11'],
        acceptedChildren: [
          { orderId: '11', state: 'resting' },
          { orderId: '22', state: 'filled' },
        ],
        submittedSize: '1',
        acceptedSize: '0.6667',
        filledSize: '0.2',
        averagePrice: '2475',
        weightedAverageLimitPrice: '2249.96250187490625468727',
      });

      expect(
        await provider.cancelOrder({
          orderId: placed.orderId,
          symbol: 'ETH',
          orderType: 'scale',
        }),
      ).toMatchObject({ success: true });
      expect(exchangeClient.cancel).toHaveBeenCalledWith({
        cancels: [{ a: 1, o: 11 }],
      });
    });

    it.each([
      [
        'unknown status',
        [
          { resting: { oid: 11 } },
          { error: 'Insufficient margin' },
          'unknownStatus',
        ],
      ],
      [
        'invalid order ID',
        [
          { resting: { oid: 11 } },
          { error: 'Insufficient margin' },
          { resting: { oid: -1 } },
        ],
      ],
      [
        'hybrid accepted and error entry',
        [
          { resting: { oid: 11 } },
          { error: 'Insufficient margin' },
          { resting: { oid: 33 }, error: 'Invalid status' },
        ],
      ],
    ])(
      'cleans and rethrows a mixed response with a %s',
      async (label, statuses) => {
        const error = new TestApiRequestError(
          {
            status: 'ok',
            response: { type: 'order', data: { statuses } },
          },
          `Malformed bulk response: ${label}`,
        );
        const order = vi.fn().mockRejectedValue(error);
        const { exchangeClient } = useStrategyClients({ exchange: { order } });

        const result = await provider.placeOrder({
          ...baseOrder,
          orderType: 'scale',
          scaleMinPrice: '2000',
          scaleMaxPrice: '3000',
          scaleNumOrders: 3,
        } satisfies OrderParams);

        expect(result).toMatchObject({
          success: false,
          error: PERPS_ERROR_CODES.UNKNOWN_ERROR,
        });
        expect(exchangeClient.cancel).toHaveBeenCalledWith({
          cancels: [{ a: 1, o: 11 }],
        });
        const submittedOrders = order.mock.calls[0][0].orders;
        expect(exchangeClient.cancelByCloid).toHaveBeenCalledWith({
          cancels: [{ asset: 1, cloid: submittedOrders[2].c }],
        });
      },
    );

    it('preserves an all-rejected SDK error for existing error mapping', async () => {
      const error = new TestApiRequestError(
        {
          status: 'ok',
          response: {
            type: 'order',
            data: {
              statuses: [
                { error: 'Multi-sig required' },
                { error: 'Multi-sig required' },
                { error: 'Multi-sig required' },
              ],
            },
          },
        },
        'order 0: Multi-sig required',
      );
      const { exchangeClient } = useStrategyClients({
        exchange: { order: vi.fn().mockRejectedValue(error) },
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
      expect(exchangeClient.cancel).not.toHaveBeenCalled();
      expect(exchangeClient.cancelByCloid).not.toHaveBeenCalled();
    });

    it.each([
      [
        'top-level',
        new TestApiRequestError(
          { status: 'err', response: 'Invalid nonce' },
          'Invalid nonce',
        ),
        PERPS_ERROR_CODES.EXCHANGE_INVALID_NONCE,
      ],
      [
        'malformed',
        new TestApiRequestError(
          {
            status: 'ok',
            response: { type: 'order', data: { statuses: 'invalid' } },
          },
          'Malformed bulk response',
        ),
        PERPS_ERROR_CODES.UNKNOWN_ERROR,
      ],
      [
        'unrelated SDK',
        new HyperliquidError('SDK failure'),
        PERPS_ERROR_CODES.UNKNOWN_ERROR,
      ],
      [
        'non-SDK',
        new Error('Network unavailable'),
        PERPS_ERROR_CODES.UNKNOWN_ERROR,
      ],
    ])('normalizes a %s SDK error', async (_label, error, expectedCode) => {
      const { exchangeClient } = useStrategyClients({
        exchange: { order: vi.fn().mockRejectedValue(error) },
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
        error: expectedCode,
      });
      expect(exchangeClient.cancel).not.toHaveBeenCalled();
    });

    it('keeps accepted rungs when the ladder only partly rests', async () => {
      const { exchangeClient } = useStrategyClients({
        exchange: {
          order: vi.fn().mockResolvedValue(partlyRested),
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
        success: true,
        childOrderIds: ['11', '33'],
        submittedSize: '1',
        acceptedSize: '0.6667',
        weightedAverageLimitPrice: '2499.92500374981250937453',
      });
      expect(result.averagePrice).toBeUndefined();
      expect(exchangeClient.cancel).not.toHaveBeenCalled();
    });

    it('returns filled and resting IDs but cancels only resting rungs', async () => {
      const { exchangeClient } = useStrategyClients({
        exchange: {
          order: vi.fn().mockResolvedValue({
            status: 'ok',
            response: {
              data: {
                statuses: [
                  {
                    filled: { oid: 11, avgPx: '2010', totalSz: '0.25' },
                  },
                  { error: 'Insufficient margin' },
                  { resting: { oid: 33 } },
                ],
              },
            },
          }),
          cancel: vi.fn().mockResolvedValue({
            status: 'ok',
            response: { data: { statuses: ['success'] } },
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
        success: true,
        childOrderIds: ['33'],
        acceptedChildren: [
          { orderId: '11', state: 'filled' },
          { orderId: '33', state: 'resting' },
        ],
        submittedSize: '1',
        acceptedSize: '0.6667',
        filledSize: '0.25',
        averagePrice: '2010',
        weightedAverageLimitPrice: '2499.92500374981250937453',
      });

      const cancelled = await provider.cancelOrder({
        orderId: result.orderId,
        symbol: 'ETH',
        orderType: 'scale',
      });

      expect(cancelled.success).toBe(true);
      expect(exchangeClient.cancel).toHaveBeenCalledWith({
        cancels: [{ a: 1, o: 33 }],
      });
    });

    it('keeps an incomplete cleanup recoverable by its group handle', async () => {
      const cancel = vi
        .fn()
        .mockResolvedValueOnce({
          status: 'ok',
          response: {
            data: { statuses: [{ error: 'Invalid nonce' }, 'success'] },
          },
        })
        .mockResolvedValueOnce({
          status: 'ok',
          response: { data: { statuses: ['success'] } },
        });
      const { exchangeClient } = useStrategyClients({
        exchange: {
          order: vi.fn().mockResolvedValue({
            ...partlyRested,
            status: 'err',
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
        childOrderIds: ['11'],
        submittedSize: '1',
      });

      const retried = await provider.cancelOrder({
        orderId: placed.orderId,
        symbol: 'ETH',
        orderType: 'scale',
      });

      expect(retried.success).toBe(true);
      expect(exchangeClient.cancel).toHaveBeenNthCalledWith(1, {
        cancels: [
          { a: 1, o: 11 },
          { a: 1, o: 33 },
        ],
      });
      expect(exchangeClient.cancel).toHaveBeenNthCalledWith(2, {
        cancels: [{ a: 1, o: 11 }],
      });
    });

    it('accepts filled rungs and exposes all accepted IDs in the result', async () => {
      const { exchangeClient } = useStrategyClients({
        exchange: {
          order: vi.fn().mockResolvedValue({
            status: 'ok',
            response: {
              data: {
                statuses: [
                  { resting: { oid: 11 } },
                  {
                    filled: { oid: 22, avgPx: '2525', totalSz: '0.3' },
                  },
                  { resting: { oid: 33 } },
                ],
              },
            },
          }),
          cancel: vi.fn().mockResolvedValue({
            status: 'ok',
            response: { data: { statuses: ['success', 'success'] } },
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

      expect(placed).toMatchObject({
        success: true,
        childOrderIds: ['11', '33'],
        acceptedChildren: [
          { orderId: '11', state: 'resting' },
          { orderId: '22', state: 'filled' },
          { orderId: '33', state: 'resting' },
        ],
        submittedSize: '1',
        acceptedSize: '1',
        filledSize: '0.3',
        averagePrice: '2525',
        weightedAverageLimitPrice: '2499.95',
      });

      const cancelled = await provider.cancelOrder({
        orderId: placed.orderId,
        symbol: 'ETH',
        orderType: 'scale',
      });

      expect(cancelled.success).toBe(true);
      expect(exchangeClient.cancel).toHaveBeenCalledWith({
        cancels: [
          { a: 1, o: 11 },
          { a: 1, o: 33 },
        ],
      });
    });

    it.each([
      ['negative', -1],
      ['fractional', 22.5],
      ['unsafe', Number.MAX_SAFE_INTEGER + 1],
      ['non-numeric', '22'],
    ])(
      'rejects a malformed %s scale order ID instead of treating it as a rejected rung',
      async (_label, oid) => {
        const { exchangeClient } = useStrategyClients({
          exchange: {
            order: vi.fn().mockResolvedValue({
              status: 'ok',
              response: {
                data: {
                  statuses: [
                    { resting: { oid: 11 } },
                    { resting: { oid } },
                    { error: 'Insufficient margin' },
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

        expect(placed).toMatchObject({
          success: false,
          error: PERPS_ERROR_CODES.ORDER_REJECTED,
          childOrderIds: [],
          submittedSize: '1',
        });
        expect(exchangeClient.cancel).toHaveBeenCalledWith({
          cancels: [{ a: 1, o: 11 }],
        });
      },
    );
  });

  describe('Chase cancel racing a re-pricing tick', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('rests nothing when a cancel lands between the tick cancelling and re-placing', async () => {
      const order = vi
        .fn()
        .mockResolvedValueOnce({
          status: 'ok',
          response: { data: { statuses: [{ resting: { oid: 55 } }] } },
        })
        .mockResolvedValue({
          status: 'ok',
          response: { data: { statuses: [{ resting: { oid: 66 } }] } },
        });

      let sessionId = '';
      let callerCancel: Promise<unknown> | undefined;
      let cancelCalls = 0;
      const cancel = vi.fn().mockImplementation(async () => {
        cancelCalls += 1;
        // Call 1 is the tick's own cancel: the old order is gone and its
        // replacement has not been rested yet. That is precisely the window the
        // guard closes, so the caller's cancel is fired from inside it.
        // `cancelOrder` stops the session synchronously, before its first await.
        if (cancelCalls === 1) {
          callerCancel = provider.cancelOrder({
            orderId: sessionId,
            symbol: 'ETH',
            orderType: 'chase',
          });
        }
        return {
          status: 'ok',
          response: { data: { statuses: ['success'] } },
        };
      });

      useStrategyClients({
        exchange: { order, cancel },
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
                [{ px: '2998', sz: '10', n: 1 }],
                [{ px: '3001', sz: '10', n: 1 }],
              ],
            }),
        },
      });

      const placed = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
      } satisfies OrderParams);
      sessionId = placed.orderId as string;

      await vi.advanceTimersByTimeAsync(1000);
      await callerCancel;

      // Only the original placement. Without the guard the tick would rest a
      // replacement the caller has no handle for and no idea exists.
      expect(order).toHaveBeenCalledTimes(1);
    });

    it('keeps the live child reachable when the tick cancel is refused', async () => {
      let sessionId = '';
      let callerCancel: Promise<CancelOrderResult> | undefined;
      let releasePublicCancel: (() => void) | undefined;
      let cancelCalls = 0;
      const cancel = vi.fn().mockImplementation(async () => {
        cancelCalls += 1;
        if (cancelCalls === 1) {
          mockWalletService.getUserAddressWithDefault.mockReturnValueOnce(
            new Promise((resolve) => {
              releasePublicCancel = (): void =>
                resolve('0x1234567890123456789012345678901234567890');
            }),
          );
          callerCancel = provider.cancelOrder({
            orderId: sessionId,
            symbol: 'ETH',
            orderType: 'chase',
          });
          await Promise.resolve();
          return {
            status: 'ok',
            response: {
              data: { statuses: [{ error: 'cancel refused' }] },
            },
          };
        }

        return cancelCalls === 2
          ? {
              status: 'ok',
              response: {
                data: { statuses: [{ error: 'cancel refused' }] },
              },
            }
          : {
              status: 'ok',
              response: { data: { statuses: ['success'] } },
            };
      });

      useStrategyClients({
        exchange: {
          order: vi.fn().mockResolvedValue({
            status: 'ok',
            response: { data: { statuses: [{ resting: { oid: 55 } }] } },
          }),
          cancel,
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
                [{ px: '2998', sz: '10', n: 1 }],
                [{ px: '3001', sz: '10', n: 1 }],
              ],
            }),
        },
      });

      const placed = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
      } satisfies OrderParams);
      sessionId = placed.orderId as string;

      await vi.advanceTimersByTimeAsync(1000);
      releasePublicCancel?.();

      const first = await callerCancel;
      expect(first.error).toBe(
        PERPS_ERROR_CODES.ORDER_STRATEGY_CANCEL_INCOMPLETE,
      );

      const retry = await provider.cancelOrder({
        orderId: placed.orderId,
        symbol: 'ETH',
        orderType: 'chase',
      });
      expect(retry.success).toBe(true);
      expect(cancel).toHaveBeenLastCalledWith({
        cancels: [{ a: 1, o: 55 }],
      });
    });
  });

  describe('Chase cancel racing the replacement placement', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('cancels the replacement when the cancel lands during its round trip', async () => {
      let sessionId = '';
      let callerCancel: Promise<CancelOrderResult> | undefined;
      let orderCalls = 0;

      const order = vi.fn().mockImplementation(async () => {
        orderCalls += 1;
        // Call 2 is the tick's replacement. Firing the caller's cancel from
        // inside its round trip is the window this closes: `session.orderId` is
        // null for the whole call, which without the fix reads as "nothing
        // rests" and lets the cancel report success and drop the handle while
        // this order is still on its way to the book.
        if (orderCalls === 2) {
          callerCancel = provider.cancelOrder({
            orderId: sessionId,
            symbol: 'ETH',
            orderType: 'chase',
          });
          await Promise.resolve();
        }
        return {
          status: 'ok',
          response: {
            data: {
              statuses: [{ resting: { oid: orderCalls === 1 ? 55 : 66 } }],
            },
          },
        };
      });

      const { exchangeClient } = useStrategyClients({
        exchange: { order },
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
                [{ px: '2998', sz: '10', n: 1 }],
                [{ px: '3001', sz: '10', n: 1 }],
              ],
            }),
        },
      });

      const placed = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
      } satisfies OrderParams);
      sessionId = placed.orderId as string;

      await vi.advanceTimersByTimeAsync(1000);
      const result = await callerCancel;

      // The replacement must not be left live on the exchange with the caller
      // told the chase was cancelled: the cancel waits for it and cancels it.
      expect(result?.success).toBe(true);
      expect(exchangeClient.cancel).toHaveBeenCalledWith({
        cancels: [{ a: 1, o: 66 }],
      });

      // And the handle is gone, so nothing of this chase is left unreachable.
      const second = await provider.cancelOrder({
        orderId: sessionId,
        symbol: 'ETH',
        orderType: 'chase',
      });
      expect(second).toStrictEqual({ success: true, orderId: placed.orderId });
    });
  });

  describe('Fee quoting for strategy placements', () => {
    const configuredOrderTypes = [
      ['market', BUILDER_FEE_CONFIG.MaxFeeDecimal],
      ['limit', BUILDER_FEE_CONFIG.MaxFeeDecimal],
      ['stop_market', BUILDER_FEE_CONFIG.MaxFeeDecimal],
      ['stop_limit', BUILDER_FEE_CONFIG.MaxFeeDecimal],
      ['take_profit_market', BUILDER_FEE_CONFIG.MaxFeeDecimal],
      ['take_profit_limit', BUILDER_FEE_CONFIG.MaxFeeDecimal],
      ['twap', 0],
      ['scale', BUILDER_FEE_CONFIG.MaxFeeDecimal],
      ['chase', BUILDER_FEE_CONFIG.MaxFeeDecimal],
    ] as const satisfies readonly (readonly [OrderType, number])[];

    it.each(configuredOrderTypes)(
      'quotes %s with its provider-owned builder fee policy',
      async (orderType, expectedMetamaskFeeRate) => {
        useStrategyClients();

        const fees = await provider.calculateFees({
          orderType,
          amount: '1000',
          symbol: 'ETH',
        });

        expect(fees.metamaskFeeRate).toBe(expectedMetamaskFeeRate);
      },
    );

    it.each(['future_order', 'constructor', 'toString', '__proto__'] as const)(
      'uses the safe builder fee for unknown runtime order type %s',
      async (orderType) => {
        useStrategyClients();
        const runtimeParams = {
          orderType: 'market',
          amount: '1000',
          symbol: 'ETH',
        } satisfies FeeCalculationParams;
        Object.defineProperty(runtimeParams, 'orderType', { value: orderType });

        const fees = await provider.calculateFees(runtimeParams);

        expect(fees.metamaskFeeRate).toBe(BUILDER_FEE_CONFIG.MaxFeeDecimal);
        expect(mockPlatformDependencies.debugLogger.log).toHaveBeenCalledWith(
          'HyperLiquid: Unknown order type used the safe builder-fee policy',
          { orderType },
        );
      },
    );

    it('keeps a discounted TWAP quote at zero MetaMask builder fee', async () => {
      useStrategyClients();
      provider.setUserFeeDiscount(5000);

      const fees = await provider.calculateFees({
        orderType: 'twap',
        amount: '1000',
        symbol: 'ETH',
      });

      expect(fees.metamaskFeeRate).toBe(0);
      expect(fees.metamaskFeeAmount).toBe(0);
    });

    it('returns zero fee amounts for a zero notional quote', async () => {
      useStrategyClients();

      const fees = await provider.calculateFees({
        orderType: 'market',
        amount: '0',
        symbol: 'ETH',
      });

      expect(fees.feeAmount).toBe(0);
      expect(fees.protocolFeeAmount).toBe(0);
      expect(fees.metamaskFeeAmount).toBe(0);
    });

    it('quotes a chase at the maker rate even when isMaker is false', async () => {
      useStrategyClients();

      const chase = await provider.calculateFees({
        orderType: 'chase',
        isMaker: false,
        amount: '1000',
        symbol: 'ETH',
      });
      const market = await provider.calculateFees({
        orderType: 'market',
        isMaker: false,
        amount: '1000',
        symbol: 'ETH',
      });

      // A chase is post-only, so it can only ever fill as a maker.
      expect(chase.feeRate).toBeLessThan(market.feeRate);
      expect(chase.metamaskFeeRate).toBe(BUILDER_FEE_CONFIG.MaxFeeDecimal);
    });

    it('quotes a resting scale ladder at the maker rate', async () => {
      useStrategyClients();

      const scale = await provider.calculateFees({
        orderType: 'scale',
        isMaker: true,
        amount: '1000',
        symbol: 'ETH',
      });
      const limit = await provider.calculateFees({
        orderType: 'limit',
        isMaker: true,
        amount: '1000',
        symbol: 'ETH',
      });

      expect(scale.feeRate).toBe(limit.feeRate);
      expect(scale.metamaskFeeRate).toBe(BUILDER_FEE_CONFIG.MaxFeeDecimal);
    });

    it('quotes a TWAP at the taker protocol rate without a builder fee', async () => {
      useStrategyClients();

      const twap = await provider.calculateFees({
        orderType: 'twap',
        isMaker: true,
        amount: '1000',
        symbol: 'ETH',
      });
      const market = await provider.calculateFees({
        orderType: 'market',
        isMaker: false,
        amount: '1000',
        symbol: 'ETH',
      });

      expect(twap.protocolFeeRate).toBe(market.protocolFeeRate);
      expect(twap.metamaskFeeRate).toBe(0);
      expect(twap.metamaskFeeAmount).toBe(0);
      expect(twap.feeRate).toBe(twap.protocolFeeRate);
      expect(twap.feeAmount).toBe(twap.protocolFeeAmount);
      expect(market.metamaskFeeRate).toBe(BUILDER_FEE_CONFIG.MaxFeeDecimal);
    });
  });
});
