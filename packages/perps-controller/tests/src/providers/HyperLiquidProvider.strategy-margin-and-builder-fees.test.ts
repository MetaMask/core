import { ExchangeClient } from '@nktkas/hyperliquid';
import type { MetaResponse } from '@nktkas/hyperliquid';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock, Mocked } from 'vitest';

import { BUILDER_FEE_CONFIG } from '../../../src/constants/hyperLiquidConfig.js';
import { SUBSCRIPTION_CLOID_FLAGS } from '../../../src/constants/perpsConfig.js';
import { PERPS_ERROR_CODES } from '../../../src/perpsErrorCodes.js';
import { HyperLiquidProvider } from '../../../src/providers/HyperLiquidProvider.js';
import { HyperLiquidClientService } from '../../../src/services/HyperLiquidClientService.js';
import { HyperLiquidSubscriptionService } from '../../../src/services/HyperLiquidSubscriptionService.js';
import { HyperLiquidWalletService } from '../../../src/services/HyperLiquidWalletService.js';
import type { OrderParams } from '../../../src/types/index.js';
import { createGuardedHyperLiquidClient } from '../../../src/utils/guardedHyperLiquidClient.js';
import {
  hasFeeReductionAppliedFlag,
  isSubscriptionProgramCloid,
  readSubscriptionCloidFlags,
} from '../../../src/utils/subscriptionFeeWaiver.js';
import {
  activeEthTwapHistory,
  baseOrder,
  createClearinghouseBalance,
  mockPlatformDependencies,
  setUpStrategyProvider,
  useStrategyClients,
} from '../../helpers/hyperLiquidStrategyOrders.js';
import { createMockPosition } from '../../helpers/providerMocks.js';
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
  let mockClientService: Mocked<HyperLiquidClientService>;
  let mockWalletService: Mocked<HyperLiquidWalletService>;
  let mockSubscriptionService: Mocked<HyperLiquidSubscriptionService>;

  beforeEach(() => {
    ({
      provider,
      mockClientService,
      mockWalletService,
      mockSubscriptionService,
    } = setUpStrategyProvider());
  });

  it('refuses a Lighter expected Scale ladder without silently dropping its constraint', async () => {
    const params: OrderParams = {
      symbol: 'BTC',
      isBuy: true,
      size: '0.001',
      orderType: 'scale',
      scaleMinPrice: '90000',
      scaleMaxPrice: '100000',
      scaleNumOrders: 2,
      expectedScaleLadder: {
        prices: ['90000', '100000'],
        sizes: ['0.0005', '0.0005'],
        totalSize: '0.001',
        totalNotional: '95',
        minimumBaseSize: '0.0002',
        minimumQuoteAmount: '10',
        sizeDecimals: 5,
      },
    };
    expect(await provider.placeOrder(params)).toStrictEqual({
      success: false,
      error: 'ORDER_SCALE_PREVIEW_STALE',
    });
    expect(await provider.validateOrder(params)).toStrictEqual({
      isValid: false,
      error: 'ORDER_SCALE_PREVIEW_STALE',
    });
    expect(mockClientService.getExchangeClient.mock.calls).toHaveLength(0);
  });

  describe('native TWAP margin-mode occupancy', () => {
    const order: OrderParams = {
      ...baseOrder,
      orderType: 'market',
      leverage: 5,
      marginMode: 'cross',
    };
    const setupOccupancy = (
      history: unknown[],
      existingMode = 'isolated',
    ): ReturnType<typeof useStrategyClients> =>
      useStrategyClients({
        info: {
          clearinghouseState: vi
            .fn()
            .mockResolvedValue(createClearinghouseBalance('10000')),
          frontendOpenOrders: vi.fn().mockResolvedValue([]),
          twapHistory: vi.fn().mockResolvedValue(history),
          activeAssetData: vi
            .fn()
            .mockResolvedValue({ leverage: { type: existingMode, value: 5 } }),
        },
      });

    it.each(['activated', 'waitingForTrigger', 'futureVenueStatus'])(
      'blocks conflicting mode for %s schedules with no fills',
      async (status) => {
        const { exchangeClient } = setupOccupancy([
          { ...activeEthTwapHistory[0], status: { status } },
        ]);

        const result = await provider.placeOrder(order);

        expect(result).toMatchObject({
          success: false,
          error: PERPS_ERROR_CODES.ORDER_MARGIN_MODE_ORDER_OPEN,
        });
        expect(exchangeClient.updateLeverage).not.toHaveBeenCalled();
        expect(exchangeClient.order).not.toHaveBeenCalled();
      },
    );

    it('allows matching mode while a native TWAP remains active', async () => {
      const { infoClient } = setupOccupancy(activeEthTwapHistory, 'cross');

      const result = await provider.validateOrder(order);

      expect(result.isValid).toBe(true);
      expect(infoClient.activeAssetData).toHaveBeenCalledWith(
        expect.objectContaining({ coin: 'ETH' }),
      );
    });

    it.each(['finished', 'stopped', 'terminated', 'error'])(
      'allows mode changes after a %s terminal update supersedes activation',
      async (status) => {
        const terminal = {
          ...activeEthTwapHistory[0],
          time: activeEthTwapHistory[0].time + 1,
          status: { status },
        };
        // Deliberately newest first; stale activation must not overwrite it.
        const { infoClient } = setupOccupancy([
          terminal,
          ...activeEthTwapHistory,
        ]);

        const result = await provider.validateOrder(order);

        expect(result.isValid).toBe(true);
        expect(infoClient.activeAssetData).not.toHaveBeenCalled();
      },
    );

    it('compares mixed venue timestamp units before selecting a schedule status', async () => {
      const terminal = {
        ...activeEthTwapHistory[0],
        time: activeEthTwapHistory[0].time + 1,
        status: { status: 'finished' },
      };
      const activation = {
        ...activeEthTwapHistory[0],
        time: activeEthTwapHistory[0].time * 1000,
      };
      const { infoClient } = setupOccupancy([activation, terminal]);

      expect((await provider.validateOrder(order)).isValid).toBe(true);
      expect(infoClient.activeAssetData).not.toHaveBeenCalled();
    });

    it('ignores active TWAP schedules for another asset', async () => {
      const { infoClient } = setupOccupancy([
        {
          ...activeEthTwapHistory[0],
          state: { ...activeEthTwapHistory[0].state, coin: 'BTC' },
        },
      ]);

      expect((await provider.validateOrder(order)).isValid).toBe(true);
      expect(infoClient.activeAssetData).not.toHaveBeenCalled();
    });

    it('fails closed if fresh TWAP history is unavailable', async () => {
      const { infoClient, exchangeClient } = setupOccupancy([]);
      infoClient.twapHistory.mockRejectedValue(
        new Error('TWAP history offline'),
      );

      const result = await provider.placeOrder(order);

      expect(result.success).toBe(false);
      expect(exchangeClient.updateLeverage).not.toHaveBeenCalled();
      expect(exchangeClient.order).not.toHaveBeenCalled();
    });

    it('rechecks TWAP occupancy between preview and placement', async () => {
      const { infoClient, exchangeClient } =
        setupOccupancy(activeEthTwapHistory);
      infoClient.twapHistory.mockResolvedValueOnce([]);
      expect((await provider.validateOrder(order)).isValid).toBe(true);

      const result = await provider.placeOrder(order);

      expect(result).toMatchObject({
        success: false,
        error: PERPS_ERROR_CODES.ORDER_MARGIN_MODE_ORDER_OPEN,
      });
      expect(infoClient.twapHistory).toHaveBeenCalledTimes(2);
      expect(exchangeClient.updateLeverage).not.toHaveBeenCalled();
    });

    it('preserves omitted-mode requests without a new history read', async () => {
      const { infoClient } = setupOccupancy(activeEthTwapHistory);

      expect(
        (await provider.validateOrder({ ...order, marginMode: undefined }))
          .isValid,
      ).toBe(true);
      expect(infoClient.twapHistory).not.toHaveBeenCalled();
    });
  });

  describe('explicit margin mode across order types', () => {
    const orderShapes: Pick<
      OrderParams,
      | 'orderType'
      | 'twapDuration'
      | 'scaleMinPrice'
      | 'scaleMaxPrice'
      | 'scaleNumOrders'
      | 'triggerPrice'
    >[] = [
      { orderType: 'stop_market', triggerPrice: '3100' },
      { orderType: 'twap', twapDuration: 30 },
      {
        orderType: 'scale',
        scaleMinPrice: '2000',
        scaleMaxPrice: '3000',
        scaleNumOrders: 3,
      },
      { orderType: 'chase' },
    ];

    afterEach(async () => {
      await provider.disconnect();
    });

    describe.each(orderShapes)('$orderType', (shape) => {
      it('rejects a mode change while an unfilled native TWAP is active before signing', async () => {
        const { exchangeClient, infoClient } = useStrategyClients({
          info: {
            clearinghouseState: vi
              .fn()
              .mockResolvedValue(createClearinghouseBalance('10000')),
            frontendOpenOrders: vi.fn().mockResolvedValue([]),
            twapHistory: vi.fn().mockResolvedValue(activeEthTwapHistory),
            activeAssetData: vi
              .fn()
              .mockResolvedValue({ leverage: { type: 'isolated', value: 5 } }),
          },
        });

        const result = await provider.placeOrder({
          ...baseOrder,
          ...shape,
          leverage: 5,
          marginMode: 'cross',
        });

        expect(result).toMatchObject({
          success: false,
          error: PERPS_ERROR_CODES.ORDER_MARGIN_MODE_ORDER_OPEN,
        });
        expect(infoClient.twapHistory).toHaveBeenCalled();
        expect(exchangeClient.updateLeverage).not.toHaveBeenCalled();
        expect(exchangeClient.order).not.toHaveBeenCalled();
        expect(exchangeClient.twapOrder).not.toHaveBeenCalled();
      });

      it.each(['cross', 'isolated', undefined] as const)(
        'forwards %s mode at the SDK boundary',
        async (marginMode) => {
          const { exchangeClient } = useStrategyClients({
            info: {
              clearinghouseState: vi
                .fn()
                .mockResolvedValue(createClearinghouseBalance('10000')),
              frontendOpenOrders: vi.fn().mockResolvedValue([]),
            },
            exchange: {
              order: vi
                .fn()
                .mockImplementation((request: { orders: unknown[] }) =>
                  Promise.resolve({
                    status: 'ok',
                    response: {
                      data: {
                        statuses: request.orders.map((_, index) => ({
                          resting: { oid: 55 + index },
                        })),
                      },
                    },
                  }),
                ),
            },
          });

          const result = await provider.placeOrder({
            ...baseOrder,
            ...shape,
            leverage: 5,
            marginMode,
          });

          expect(result.success).toBe(true);
          expect(exchangeClient.updateLeverage).toHaveBeenCalledWith({
            asset: 1,
            isCross: marginMode === 'cross',
            leverage: 5,
          });
          expect(
            shape.orderType === 'twap'
              ? exchangeClient.twapOrder
              : exchangeClient.order,
          ).toHaveBeenCalled();
        },
      );

      it.each([
        {
          reason: 'a conflicting mode',
          restricted: false,
          marginMode: 'isolated',
          error: PERPS_ERROR_CODES.ORDER_MARGIN_MODE_POSITION_OPEN,
        },
        {
          reason: 'an unsupported market',
          restricted: true,
          marginMode: 'cross',
          error: PERPS_ERROR_CODES.ORDER_MARGIN_MODE_UNSUPPORTED,
        },
      ] as const)(
        'rejects $reason before signatures or submission',
        async ({ restricted, marginMode, error }) => {
          // The default venue fixture already holds a Cross ETH position.
          const { exchangeClient } = useStrategyClients(
            restricted
              ? {
                  info: {
                    meta: vi.fn().mockResolvedValue({
                      universe: [
                        {
                          name: 'ETH',
                          szDecimals: 3,
                          maxLeverage: 50,
                          marginTableId: 1,
                          marginMode: 'noCross',
                        } satisfies MetaResponse['universe'][number],
                      ],
                    }),
                  },
                }
              : {},
          );

          const result = await provider.placeOrder({
            ...baseOrder,
            ...shape,
            leverage: 5,
            marginMode,
          });

          expect(result.success).toBe(false);
          expect(result.error).toBe(error);
          for (const method of [
            'updateLeverage',
            'approveBuilderFee',
            'setReferrer',
            'agentSetAbstraction',
            'sendAsset',
            'order',
            'twapOrder',
          ]) {
            expect(exchangeClient[method]).not.toHaveBeenCalled();
          }
        },
      );
    });
  });

  describe('Builder fee policy', () => {
    it('applies one builder context to a default parent and TP/SL batch', async () => {
      const { exchangeClient } = useStrategyClients();

      await provider.placeOrder({
        ...baseOrder,
        orderType: 'market',
        takeProfitPrice: '3500',
        stopLossPrice: '2500',
      } satisfies OrderParams);

      expect(exchangeClient.order.mock.calls[0][0]).toMatchObject({
        orders: expect.any(Array),
        builder: {
          b: BUILDER_FEE_CONFIG.MainnetBuilder,
          f: BUILDER_FEE_CONFIG.MaxFeeTenthsBps,
        },
      });
      expect(exchangeClient.order.mock.calls[0][0].orders).toHaveLength(3);
    });

    it('applies one builder context to a position TP/SL batch', async () => {
      const { exchangeClient } = useStrategyClients();

      const result = await provider.updatePositionTPSL({
        symbol: 'ETH',
        takeProfitPrice: '3500',
        stopLossPrice: '2500',
        position: createMockPosition({ symbol: 'ETH', size: '1.5' }),
      });

      expect(result.success).toBe(true);
      expect(exchangeClient.order.mock.calls[0][0].builder).toStrictEqual({
        b: BUILDER_FEE_CONFIG.MainnetBuilder,
        f: BUILDER_FEE_CONFIG.MaxFeeTenthsBps,
      });
    });

    it('keeps existing protection when builder approval fails', async () => {
      const { exchangeClient } = useStrategyClients({
        exchange: {
          approveBuilderFee: vi
            .fn()
            .mockRejectedValue(new Error('Builder approval failed')),
        },
        info: {
          maxBuilderFee: vi.fn().mockResolvedValue(0),
          frontendOpenOrders: vi.fn().mockResolvedValue([
            {
              coin: 'ETH',
              oid: 456,
              reduceOnly: true,
              isTrigger: true,
              isPositionTpsl: true,
              orderType: 'Take Profit Limit',
              children: [],
            },
          ]),
        },
      });

      const result = await provider.updatePositionTPSL({
        symbol: 'ETH',
        takeProfitPrice: '3500',
      });

      expect(result).toStrictEqual({
        success: false,
        error: PERPS_ERROR_CODES.TPSL_UPDATE_FAILED,
      });
      expect(exchangeClient.approveBuilderFee).toHaveBeenCalled();
      expect(exchangeClient.cancel).not.toHaveBeenCalled();
      expect(exchangeClient.order).not.toHaveBeenCalled();
    });

    it('does not replace whole-position protection when pre-cancel is refused', async () => {
      const { exchangeClient } = useStrategyClients({
        exchange: {
          cancel: vi.fn().mockResolvedValue({
            status: 'ok',
            response: {
              data: { statuses: [{ error: 'Invalid nonce' }] },
            },
          }),
        },
        info: {
          frontendOpenOrders: vi.fn().mockResolvedValue([
            {
              coin: 'ETH',
              oid: 456,
              reduceOnly: true,
              isTrigger: true,
              isPositionTpsl: true,
              orderType: 'Take Profit Limit',
              children: [],
            },
          ]),
        },
      });

      const result = await provider.updatePositionTPSL({
        symbol: 'ETH',
        takeProfitPrice: '3500',
      });

      expect(result).toStrictEqual({
        success: false,
        error: PERPS_ERROR_CODES.TPSL_UPDATE_FAILED,
        childOrderIds: ['456'],
      });
      expect(exchangeClient.order).not.toHaveBeenCalled();
    });

    it('reports lost protection when the old cancel outcome is unknown', async () => {
      const frontendOpenOrders = vi
        .fn()
        .mockResolvedValueOnce([
          {
            coin: 'ETH',
            oid: 456,
            reduceOnly: true,
            isTrigger: true,
            isPositionTpsl: true,
            orderType: 'Take Profit Limit',
            children: [],
          },
          {
            coin: 'ETH',
            oid: 457,
            reduceOnly: true,
            isTrigger: true,
            isPositionTpsl: true,
            orderType: 'Stop Market',
            children: [],
          },
        ])
        .mockRejectedValueOnce(new Error('Open orders unavailable'));
      const { exchangeClient } = useStrategyClients({
        exchange: {
          cancel: vi.fn().mockResolvedValue({
            status: 'ok',
            response: { data: { statuses: ['success'] } },
          }),
        },
        info: { frontendOpenOrders },
      });

      const result = await provider.updatePositionTPSL({
        symbol: 'ETH',
        takeProfitPrice: '3500',
        stopLossPrice: '2500',
        position: createMockPosition({ symbol: 'ETH', size: '1.5' }),
      });

      expect(result).toStrictEqual({
        success: false,
        error: PERPS_ERROR_CODES.TPSL_PROTECTION_LOST,
        childOrderIds: ['456', '457'],
      });
      expect(exchangeClient.order).not.toHaveBeenCalled();
    });

    it.each([
      ['entry-drift', PERPS_ERROR_CODES.TPSL_UPDATE_FAILED],
      ['read-failure', expect.any(String) as unknown],
    ])(
      'restores exact old protection for %s after confirmed cancellation',
      async (change, expectedError) => {
        const { exchangeClient, infoClient } = useStrategyClients({
          info: {
            frontendOpenOrders: vi.fn().mockResolvedValue([
              {
                coin: 'ETH',
                side: 'A',
                limitPx: '3400',
                sz: '0',
                origSz: '0',
                oid: 456,
                timestamp: 1700000000000,
                reduceOnly: true,
                isTrigger: true,
                isPositionTpsl: true,
                triggerCondition: 'Price above 3400',
                triggerPx: '3400',
                orderType: 'Take Profit Limit',
                children: [],
              },
            ]),
          },
        });
        exchangeClient.cancel.mockImplementation(async () => {
          if (change === 'read-failure') {
            infoClient.clearinghouseState.mockRejectedValue(new Error('429'));
          } else {
            infoClient.clearinghouseState.mockResolvedValue({
              assetPositions: [
                { position: { coin: 'ETH', szi: '1.5', entryPx: '3001' } },
              ],
            });
          }
          return {
            status: 'ok',
            response: { data: { statuses: ['success'] } },
          };
        });
        const result = await provider.updatePositionTPSL({
          symbol: 'ETH',
          takeProfitPrice: '3500',
          expectedPosition: { size: '1.5', entryPrice: '3000' },
        });
        expect(result).toMatchObject({
          success: false,
          error: expectedError,
        });
        expect(exchangeClient.cancel).toHaveBeenCalledTimes(1);
        expect(exchangeClient.order).toHaveBeenCalledTimes(1);
        expect(exchangeClient.order.mock.calls[0][0]).toMatchObject({
          grouping: 'positionTpsl',
          orders: [
            {
              r: true,
              s: '0',
              p: '3400',
              t: {
                trigger: { isMarket: false, triggerPx: '3400', tpsl: 'tp' },
              },
            },
          ],
        });
      },
    );

    it.each(['account', 'network', 'disconnect'])(
      'omits restoration receipts after %s changes while restoring',
      async (change) => {
        const order = vi
          .fn()
          .mockResolvedValueOnce({
            status: 'ok',
            response: {
              data: { statuses: [{ error: 'Rejected replacement' }] },
            },
          })
          .mockImplementationOnce(async () => {
            if (change === 'account') {
              mockWalletService.getUserAddressWithDefault.mockResolvedValue(
                '0x2222222222222222222222222222222222222222',
              );
            } else if (change === 'network') {
              mockClientService.isTestnetMode.mockReturnValue(true);
            } else {
              await provider.disconnect();
            }
            return {
              status: 'ok',
              response: {
                data: {
                  statuses: [
                    { resting: { oid: 901 } },
                    { error: 'Incomplete restoration' },
                  ],
                },
              },
            };
          });
        useStrategyClients({
          exchange: { order },
          info: {
            frontendOpenOrders: vi.fn().mockResolvedValue([
              {
                coin: 'ETH',
                side: 'A',
                limitPx: '3400',
                sz: '0',
                origSz: '0',
                oid: 456,
                timestamp: 1700000000000,
                reduceOnly: true,
                isTrigger: true,
                isPositionTpsl: true,
                triggerCondition: 'Price above 3400',
                triggerPx: '3400',
                orderType: 'Take Profit Limit',
                children: [],
              },
            ]),
          },
        });
        const result = await provider.updatePositionTPSL({
          symbol: 'ETH',
          takeProfitPrice: '3500',
        });
        expect(order).toHaveBeenCalledTimes(2);
        expect(result.success).toBe(false);
        expect(result.childOrderIds).toBeUndefined();
      },
    );

    it.each(['size', 'entry', 'account', 'network', 'disconnect'])(
      'fences real SDK dispatch after signing when %s changes',
      async (change) => {
        const { infoClient } = useStrategyClients({
          info: {
            referral: vi.fn().mockResolvedValue({
              referredBy: {
                referrer: '0x1111111111111111111111111111111111111111',
                code: 'EXISTING',
              },
            }),
            maxBuilderFee: vi.fn().mockResolvedValue(100000),
          },
        });
        const signing = createDeferred<void>();
        const release = createDeferred<void>();
        const request = vi.fn().mockResolvedValue({
          status: 'ok',
          response: {
            type: 'order',
            data: { statuses: [{ resting: { oid: 777 } }] },
          },
        });
        const sdk = new ExchangeClient({
          transport: { isTestnet: false, request },
          wallet: {
            address: '0x1111111111111111111111111111111111111111',
            signTypedData: async (_args: unknown): Promise<`0x${string}`> => {
              signing.resolve();
              await release.promise;
              return `0x${'11'.repeat(64)}1b`;
            },
          },
        });
        mockClientService.getExchangeClient.mockImplementation(
          (beforeDispatch?: () => Promise<void>) =>
            beforeDispatch
              ? createGuardedHyperLiquidClient(sdk, beforeDispatch)
              : sdk,
        );
        const pending = provider.updatePositionTPSL({
          symbol: 'ETH',
          takeProfitPrice: '3500',
          expectedPosition: { size: '1.5', entryPrice: '3000' },
        });
        await Promise.race([
          signing.promise,
          pending.then((result) => {
            throw new Error(JSON.stringify(result));
          }),
        ]);
        if (change === 'size' || change === 'entry') {
          infoClient.clearinghouseState.mockResolvedValue({
            assetPositions: [
              {
                position: {
                  coin: 'ETH',
                  szi: change === 'size' ? '2' : '1.5',
                  entryPx: change === 'entry' ? '3001' : '3000',
                },
              },
            ],
          });
        } else if (change === 'account') {
          mockWalletService.getUserAddressWithDefault.mockResolvedValue(
            '0x2222222222222222222222222222222222222222',
          );
        } else if (change === 'network') {
          mockClientService.isTestnetMode.mockReturnValue(true);
        } else {
          await provider.disconnect();
        }
        release.resolve();
        const result = await pending;
        expect(result.success).toBe(false);
        expect(request).not.toHaveBeenCalled();
      },
    );

    it.each(['partial-error', 'truncated-unrelated'])(
      'reconciles real SDK %s using exact signed child identities',
      async (mode) => {
        const old = {
          coin: 'ETH',
          side: 'A',
          limitPx: '3400',
          sz: '0',
          origSz: '0',
          oid: 456,
          timestamp: 1700000000000,
          reduceOnly: true,
          isTrigger: true,
          isPositionTpsl: true,
          triggerCondition: 'Price above 3400',
          triggerPx: '3400',
          orderType: 'Take Profit Limit',
          children: [],
        };
        let submittedCloid: string | undefined;
        const actions: {
          type: string;
          cancels?: { o: number }[];
          orders?: { c?: string }[];
        }[] = [];
        const { infoClient } = useStrategyClients({
          info: {
            referral: vi.fn().mockResolvedValue({
              referredBy: {
                referrer: '0x1111111111111111111111111111111111111111',
                code: 'EXISTING',
              },
            }),
            maxBuilderFee: vi.fn().mockResolvedValue(100000),
            frontendOpenOrders: vi
              .fn()
              .mockResolvedValueOnce([old])
              .mockResolvedValue([
                {
                  ...old,
                  oid: 999,
                  triggerPx: '3500',
                  limitPx: '3500',
                  cloid: '0x99999999999999999999999999999999',
                },
              ]),
            orderStatus: vi
              .fn()
              .mockImplementation(async ({ oid }: { oid: string }) =>
                mode === 'partial-error' && oid === submittedCloid
                  ? {
                      status: 'order',
                      order: {
                        status: 'open',
                        order: { coin: 'ETH', cloid: oid, oid: 777 },
                      },
                    }
                  : { status: 'unknownOid' },
              ),
          },
        });
        let orderRequests = 0;
        const request = vi
          .fn()
          .mockImplementation(
            async (
              _endpoint: string,
              payload: { action: (typeof actions)[number] },
            ) => {
              actions.push(payload.action);
              if (payload.action.type === 'cancel') {
                return {
                  status: 'ok',
                  response: {
                    type: 'cancel',
                    data: {
                      statuses: payload.action.cancels?.map(() => 'success'),
                    },
                  },
                };
              }
              orderRequests += 1;
              if (orderRequests === 1) {
                submittedCloid = payload.action.orders?.[0].c;
                return {
                  status: 'ok',
                  response: {
                    type: 'order',
                    data: {
                      statuses:
                        mode === 'partial-error'
                          ? ['waitingForTrigger', { error: 'SL rejected' }]
                          : ['waitingForTrigger'],
                    },
                  },
                };
              }
              return {
                status: 'ok',
                response: {
                  type: 'order',
                  data: { statuses: [{ resting: { oid: 901 } }] },
                },
              };
            },
          );
        const sdk = new ExchangeClient({
          transport: { isTestnet: false, request },
          wallet: {
            address: '0x1111111111111111111111111111111111111111',
            signTypedData: async (_args: unknown): Promise<`0x${string}`> =>
              `0x${'11'.repeat(64)}1b`,
          },
        });
        mockClientService.getExchangeClient.mockImplementation(
          (beforeDispatch?: () => Promise<void>) =>
            beforeDispatch
              ? createGuardedHyperLiquidClient(sdk, beforeDispatch)
              : sdk,
        );
        const result = await provider.updatePositionTPSL({
          symbol: 'ETH',
          takeProfitPrice: '3500',
          stopLossPrice: '2500',
        });
        expect(result.success).toBe(false);
        const cancelled = actions.flatMap(
          (action) => action.cancels?.map((cancel) => cancel.o) ?? [],
        );
        expect(cancelled).not.toContain(999);
        expect(cancelled).toStrictEqual(
          mode === 'partial-error' ? [456, 777] : [456],
        );
        expect(actions.map((action) => action.type)).toStrictEqual(
          mode === 'partial-error'
            ? ['cancel', 'order', 'cancel', 'order']
            : ['cancel', 'order'],
        );
        expect(infoClient.orderStatus).toHaveBeenCalledWith(
          expect.objectContaining({ oid: submittedCloid }),
        );
        expect(orderRequests).toBe(mode === 'partial-error' ? 2 : 1);
        expect(result.error).toBe(
          mode === 'partial-error'
            ? 'order 1: SL rejected'
            : PERPS_ERROR_CODES.TPSL_PROTECTION_LOST,
        );
      },
    );

    describe('real SDK protection recovery boundaries', () => {
      type SignedAction = {
        type: string;
        orders?: { c?: string }[];
        cancels?: { o: number }[];
      };
      const setup = (
        oldCount = 1,
      ): {
        infoClient: ReturnType<typeof useStrategyClients>['infoClient'];
        actions: SignedAction[];
        hooks: {
          sign: () => Promise<void>;
          response: (action: SignedAction) => Promise<unknown>;
        };
        defaultResponse: (action: SignedAction) => unknown;
        request: Mock;
      } => {
        const old = {
          coin: 'ETH',
          side: 'A',
          limitPx: '3400',
          sz: '0',
          origSz: '0',
          oid: 456,
          timestamp: 1700000000000,
          reduceOnly: true,
          isTrigger: true,
          isPositionTpsl: true,
          triggerCondition: 'Price above 3400',
          triggerPx: '3400',
          orderType: 'Take Profit Limit',
          children: [],
        };
        const { infoClient } = useStrategyClients({
          info: {
            referral: vi.fn().mockResolvedValue({
              referredBy: {
                referrer: '0x1111111111111111111111111111111111111111',
                code: 'EXISTING',
              },
            }),
            maxBuilderFee: vi.fn().mockResolvedValue(100000),
            userToMultiSigSigners: vi.fn().mockResolvedValue(null),
            frontendOpenOrders: vi.fn().mockResolvedValue(
              oldCount === 1
                ? [old]
                : [
                    old,
                    {
                      ...old,
                      oid: 457,
                      orderType: 'Stop Market',
                      triggerCondition: 'Price below 2500',
                      triggerPx: '2500',
                      limitPx: '2500',
                    },
                  ],
            ),
            orderStatus: vi.fn().mockResolvedValue({ status: 'unknownOid' }),
          },
        });
        const actions: SignedAction[] = [];
        const defaultResponse = (action: SignedAction): unknown => ({
          status: 'ok',
          response: {
            type: action.type,
            data: {
              statuses:
                action.type === 'cancel'
                  ? action.cancels?.map(() => 'success')
                  : action.orders?.map((_order, index) => ({
                      resting: { oid: 901 + index },
                    })),
            },
          },
        });
        const hooks: {
          sign: () => Promise<void>;
          response: (action: SignedAction) => Promise<unknown>;
        } = {
          sign: async () => undefined,
          response: async (action) => defaultResponse(action),
        };
        const request = vi
          .fn()
          .mockImplementation(
            async (_endpoint: string, payload: { action: SignedAction }) => {
              actions.push(payload.action);
              return hooks.response(payload.action);
            },
          );
        const sdk = new ExchangeClient({
          transport: { isTestnet: false, request },
          wallet: {
            address: '0x1111111111111111111111111111111111111111',
            signTypedData: async (_args: unknown): Promise<`0x${string}`> => {
              await hooks.sign();
              return `0x${'11'.repeat(64)}1b`;
            },
          },
        });
        mockClientService.getExchangeClient.mockImplementation(
          (guard?: () => Promise<void>) =>
            guard ? createGuardedHyperLiquidClient(sdk, guard) : sdk,
        );
        return { infoClient, actions, hooks, defaultResponse, request };
      };

      it.each(['top-level', 'bulk'])(
        'restores exact old protection after definitive %s rejection and retains venue text',
        async (kind) => {
          const { actions, hooks, defaultResponse } = setup();
          let attempts = 0;
          hooks.response = async (action): Promise<unknown> => {
            if (action.type === 'order') {
              attempts += 1;
            }
            if (action.type === 'order' && attempts === 1) {
              return kind === 'top-level'
                ? {
                    status: 'err',
                    response: 'Too many cumulative requests sent',
                  }
                : {
                    status: 'ok',
                    response: {
                      type: 'order',
                      data: {
                        statuses: [
                          { error: 'Too many cumulative requests sent' },
                        ],
                      },
                    },
                  };
            }
            return defaultResponse(action);
          };
          const result = await provider.updatePositionTPSL({
            symbol: 'ETH',
            takeProfitPrice: '3500',
          });
          expect(actions.map((action) => action.type)).toStrictEqual([
            'cancel',
            'order',
            'order',
          ]);
          expect(result.success).toBe(false);
          expect(result.error).toContain('Too many cumulative requests sent');
          expect(result.childOrderIds).toStrictEqual(['901']);
        },
      );

      it.each([
        ['size', PERPS_ERROR_CODES.TPSL_UPDATE_FAILED],
        ['entry', PERPS_ERROR_CODES.TPSL_UPDATE_FAILED],
        ['account', expect.any(String) as unknown],
        ['network', expect.any(String) as unknown],
        ['disconnect', expect.any(String) as unknown],
        ['read-failure', expect.any(String) as unknown],
      ])(
        'preserves old protection when %s changes during real cancellation signing',
        async (change, expectedError) => {
          const { actions, hooks, infoClient } = setup();
          const started = createDeferred<void>();
          const release = createDeferred<void>();
          hooks.sign = async (): Promise<void> => {
            started.resolve();
            await release.promise;
          };
          const pending = provider.updatePositionTPSL({
            symbol: 'ETH',
            takeProfitPrice: '3500',
            expectedPosition: { size: '1.5', entryPrice: '3000' },
          });
          await started.promise;
          if (change === 'account') {
            mockWalletService.getUserAddressWithDefault.mockResolvedValue(
              '0x2222222222222222222222222222222222222222',
            );
          } else if (change === 'network') {
            mockClientService.isTestnetMode.mockReturnValue(true);
          } else if (change === 'disconnect') {
            await provider.disconnect();
          } else if (change === 'read-failure') {
            infoClient.clearinghouseState.mockRejectedValue(new Error('429'));
          } else {
            infoClient.clearinghouseState.mockResolvedValue({
              assetPositions: [
                {
                  position: {
                    coin: 'ETH',
                    szi: change === 'size' ? '2' : '1.5',
                    entryPx: change === 'entry' ? '3001' : '3000',
                  },
                },
              ],
            });
          }
          release.resolve();
          const result = await pending;
          expect(actions).toStrictEqual([]);
          expect(result.success).toBe(false);
          expect(result.error).toStrictEqual(expectedError);
          expect(result.error).not.toBe(PERPS_ERROR_CODES.TPSL_PROTECTION_LOST);
          expect(result.childOrderIds).toBeUndefined();
        },
      );

      it.each(['triggered', 'futureScheduledState'])(
        'retains exact child identity while status %s is in flight',
        async (status) => {
          const { actions, hooks, infoClient, defaultResponse } = setup();
          hooks.response = async (action): Promise<unknown> =>
            action.type === 'order'
              ? {
                  status: 'ok',
                  response: {
                    type: 'order',
                    data: {
                      statuses: ['waitingForTrigger', { error: 'SL rejected' }],
                    },
                  },
                }
              : defaultResponse(action);
          infoClient.orderStatus.mockImplementation(
            async ({ oid }: { oid: string }) => ({
              status: 'order',
              order: { status, order: { coin: 'ETH', cloid: oid, oid: 777 } },
            }),
          );
          const result = await provider.updatePositionTPSL({
            symbol: 'ETH',
            takeProfitPrice: '3500',
            stopLossPrice: '2500',
          });
          expect(actions.map((action) => action.type)).toStrictEqual([
            'cancel',
            'order',
          ]);
          expect(result).toMatchObject({
            success: false,
            error: PERPS_ERROR_CODES.TPSL_PROTECTION_LOST,
            childOrderIds: ['777'],
          });
        },
      );

      it.each(['partial', 'response-loss'])(
        'preserves accepted restoration identities after %s',
        async (mode) => {
          const { actions, hooks, infoClient, defaultResponse } = setup(2);
          let attempts = 0;
          let restorationCloid: string | undefined;
          hooks.response = async (action): Promise<unknown> => {
            if (action.type === 'order') {
              attempts += 1;
              if (attempts === 1) {
                return {
                  status: 'ok',
                  response: {
                    type: 'order',
                    data: { statuses: [{ error: 'Replacement rejected' }] },
                  },
                };
              }
              restorationCloid = action.orders?.[0].c;
              if (mode === 'response-loss') {
                throw new Error('response lost');
              }
              return {
                status: 'ok',
                response: {
                  type: 'order',
                  data: {
                    statuses: [
                      { resting: { oid: 901 } },
                      { error: 'SL restoration rejected' },
                    ],
                  },
                },
              };
            }
            return defaultResponse(action);
          };
          infoClient.orderStatus.mockImplementation(
            async ({ oid }: { oid: string }) =>
              oid === restorationCloid
                ? {
                    status: 'order',
                    order: {
                      status: 'open',
                      order: { coin: 'ETH', cloid: oid, oid: 901 },
                    },
                  }
                : { status: 'unknownOid' },
          );
          const result = await provider.updatePositionTPSL({
            symbol: 'ETH',
            takeProfitPrice: '3500',
          });
          expect(actions.map((action) => action.type)).toStrictEqual([
            'cancel',
            'order',
            'order',
          ]);
          expect(result).toMatchObject({
            success: false,
            error: PERPS_ERROR_CODES.TPSL_PROTECTION_LOST,
            childOrderIds: ['901'],
          });
        },
      );

      it.each(['proactive', 'venue-race'])(
        'retains live replacement IDs and loss when cleanup hits %s multisig conversion',
        async (mode) => {
          const { actions, hooks, infoClient, defaultResponse } = setup();
          const errorLog = vi.spyOn(mockPlatformDependencies.logger, 'error');
          hooks.response = async (action): Promise<unknown> => {
            if (action.type === 'order') {
              return {
                status: 'ok',
                response: {
                  type: 'order',
                  data: {
                    statuses: [
                      { resting: { oid: 777 } },
                      { error: 'SL rejected' },
                    ],
                  },
                },
              };
            }
            return actions.length === 3
              ? { status: 'err', response: 'Multi-sig required' }
              : defaultResponse(action);
          };
          hooks.sign = async (): Promise<void> => {
            if (mode === 'proactive' && actions.length === 2) {
              infoClient.userToMultiSigSigners.mockResolvedValue({
                authorizedUsers: ['0x1111111111111111111111111111111111111111'],
                threshold: 1,
              });
            }
          };

          const result = await provider.updatePositionTPSL({
            symbol: 'ETH',
            takeProfitPrice: '3500',
            stopLossPrice: '2500',
          });

          expect(result).toStrictEqual({
            success: false,
            error: PERPS_ERROR_CODES.TPSL_PROTECTION_LOST,
            childOrderIds: ['777'],
          });
          expect(actions.map((action) => action.type)).toStrictEqual(
            mode === 'proactive'
              ? ['cancel', 'order']
              : ['cancel', 'order', 'cancel'],
          );
          expect(errorLog.mock.calls).toMatchObject([
            [
              { message: PERPS_ERROR_CODES.EXCHANGE_MULTI_SIG_REQUIRED },
              {
                tags: {
                  operation: 'position_management',
                  action: 'position_tpsl_update',
                },
                context: {
                  data: {
                    method: 'updatePositionTPSL',
                    stage: 'cleanup',
                    protectionStatus: PERPS_ERROR_CODES.TPSL_PROTECTION_LOST,
                    childOrderIds: ['777'],
                  },
                },
              },
            ],
          ]);
        },
      );

      it('reports a definitive restoration failure with protection context', async () => {
        const { hooks, defaultResponse } = setup();
        const errorLog = vi.spyOn(mockPlatformDependencies.logger, 'error');
        hooks.response = async (action): Promise<unknown> =>
          action.type === 'order'
            ? { status: 'err', response: 'Order price too far' }
            : defaultResponse(action);

        const result = await provider.updatePositionTPSL({
          symbol: 'ETH',
          takeProfitPrice: '3500',
        });

        expect(result).toStrictEqual({
          success: false,
          error: PERPS_ERROR_CODES.TPSL_PROTECTION_LOST,
          childOrderIds: [],
        });
        expect(errorLog.mock.calls).toMatchObject([
          [
            { message: 'Order price too far' },
            {
              tags: {
                operation: 'position_management',
                action: 'position_tpsl_update',
              },
              context: {
                data: {
                  method: 'updatePositionTPSL',
                  stage: 'restoration',
                  protectionStatus: PERPS_ERROR_CODES.TPSL_PROTECTION_LOST,
                },
              },
            },
          ],
        ]);
      });

      it.each(['replacement', 'restoration'])(
        'blocks transport when account becomes multisig during %s signing',
        async (stage) => {
          const { actions, hooks, infoClient, defaultResponse } = setup();
          const errorLog = vi.spyOn(mockPlatformDependencies.logger, 'error');
          hooks.response = async (action): Promise<unknown> =>
            action.type === 'order'
              ? { status: 'err', response: 'Replacement rejected' }
              : defaultResponse(action);
          hooks.sign = async (): Promise<void> => {
            if (actions.length === (stage === 'replacement' ? 1 : 2)) {
              infoClient.userToMultiSigSigners.mockResolvedValue({
                authorizedUsers: ['0x1111111111111111111111111111111111111111'],
                threshold: 1,
              });
            }
          };

          const result = await provider.updatePositionTPSL({
            symbol: 'ETH',
            takeProfitPrice: '3500',
          });

          expect(result).toStrictEqual({
            success: false,
            error: PERPS_ERROR_CODES.TPSL_PROTECTION_LOST,
            childOrderIds: [],
          });
          expect(actions.map((action) => action.type)).toStrictEqual(
            stage === 'replacement' ? ['cancel'] : ['cancel', 'order'],
          );
          expect(errorLog.mock.calls).toMatchObject([
            [
              { message: PERPS_ERROR_CODES.EXCHANGE_MULTI_SIG_REQUIRED },
              { context: { data: { stage: 'restoration' } } },
            ],
          ]);
        },
      );

      it.each(['proactive', 'venue-race'])(
        'rejects multisig protection writes at the %s boundary',
        async (mode) => {
          const { actions, hooks, infoClient } = setup();
          infoClient.userToMultiSigSigners.mockResolvedValue(
            mode === 'proactive'
              ? {
                  authorizedUsers: [
                    '0x1111111111111111111111111111111111111111',
                  ],
                  threshold: 1,
                }
              : null,
          );
          hooks.response = async (): Promise<unknown> => ({
            status: 'err',
            response: 'Multi-sig required',
          });
          const result = await provider.updatePositionTPSL({
            symbol: 'ETH',
            takeProfitPrice: '3500',
          });
          expect(result.success).toBe(false);
          expect(result.error).toBe(
            PERPS_ERROR_CODES.EXCHANGE_MULTI_SIG_REQUIRED,
          );
          expect(actions).toHaveLength(mode === 'proactive' ? 0 : 1);
          expect(infoClient.userToMultiSigSigners).toHaveBeenCalled();
        },
      );
    });

    it.each([false, true])(
      'restores whole-position protection when replacement fails after pre-cancel, marked=%s',
      async (marked) => {
        const order = vi
          .fn()
          .mockResolvedValueOnce({
            status: 'ok',
            response: {
              data: { statuses: [{ error: 'Rejected replacement' }] },
            },
          })
          .mockResolvedValueOnce({
            status: 'ok',
            response: {
              data: { statuses: [{ resting: { oid: 789 } }] },
            },
          });
        const { exchangeClient } = useStrategyClients({
          exchange: { order },
          info: {
            frontendOpenOrders: vi.fn().mockResolvedValue([
              {
                coin: 'ETH',
                side: 'A',
                limitPx: '3400',
                sz: '0',
                origSz: '0',
                oid: 456,
                timestamp: 1_700_000_000_000,
                reduceOnly: true,
                isTrigger: true,
                isPositionTpsl: true,
                triggerCondition: 'Price above 3400',
                triggerPx: '3400',
                orderType: 'Take Profit Limit',
                children: [],
              },
            ]),
          },
        });

        if (marked) {
          provider.setUserFeeResolution({
            feeBips: 0,
            discountBips: 10000,
            source: 'subscription',
            subscription: { eligible: true, reason: 'eligible' },
            subscriptionWaiverKind: 'full',
          });
        }
        const result = await provider.updatePositionTPSL({
          symbol: 'ETH',
          takeProfitPrice: '3500',
        });

        expect(result).toMatchObject({
          success: false,
          error: PERPS_ERROR_CODES.TPSL_UPDATE_FAILED,
        });
        expect(exchangeClient.cancel).toHaveBeenCalledWith({
          cancels: [{ a: 1, o: 456 }],
        });
        expect(order).toHaveBeenCalledTimes(2);
        const requests = order.mock.calls as [{ orders: { c?: string }[] }][];
        const restorationCloid = requests[1][0].orders[0].c;
        expect(isSubscriptionProgramCloid(restorationCloid)).toBe(true);
        expect(hasFeeReductionAppliedFlag(restorationCloid)).toBe(marked);
        expect(readSubscriptionCloidFlags(restorationCloid)).toBe(
          marked ? SUBSCRIPTION_CLOID_FLAGS.FeeReductionApplied : 0,
        );
        expect(restorationCloid).not.toBe(requests[0][0].orders[0].c);
        expect(order.mock.calls[1][0]).toMatchObject({
          grouping: 'positionTpsl',
          orders: [
            {
              a: 1,
              b: false,
              p: '3400',
              s: '0',
              r: true,
              t: {
                trigger: {
                  isMarket: false,
                  triggerPx: '3400',
                  tpsl: 'tp',
                },
              },
            },
          ],
        });
        expect(exchangeClient.cancel.mock.invocationCallOrder[0]).toBeLessThan(
          order.mock.invocationCallOrder[0],
        );
        expect(order.mock.invocationCallOrder[0]).toBeLessThan(
          order.mock.invocationCallOrder[1],
        );
      },
    );

    it.each([
      {
        label: 'returns a rejected status',
        restoreResult: {
          status: 'ok',
          response: {
            data: { statuses: [{ error: 'Rejected restoration' }] },
          },
        },
      },
      {
        label: 'throws',
        restoreResult: new Error('Restoration unavailable'),
      },
    ])(
      'reports lost protection when restoration $label',
      async ({ restoreResult }) => {
        const order = vi.fn().mockResolvedValueOnce({
          status: 'ok',
          response: {
            data: { statuses: [{ error: 'Rejected replacement' }] },
          },
        });
        if (restoreResult instanceof Error) {
          order.mockRejectedValueOnce(restoreResult);
        } else {
          order.mockResolvedValueOnce(restoreResult);
        }
        useStrategyClients({
          exchange: { order },
          info: {
            frontendOpenOrders: vi.fn().mockResolvedValue([
              {
                coin: 'ETH',
                side: 'A',
                limitPx: '3400',
                sz: '0',
                origSz: '0',
                oid: 456,
                timestamp: 1_700_000_000_000,
                reduceOnly: true,
                isTrigger: true,
                isPositionTpsl: true,
                triggerCondition: 'Price above 3400',
                triggerPx: '3400',
                orderType: 'Take Profit Limit',
                children: [],
              },
            ]),
          },
        });

        const result = await provider.updatePositionTPSL({
          symbol: 'ETH',
          takeProfitPrice: '3500',
        });

        expect(result).toStrictEqual({
          success: false,
          error: PERPS_ERROR_CODES.TPSL_PROTECTION_LOST,
          childOrderIds: [],
        });
        expect(order).toHaveBeenCalledTimes(2);
      },
    );

    it('reports recreated protection IDs when restoration is incomplete', async () => {
      const order = vi
        .fn()
        .mockResolvedValueOnce({
          status: 'ok',
          response: {
            data: {
              statuses: [
                { error: 'Rejected take profit' },
                { error: 'Rejected stop loss' },
              ],
            },
          },
        })
        .mockResolvedValueOnce({
          status: 'ok',
          response: {
            data: { statuses: [{ resting: { oid: 789 } }] },
          },
        });
      useStrategyClients({
        exchange: {
          order,
          cancel: vi.fn().mockResolvedValue({
            status: 'ok',
            response: { data: { statuses: ['success', 'success'] } },
          }),
        },
        info: {
          frontendOpenOrders: vi.fn().mockResolvedValue([
            {
              coin: 'ETH',
              side: 'A',
              limitPx: '2450',
              sz: '0',
              origSz: '0',
              oid: 456,
              timestamp: 1_700_000_000_000,
              reduceOnly: true,
              isTrigger: true,
              isPositionTpsl: true,
              triggerCondition: 'Price below 2500',
              triggerPx: '2500',
              orderType: 'Stop Market',
              children: [],
            },
            {
              coin: 'ETH',
              side: 'A',
              limitPx: '3400',
              sz: '0',
              origSz: '0',
              oid: 457,
              timestamp: 1_700_000_000_000,
              reduceOnly: true,
              isTrigger: true,
              isPositionTpsl: true,
              triggerCondition: 'Price above 3400',
              triggerPx: '3400',
              orderType: 'Take Profit Limit',
              children: [],
            },
          ]),
        },
      });

      const result = await provider.updatePositionTPSL({
        symbol: 'ETH',
        takeProfitPrice: '3500',
        stopLossPrice: '2400',
      });

      expect(result).toStrictEqual({
        success: false,
        error: PERPS_ERROR_CODES.TPSL_PROTECTION_LOST,
        childOrderIds: ['789'],
      });
      expect(order).toHaveBeenCalledTimes(2);
    });

    it('restores only the order confirmed cancelled when replacement fails', async () => {
      const order = vi
        .fn()
        .mockResolvedValueOnce({
          status: 'ok',
          response: {
            data: {
              statuses: [
                { error: 'Rejected take profit' },
                { error: 'Rejected stop loss' },
              ],
            },
          },
        })
        .mockResolvedValueOnce({
          status: 'ok',
          response: {
            data: { statuses: [{ resting: { oid: 789 } }] },
          },
        });
      useStrategyClients({
        exchange: {
          order,
          cancel: vi.fn().mockResolvedValue({
            status: 'ok',
            response: {
              data: {
                statuses: [
                  'success',
                  {
                    error:
                      'Order was never placed, already canceled, or filled.',
                  },
                ],
              },
            },
          }),
        },
        info: {
          frontendOpenOrders: vi.fn().mockResolvedValue([
            {
              coin: 'ETH',
              side: 'A',
              limitPx: '2450',
              sz: '0',
              origSz: '0',
              oid: 456,
              timestamp: 1_700_000_000_000,
              reduceOnly: true,
              isTrigger: true,
              isPositionTpsl: true,
              triggerCondition: 'Price below 2500',
              triggerPx: '2500',
              orderType: 'Stop Market',
              children: [],
            },
            {
              coin: 'ETH',
              side: 'A',
              limitPx: '3400',
              sz: '0',
              origSz: '0',
              oid: 457,
              timestamp: 1_700_000_000_000,
              reduceOnly: true,
              isTrigger: true,
              isPositionTpsl: true,
              triggerCondition: 'Price above 3400',
              triggerPx: '3400',
              orderType: 'Take Profit Limit',
              children: [],
            },
          ]),
        },
      });

      const result = await provider.updatePositionTPSL({
        symbol: 'ETH',
        takeProfitPrice: '3500',
        stopLossPrice: '2400',
      });

      expect(result).toMatchObject({
        success: false,
        error: PERPS_ERROR_CODES.TPSL_UPDATE_FAILED,
      });
      expect(order).toHaveBeenCalledTimes(2);
      expect(order.mock.calls[1][0]).toMatchObject({
        grouping: 'positionTpsl',
        orders: [
          {
            a: 1,
            b: false,
            p: '2450',
            s: '0',
            r: true,
            t: {
              trigger: {
                isMarket: true,
                triggerPx: '2500',
                tpsl: 'sl',
              },
            },
          },
        ],
      });
      expect(order.mock.calls[1][0].orders).toHaveLength(1);
    });

    it('restores a standalone trigger with its remaining size and builder fee', async () => {
      const order = vi
        .fn()
        .mockResolvedValueOnce({
          status: 'ok',
          response: {
            data: { statuses: [{ error: 'Rejected replacement' }] },
          },
        })
        .mockResolvedValueOnce({
          status: 'ok',
          response: {
            data: { statuses: [{ resting: { oid: 789 } }] },
          },
        });
      const { exchangeClient } = useStrategyClients({
        exchange: { order },
        info: {
          maxBuilderFee: vi
            .fn()
            .mockResolvedValueOnce(0)
            .mockResolvedValueOnce(BUILDER_FEE_CONFIG.MaxFeeDecimal),
          frontendOpenOrders: vi.fn().mockResolvedValue([
            {
              coin: 'ETH',
              side: 'A',
              limitPx: '2450',
              sz: '0.4',
              origSz: '0.6',
              oid: 456,
              timestamp: 1_700_000_000_000,
              reduceOnly: true,
              isTrigger: true,
              isPositionTpsl: false,
              triggerCondition: 'Price below 2500',
              triggerPx: '2500',
              orderType: 'Stop Market',
              children: [],
            },
          ]),
        },
      });

      const result = await provider.updatePositionTPSL({
        symbol: 'ETH',
        takeProfitPrice: '3500',
      });

      expect(result).toMatchObject({
        success: false,
        error: PERPS_ERROR_CODES.TPSL_UPDATE_FAILED,
      });
      expect(exchangeClient.approveBuilderFee).toHaveBeenCalledWith({
        builder: BUILDER_FEE_CONFIG.MainnetBuilder,
        maxFeeRate: BUILDER_FEE_CONFIG.MaxFeeRate,
      });
      expect(order.mock.calls[0][0]).toHaveProperty('builder');
      expect(order.mock.calls[1][0]).toMatchObject({
        grouping: 'na',
        builder: {
          b: BUILDER_FEE_CONFIG.MainnetBuilder,
          f: BUILDER_FEE_CONFIG.MaxFeeTenthsBps,
        },
        orders: [
          expect.objectContaining({
            p: '2450',
            s: '0.4',
            t: {
              trigger: {
                isMarket: true,
                triggerPx: '2500',
                tpsl: 'sl',
              },
            },
          }),
        ],
      });
    });

    it.each([
      {
        label: 'resting',
        statuses: [{ resting: { oid: 71 } }, { resting: { oid: 72 } }],
        ids: ['71', '72'],
      },
      {
        label: 'filled',
        statuses: [{ filled: { oid: 71 } }, { resting: { oid: 72 } }],
        ids: ['71', '72'],
      },
      {
        label: 'waiting',
        statuses: ['waitingForTrigger', { resting: { oid: 72 } }],
        ids: undefined,
      },
      {
        label: 'duplicate',
        statuses: [{ resting: { oid: 71 } }, { resting: { oid: 71 } }],
        ids: undefined,
      },
      {
        label: 'zero',
        statuses: [{ resting: { oid: 0 } }, { resting: { oid: 72 } }],
        ids: undefined,
      },
    ])(
      'returns only complete response-correlated TP/SL receipts: $label',
      async ({ statuses, ids }) => {
        useStrategyClients({
          info: {
            orderStatus: vi.fn().mockResolvedValue({ status: 'unknownOid' }),
          },
          exchange: {
            order: vi.fn().mockResolvedValue({
              status: 'ok',
              response: { data: { statuses } },
            }),
          },
        });
        const result = await provider.updatePositionTPSL({
          symbol: 'ETH',
          takeProfitPrice: '3500',
          stopLossPrice: '2500',
        });
        expect(result.success).toBe(true);
        expect(result.childOrderIds).toStrictEqual(ids);
      },
    );

    it('returns an empty receipt for successful TP/SL removal', async () => {
      useStrategyClients();
      expect(
        await provider.updatePositionTPSL({ symbol: 'ETH' }),
      ).toMatchObject({ success: true, childOrderIds: [] });
    });

    it.each([
      'matched',
      'marked',
      'wrong-cloid',
      'duplicate-id',
      'unknown',
      'read-failure',
      'response-mismatch',
      'wrong-coin',
    ])('correlates final sent protection cloids: %s', async (mode) => {
      let sent: { c?: string; t: { trigger?: { isMarket: boolean } } }[] = [];
      const orderStatus = vi
        .fn()
        .mockImplementation(async ({ oid }: { oid: string }) => {
          if (mode === 'read-failure') {
            throw new Error('status unavailable');
          }
          if (mode === 'unknown') {
            return { status: 'unknownOid' };
          }
          const index = sent.findIndex((order) => order.c === oid);
          return {
            status: 'order',
            order: {
              status: 'filled',
              order: {
                coin: mode === 'wrong-coin' ? 'BTC' : 'ETH',
                cloid:
                  mode === 'wrong-cloid'
                    ? '0x11111111111111111111111111111111'
                    : oid,
                oid: mode === 'duplicate-id' ? 777 : 777 + index,
              },
            },
          };
        });
      useStrategyClients({
        exchange: {
          order: vi
            .fn()
            .mockImplementation(async (request: { orders: typeof sent }) => {
              sent = request.orders;
              return {
                status: 'ok',
                response: {
                  data: {
                    statuses:
                      mode === 'response-mismatch'
                        ? [{ resting: { oid: 999 } }, 'waitingForTrigger']
                        : ['waitingForTrigger', 'waitingForTrigger'],
                  },
                },
              };
            }),
        },
        info: { orderStatus },
      });
      if (mode === 'marked') {
        provider.setUserFeeResolution({
          feeBips: 0,
          discountBips: 10000,
          source: 'subscription',
          subscription: { eligible: true, reason: 'eligible' },
          subscriptionWaiverKind: 'full',
        });
      }
      const result = await provider.updatePositionTPSL({
        symbol: 'ETH',
        takeProfitPrice: '3500',
        stopLossPrice: '2500',
      });
      expect(result.success).toBe(true);
      expect(result.childOrderIds).toStrictEqual(
        mode === 'matched' || mode === 'marked' ? ['777', '778'] : undefined,
      );
      expect(sent).toHaveLength(2);
      expect(sent[0].c).toMatch(/^0x[0-9a-f]{32}$/u);
      expect(sent[0].c).not.toBe(sent[1].c);
      expect(
        sent.map((order) => isSubscriptionProgramCloid(order.c)),
      ).toStrictEqual([true, true]);
      expect(
        sent.map((order) => hasFeeReductionAppliedFlag(order.c)),
      ).toStrictEqual([mode === 'marked', mode === 'marked']);
      expect(
        sent.map((order) => readSubscriptionCloidFlags(order.c)),
      ).toStrictEqual(
        mode === 'marked'
          ? [
              SUBSCRIPTION_CLOID_FLAGS.FeeReductionApplied,
              SUBSCRIPTION_CLOID_FLAGS.FeeReductionApplied,
            ]
          : [0, 0],
      );
      expect(orderStatus).toHaveBeenCalledTimes(2);
      expect(sent[0].t.trigger?.isMarket).toBe(false);
      expect(sent[1].t.trigger?.isMarket).toBe(true);
      expect(orderStatus).toHaveBeenCalledWith(
        expect.objectContaining({ oid: sent[0].c }),
      );
    });

    it.each(['account', 'network', 'disconnect'])(
      'fences %s switching during receipt lookup',
      async (change) => {
        useStrategyClients({
          exchange: {
            order: vi.fn().mockResolvedValue({
              status: 'ok',
              response: { data: { statuses: ['waitingForTrigger'] } },
            }),
          },
          info: {
            orderStatus: vi.fn().mockImplementation(async () => {
              if (change === 'account') {
                mockWalletService.getUserAddressWithDefault.mockResolvedValue(
                  '0x2222222222222222222222222222222222222222',
                );
              } else if (change === 'disconnect') {
                await provider.disconnect();
              } else {
                mockClientService.isTestnetMode.mockReturnValue(true);
              }
              return { status: 'unknownOid' };
            }),
          },
        });
        const result = await provider.updatePositionTPSL({
          symbol: 'ETH',
          stopLossPrice: '2500',
        });
        expect(result.success).toBe(false);
        expect(result.childOrderIds).toBeUndefined();
      },
    );

    it('rejects expected entry drift during asynchronous order setup', async () => {
      const { exchangeClient, infoClient } = useStrategyClients();
      infoClient.frontendOpenOrders.mockImplementation(async () => {
        infoClient.clearinghouseState.mockResolvedValue({
          assetPositions: [
            { position: { coin: 'ETH', szi: '1.5', entryPx: '3001' } },
          ],
        });
        return [];
      });
      const result = await provider.updatePositionTPSL({
        symbol: 'ETH',
        takeProfitPrice: '3500',
        expectedPosition: { size: '1.5', entryPrice: '3000' },
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe(PERPS_ERROR_CODES.TPSL_UPDATE_FAILED);
      expect(exchangeClient.cancel).not.toHaveBeenCalled();
      expect(exchangeClient.order).not.toHaveBeenCalled();
    });

    it.each([
      { size: '2', entryPrice: '3000' },
      { size: '-1.5', entryPrice: '3000' },
      { size: '1.5', entryPrice: '3001' },
    ])(
      'rejects a different expected protection position %j',
      async (expectedPosition) => {
        const { exchangeClient } = useStrategyClients();
        const result = await provider.updatePositionTPSL({
          symbol: 'ETH',
          takeProfitPrice: '3500',
          expectedPosition,
        });
        expect(result.success).toBe(false);
        expect(result.error).toBe(PERPS_ERROR_CODES.TPSL_UPDATE_FAILED);
        expect(exchangeClient.cancel).not.toHaveBeenCalled();
        expect(exchangeClient.order).not.toHaveBeenCalled();
      },
    );

    it('accepts an unchanged expected position through protection setup', async () => {
      const { exchangeClient } = useStrategyClients({
        info: {
          orderStatus: vi.fn().mockResolvedValue({ status: 'unknownOid' }),
        },
      });
      const result = await provider.updatePositionTPSL({
        symbol: 'ETH',
        takeProfitPrice: '3500',
        expectedPosition: { size: '1.50', entryPrice: '3000.0' },
      });
      expect(result.success).toBe(true);
      expect(exchangeClient.order).toHaveBeenCalledTimes(1);
    });

    it.each(['account', 'network', 'disconnect'])(
      'rejects %s switching during order setup before mutation',
      async (change) => {
        const { exchangeClient, infoClient } = useStrategyClients();
        infoClient.frontendOpenOrders.mockImplementation(async () => {
          if (change === 'account') {
            mockWalletService.getUserAddressWithDefault.mockResolvedValue(
              '0x2222222222222222222222222222222222222222',
            );
          } else if (change === 'disconnect') {
            await provider.disconnect();
          } else {
            mockClientService.isTestnetMode.mockReturnValue(true);
          }
          return [];
        });
        const result = await provider.updatePositionTPSL({
          symbol: 'ETH',
          stopLossPrice: '2500',
        });
        expect(result.success).toBe(false);
        expect(exchangeClient.order).not.toHaveBeenCalled();
        expect(exchangeClient.cancel).not.toHaveBeenCalled();
      },
    );

    it('accepts an old TP/SL order that is already gone before replacement', async () => {
      const { exchangeClient } = useStrategyClients({
        exchange: {
          cancel: vi.fn().mockResolvedValue({
            status: 'ok',
            response: {
              data: {
                statuses: [
                  {
                    error:
                      'Order was never placed, already canceled, or filled.',
                  },
                ],
              },
            },
          }),
        },
        info: {
          orderStatus: vi.fn().mockResolvedValue({ status: 'unknownOid' }),
          frontendOpenOrders: vi.fn().mockResolvedValue([
            {
              coin: 'ETH',
              oid: 456,
              reduceOnly: true,
              isTrigger: true,
              isPositionTpsl: true,
              orderType: 'Take Profit Limit',
              children: [],
            },
          ]),
        },
      });

      const result = await provider.updatePositionTPSL({
        symbol: 'ETH',
        takeProfitPrice: '3500',
      });

      expect(result).toStrictEqual({
        success: true,
        orderId: 'TP/SL orders placed',
        childOrderIds: ['123'],
      });
      expect(exchangeClient.cancel.mock.invocationCallOrder[0]).toBeLessThan(
        exchangeClient.order.mock.invocationCallOrder[0],
      );
    });

    it('rejects a TP/SL batch with one failed placement status', async () => {
      const { exchangeClient } = useStrategyClients({
        exchange: {
          order: vi.fn().mockResolvedValue({
            status: 'ok',
            response: {
              data: {
                statuses: [
                  { resting: { oid: 123 } },
                  { error: 'Rejected stop loss' },
                ],
              },
            },
          }),
        },
      });

      const result = await provider.updatePositionTPSL({
        symbol: 'ETH',
        takeProfitPrice: '3500',
        takeProfitSize: '0.4',
        stopLossPrice: '2500',
        stopLossSize: '0.6',
      });

      expect(result).toMatchObject({
        success: false,
        error: PERPS_ERROR_CODES.TPSL_UPDATE_FAILED,
      });
      expect(exchangeClient.order).toHaveBeenCalledTimes(1);
      expect(exchangeClient.cancel).toHaveBeenCalledWith({
        cancels: [{ a: 1, o: 123 }],
      });
    });

    it('returns a recoverable ID when partial-placement cleanup is refused', async () => {
      const { exchangeClient } = useStrategyClients({
        exchange: {
          order: vi.fn().mockResolvedValue({
            status: 'ok',
            response: {
              data: {
                statuses: [
                  { resting: { oid: 123 } },
                  { error: 'Rejected stop loss' },
                ],
              },
            },
          }),
          cancel: vi.fn().mockResolvedValue({
            status: 'ok',
            response: { data: { statuses: [{ error: 'Invalid nonce' }] } },
          }),
        },
      });

      const result = await provider.updatePositionTPSL({
        symbol: 'ETH',
        takeProfitPrice: '3500',
        takeProfitSize: '0.4',
        stopLossPrice: '2500',
        stopLossSize: '0.6',
      });

      expect(result).toMatchObject({
        success: false,
        error: PERPS_ERROR_CODES.TPSL_UPDATE_FAILED,
        childOrderIds: ['123'],
      });
      expect(exchangeClient.cancel).toHaveBeenCalledWith({
        cancels: [{ a: 1, o: 123 }],
      });
    });

    it('reports lost protection when whole-position cleanup is refused', async () => {
      const cancel = vi
        .fn()
        .mockResolvedValueOnce({
          status: 'ok',
          response: { data: { statuses: ['success', 'success'] } },
        })
        .mockResolvedValueOnce({
          status: 'ok',
          response: { data: { statuses: [{ error: 'Invalid nonce' }] } },
        });
      const { exchangeClient } = useStrategyClients({
        exchange: {
          cancel,
          order: vi.fn().mockResolvedValue({
            status: 'ok',
            response: {
              data: {
                statuses: [
                  { resting: { oid: 123 } },
                  { error: 'Rejected stop loss' },
                ],
              },
            },
          }),
        },
        info: {
          frontendOpenOrders: vi.fn().mockResolvedValue([
            {
              coin: 'ETH',
              oid: 456,
              reduceOnly: true,
              isTrigger: true,
              isPositionTpsl: true,
              orderType: 'Take Profit Limit',
              children: [],
            },
            {
              coin: 'ETH',
              oid: 457,
              reduceOnly: true,
              isTrigger: true,
              isPositionTpsl: true,
              orderType: 'Stop Market',
              children: [],
            },
          ]),
        },
      });

      const result = await provider.updatePositionTPSL({
        symbol: 'ETH',
        takeProfitPrice: '3500',
        stopLossPrice: '2500',
      });

      expect(result).toStrictEqual({
        success: false,
        error: PERPS_ERROR_CODES.TPSL_PROTECTION_LOST,
        childOrderIds: ['123'],
      });
      expect(exchangeClient.order).toHaveBeenCalledTimes(1);
      expect(cancel).toHaveBeenLastCalledWith({
        cancels: [{ a: 1, o: 123 }],
      });
    });

    it('reports a filled partial trigger without trying to cancel it', async () => {
      const { exchangeClient } = useStrategyClients({
        exchange: {
          order: vi.fn().mockResolvedValue({
            status: 'ok',
            response: {
              data: {
                statuses: [
                  { filled: { oid: 123 } },
                  { error: 'Rejected stop loss' },
                ],
              },
            },
          }),
        },
      });

      const result = await provider.updatePositionTPSL({
        symbol: 'ETH',
        takeProfitPrice: '3500',
        takeProfitSize: '0.4',
        stopLossPrice: '2500',
        stopLossSize: '0.6',
      });

      expect(result).toMatchObject({
        success: false,
        error: PERPS_ERROR_CODES.TPSL_UPDATE_FAILED,
        childOrderIds: ['123'],
      });
      expect(exchangeClient.cancel).not.toHaveBeenCalled();
    });

    it('restores protection removed by a mixed old pre-cancel without placing the replacement', async () => {
      const { exchangeClient } = useStrategyClients({
        exchange: {
          cancel: vi.fn().mockResolvedValue({
            status: 'ok',
            response: {
              data: {
                statuses: ['success', { error: 'Invalid nonce' }],
              },
            },
          }),
        },
        info: {
          frontendOpenOrders: vi.fn().mockResolvedValue([
            {
              coin: 'ETH',
              side: 'A',
              limitPx: '3400',
              sz: '0',
              origSz: '0',
              oid: 456,
              timestamp: 1_700_000_000_000,
              reduceOnly: true,
              isTrigger: true,
              isPositionTpsl: true,
              triggerCondition: 'Price above 3400',
              triggerPx: '3400',
              orderType: 'Take Profit Limit',
              children: [],
            },
            {
              coin: 'ETH',
              side: 'A',
              limitPx: '2450',
              sz: '0',
              origSz: '0',
              oid: 457,
              timestamp: 1_700_000_000_000,
              reduceOnly: true,
              isTrigger: true,
              isPositionTpsl: true,
              triggerCondition: 'Price below 2500',
              triggerPx: '2500',
              orderType: 'Stop Market',
              children: [],
            },
          ]),
        },
      });

      const result = await provider.updatePositionTPSL({
        symbol: 'ETH',
        takeProfitPrice: '3500',
        stopLossPrice: '2500',
      });

      expect(result).toStrictEqual({
        success: false,
        error: PERPS_ERROR_CODES.TPSL_UPDATE_FAILED,
        childOrderIds: ['457', '123'],
      });
      expect(mockPlatformDependencies.logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          message: PERPS_ERROR_CODES.TPSL_UPDATE_FAILED,
        }),
        expect.objectContaining({
          context: expect.objectContaining({
            data: expect.objectContaining({ method: 'updatePositionTPSL' }),
          }),
        }),
      );
      expect(exchangeClient.cancel).toHaveBeenCalledWith({
        cancels: [
          { a: 1, o: 456 },
          { a: 1, o: 457 },
        ],
      });
      expect(exchangeClient.order).toHaveBeenCalledTimes(1);
      expect(exchangeClient.order).toHaveBeenCalledWith(
        expect.objectContaining({
          grouping: 'positionTpsl',
          orders: [expect.objectContaining({ p: '3400' })],
        }),
      );
    });

    it('accepts one successful placement status per TP/SL order', async () => {
      const { exchangeClient } = useStrategyClients({
        exchange: {
          order: vi.fn().mockResolvedValue({
            status: 'ok',
            response: {
              data: {
                statuses: [
                  { resting: { oid: 123 } },
                  { resting: { oid: 124 } },
                ],
              },
            },
          }),
        },
      });

      const result = await provider.updatePositionTPSL({
        symbol: 'ETH',
        takeProfitPrice: '3500',
        stopLossPrice: '2500',
      });

      expect(result.success).toBe(true);
      expect(exchangeClient.order.mock.calls[0][0].orders).toHaveLength(2);
    });

    it('accepts waitingForTrigger for a combined TP/SL placement', async () => {
      mockSubscriptionService.getOrdersCacheIfInitialized.mockReturnValue([]);
      const { exchangeClient, infoClient } = useStrategyClients({
        exchange: {
          order: vi.fn().mockResolvedValue({
            status: 'ok',
            response: {
              data: {
                statuses: ['waitingForTrigger', 'waitingForTrigger'],
              },
            },
          }),
        },
        info: {
          frontendOpenOrders: vi.fn().mockResolvedValue([]),
        },
      });

      const result = await provider.updatePositionTPSL({
        symbol: 'ETH',
        takeProfitPrice: '3500',
        stopLossPrice: '2500',
        position: createMockPosition({ symbol: 'ETH', size: '1.5' }),
      });

      expect(result).toStrictEqual({
        success: true,
        orderId: 'TP/SL orders placed',
      });
      expect(exchangeClient.cancel).not.toHaveBeenCalled();
      expect(infoClient.frontendOpenOrders).not.toHaveBeenCalled();
    });

    it('accepts mixed resting and waitingForTrigger placement statuses', async () => {
      const { exchangeClient } = useStrategyClients({
        exchange: {
          order: vi.fn().mockResolvedValue({
            status: 'ok',
            response: {
              data: {
                statuses: [{ resting: { oid: 123 } }, 'waitingForTrigger'],
              },
            },
          }),
        },
        info: {
          frontendOpenOrders: vi.fn().mockResolvedValue([]),
        },
      });

      const result = await provider.updatePositionTPSL({
        symbol: 'ETH',
        takeProfitPrice: '3500',
        stopLossPrice: '2500',
      });

      expect(result.success).toBe(true);
      expect(exchangeClient.cancel).not.toHaveBeenCalled();
    });

    it('replaces existing protection when the trigger waits for activation', async () => {
      const frontendOpenOrders = vi.fn().mockResolvedValueOnce([
        {
          coin: 'ETH',
          side: 'A',
          limitPx: '3400',
          sz: '0',
          origSz: '0',
          oid: 456,
          timestamp: 1_700_000_000_000,
          reduceOnly: true,
          isTrigger: true,
          isPositionTpsl: true,
          triggerCondition: 'Price above 3400',
          triggerPx: '3400',
          orderType: 'Take Profit Limit',
          children: [],
        },
      ]);
      const { exchangeClient } = useStrategyClients({
        exchange: {
          order: vi.fn().mockResolvedValue({
            status: 'ok',
            response: {
              data: { statuses: ['waitingForTrigger'] },
            },
          }),
        },
        info: { frontendOpenOrders },
      });

      const result = await provider.updatePositionTPSL({
        symbol: 'ETH',
        takeProfitPrice: '3500',
        position: createMockPosition({ symbol: 'ETH', size: '1.5' }),
      });

      expect(result.success).toBe(true);
      expect(exchangeClient.cancel).toHaveBeenCalledWith({
        cancels: [{ a: 1, o: 456 }],
      });
    });

    it('reconciles a waiting trigger before cleaning up a mixed failure', async () => {
      const frontendOpenOrders = vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            coin: 'ETH',
            side: 'A',
            limitPx: '3500',
            sz: '0.4',
            origSz: '0.4',
            oid: 901,
            timestamp: 1_700_000_000_000,
            reduceOnly: true,
            isTrigger: true,
            isPositionTpsl: false,
            triggerCondition: 'Price above 3500',
            triggerPx: '3500',
            orderType: 'Take Profit Limit',
            children: [],
          },
        ]);
      const { exchangeClient } = useStrategyClients({
        exchange: {
          order: vi.fn().mockResolvedValue({
            status: 'ok',
            response: {
              data: {
                statuses: [
                  'waitingForTrigger',
                  { error: 'Rejected stop loss' },
                ],
              },
            },
          }),
        },
        info: {
          frontendOpenOrders,
          orderStatus: vi
            .fn()
            .mockImplementation(async ({ oid }: { oid: string }) => ({
              status: 'order',
              order: {
                status: 'open',
                order: { coin: 'ETH', cloid: oid, oid: 901 },
              },
            })),
        },
      });

      const result = await provider.updatePositionTPSL({
        symbol: 'ETH',
        takeProfitPrice: '3500',
        takeProfitSize: '0.4',
        stopLossPrice: '2500',
        stopLossSize: '0.6',
        position: createMockPosition({ symbol: 'ETH', size: '1.5' }),
      });

      expect(result).toMatchObject({
        success: false,
        error: PERPS_ERROR_CODES.TPSL_UPDATE_FAILED,
      });
      expect(exchangeClient.cancel).toHaveBeenCalledWith({
        cancels: [{ a: 1, o: 901 }],
      });
    });

    it('reports lost protection when a waiting trigger cannot be reconciled after a mixed failure', async () => {
      const { exchangeClient } = useStrategyClients({
        exchange: {
          order: vi.fn().mockResolvedValue({
            status: 'ok',
            response: {
              data: {
                statuses: [
                  'waitingForTrigger',
                  { error: 'Rejected stop loss' },
                ],
              },
            },
          }),
        },
        info: {
          frontendOpenOrders: vi.fn().mockResolvedValue([]),
        },
      });

      const result = await provider.updatePositionTPSL({
        symbol: 'ETH',
        takeProfitPrice: '3500',
        takeProfitSize: '0.4',
        stopLossPrice: '2500',
        stopLossSize: '0.6',
        position: createMockPosition({ symbol: 'ETH', size: '1.5' }),
      });

      expect(result).toStrictEqual({
        success: false,
        error: PERPS_ERROR_CODES.TPSL_PROTECTION_LOST,
        childOrderIds: [],
      });
      expect(exchangeClient.cancel).not.toHaveBeenCalled();
    });

    it.each([
      ['an unknown placement status', ['futureTriggerStatus']],
      ['an incomplete placement response', []],
    ])(
      'retains uncertainty without duplicate restoration after %s',
      async (_label, statuses) => {
        const order = vi
          .fn()
          .mockResolvedValueOnce({
            status: 'ok',
            response: {
              data: { statuses },
            },
          })
          .mockResolvedValueOnce({
            status: 'ok',
            response: {
              data: { statuses: [{ resting: { oid: 902 } }] },
            },
          });
        const { exchangeClient } = useStrategyClients({
          exchange: { order },
          info: {
            frontendOpenOrders: vi.fn().mockResolvedValue([
              {
                coin: 'ETH',
                side: 'A',
                limitPx: '2450',
                sz: '0',
                origSz: '0',
                oid: 456,
                timestamp: 1_700_000_000_000,
                reduceOnly: true,
                isTrigger: true,
                isPositionTpsl: true,
                triggerCondition: 'Price below 2450',
                triggerPx: '2450',
                orderType: 'Stop Market',
                children: [],
              },
            ]),
          },
        });

        const result = await provider.updatePositionTPSL({
          symbol: 'ETH',
          takeProfitPrice: '3500',
          position: createMockPosition({ symbol: 'ETH', size: '1.5' }),
        });

        expect(result).toStrictEqual({
          success: false,
          error: PERPS_ERROR_CODES.TPSL_PROTECTION_LOST,
          childOrderIds: [],
        });
        expect(exchangeClient.cancel).toHaveBeenCalledWith({
          cancels: [{ a: 1, o: 456 }],
        });
        expect(order).toHaveBeenCalledTimes(1);
      },
    );

    it('cancels old protection before placing partial TP/SL', async () => {
      const { exchangeClient } = useStrategyClients({
        info: {
          frontendOpenOrders: vi.fn().mockResolvedValue([
            {
              coin: 'ETH',
              side: 'A',
              limitPx: '3400',
              sz: '0',
              origSz: '0',
              oid: 456,
              timestamp: 1_700_000_000_000,
              reduceOnly: true,
              isTrigger: true,
              isPositionTpsl: true,
              triggerCondition: 'Price above 3400',
              triggerPx: '3400',
              orderType: 'Take Profit Limit',
              children: [],
            },
          ]),
        },
      });

      const result = await provider.updatePositionTPSL({
        symbol: 'ETH',
        takeProfitPrice: '3500',
        takeProfitSize: '0.4',
      });

      expect(result.success).toBe(true);
      expect(exchangeClient.order).toHaveBeenCalledWith(
        expect.objectContaining({ grouping: 'na' }),
      );
      expect(exchangeClient.cancel).toHaveBeenCalledWith({
        cancels: [{ a: 1, o: 456 }],
      });
      expect(exchangeClient.cancel.mock.invocationCallOrder[0]).toBeLessThan(
        exchangeClient.order.mock.invocationCallOrder[0],
      );
    });

    it('restores old protection when a partial TP/SL replacement fails', async () => {
      const order = vi
        .fn()
        .mockResolvedValueOnce({
          status: 'ok',
          response: {
            data: { statuses: [{ error: 'Rejected replacement' }] },
          },
        })
        .mockResolvedValueOnce({
          status: 'ok',
          response: {
            data: { statuses: [{ resting: { oid: 789 } }] },
          },
        });
      const { exchangeClient } = useStrategyClients({
        exchange: { order },
        info: {
          frontendOpenOrders: vi.fn().mockResolvedValue([
            {
              coin: 'ETH',
              side: 'A',
              limitPx: '3400',
              sz: '0',
              origSz: '0',
              oid: 456,
              timestamp: 1_700_000_000_000,
              reduceOnly: true,
              isTrigger: true,
              isPositionTpsl: true,
              triggerCondition: 'Price above 3400',
              triggerPx: '3400',
              orderType: 'Take Profit Limit',
              children: [],
            },
          ]),
        },
      });

      const result = await provider.updatePositionTPSL({
        symbol: 'ETH',
        takeProfitPrice: '3500',
        takeProfitSize: '0.4',
      });

      expect(result).toMatchObject({
        success: false,
        error: PERPS_ERROR_CODES.TPSL_UPDATE_FAILED,
      });
      expect(exchangeClient.cancel.mock.invocationCallOrder[0]).toBeLessThan(
        order.mock.invocationCallOrder[0],
      );
      expect(order).toHaveBeenCalledTimes(2);
      expect(order.mock.calls[1][0]).toMatchObject({
        grouping: 'positionTpsl',
        orders: [expect.objectContaining({ p: '3400', s: '0' })],
      });
    });
  });
});
