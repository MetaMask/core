import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock, Mocked } from 'vitest';

import { BUILDER_FEE_CONFIG } from '../../../src/constants/hyperLiquidConfig.js';
import {
  CHASE_ORDER_CONFIG,
  CHASE_ORDER_STATUS,
  HYPERLIQUID_TWAP_LIMITS,
  PERFORMANCE_CONFIG,
} from '../../../src/constants/perpsConfig.js';
import { PERPS_ERROR_CODES } from '../../../src/perpsErrorCodes.js';
import { HyperLiquidProvider } from '../../../src/providers/HyperLiquidProvider.js';
import { HyperLiquidClientService } from '../../../src/services/HyperLiquidClientService.js';
import { HyperLiquidWalletService } from '../../../src/services/HyperLiquidWalletService.js';
import { TradingReadinessCache } from '../../../src/services/TradingReadinessCache.js';
import type {
  CancelOrderResult,
  OrderParams,
  OrderResult,
} from '../../../src/types/index.js';
import type { OrderType } from '../../../src/types/perps-types.js';
import { hasFeeReductionAppliedFlag } from '../../../src/utils/subscriptionFeeWaiver.js';
import {
  baseOrder,
  createClearinghouseBalance,
  createTestProvider,
  mockPlatformDependencies,
  setUpStrategyProvider,
  useHip3Capabilities,
  useStrategyClients,
} from '../../helpers/hyperLiquidStrategyOrders.js';
import type { MockClient } from '../../helpers/hyperLiquidStrategyOrders.js';
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

  beforeEach(() => {
    ({ provider, mockClientService, mockWalletService } =
      setUpStrategyProvider());
  });

  describe('Order capabilities', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('advertises the strategies supported for a routed market', async () => {
      useStrategyClients();

      const capabilities = await provider.getOrderCapabilities({
        symbol: 'ETH',
      });

      expect(capabilities).toStrictEqual({
        status: 'ready',
        providerId: 'hyperliquid',
        supportedStrategies: ['twap', 'scale', 'chase'],
        positionTpsl: {
          supportsExpectedPosition: true,
          childOrderIds: 'request-correlated',
          takeProfitOrderType: 'take_profit_limit',
          stopLossOrderType: 'stop_market',
          defaultCoverage: 'dynamic-position',
          partialCoverage: {
            single: true,
            pair: 'independent',
            replacement: 'cancel-before-create',
            recovery: 'provider-default',
          },
        },
        supportedTriggerOrderTypes: [
          'stop_market',
          'stop_limit',
          'take_profit_market',
          'take_profit_limit',
        ],
        supportedMarginModes: ['isolated', 'cross'],
      });
      expect(Object.isFrozen(capabilities)).toBe(true);
      expect(Object.isFrozen(capabilities.supportedStrategies)).toBe(true);
    });

    it('resolves support before the asset mapping is populated', async () => {
      useStrategyClients();
      const coldProvider = createTestProvider();

      expect(
        await coldProvider.getOrderCapabilities({ symbol: 'ETH' }),
      ).toStrictEqual({
        status: 'ready',
        providerId: 'hyperliquid',
        supportedStrategies: ['twap', 'scale', 'chase'],
        positionTpsl: {
          supportsExpectedPosition: true,
          childOrderIds: 'request-correlated',
          takeProfitOrderType: 'take_profit_limit',
          stopLossOrderType: 'stop_market',
          defaultCoverage: 'dynamic-position',
          partialCoverage: {
            single: true,
            pair: 'independent',
            replacement: 'cancel-before-create',
            recovery: 'provider-default',
          },
        },
        supportedTriggerOrderTypes: [
          'stop_market',
          'stop_limit',
          'take_profit_market',
          'take_profit_limit',
        ],
        supportedMarginModes: ['isolated', 'cross'],
      });
    });

    it('advertises strategies for an existing HIP-3 market', async () => {
      const { capabilityProvider, infoClient } = useHip3Capabilities();

      expect(
        await capabilityProvider.getOrderCapabilities({ symbol: 'xyz:TSLA' }),
      ).toStrictEqual({
        status: 'ready',
        providerId: 'hyperliquid',
        supportedStrategies: ['twap', 'scale', 'chase'],
        positionTpsl: {
          supportsExpectedPosition: true,
          childOrderIds: 'request-correlated',
          takeProfitOrderType: 'take_profit_limit',
          stopLossOrderType: 'stop_market',
          defaultCoverage: 'dynamic-position',
          partialCoverage: {
            single: true,
            pair: 'independent',
            replacement: 'cancel-before-create',
            recovery: 'provider-default',
          },
        },
        supportedTriggerOrderTypes: [
          'stop_market',
          'stop_limit',
          'take_profit_market',
          'take_profit_limit',
        ],
        supportedMarginModes: ['isolated'],
      });
      expect(infoClient.meta).toHaveBeenCalledWith({ dex: 'xyz' });
    });

    it.each([
      ['isolated-only', { onlyIsolated: true }],
      ['strictIsolated', { marginMode: 'strictIsolated' }],
      ['noCross', { marginMode: 'noCross' }],
    ])(
      'reports only isolated margin for a %s market',
      async (_, restriction) => {
        useStrategyClients({
          info: {
            meta: vi.fn().mockResolvedValue({
              universe: [
                { name: 'ETH', szDecimals: 4, maxLeverage: 50, ...restriction },
              ],
            }),
          },
        });

        expect(
          await provider.getOrderCapabilities({ symbol: 'ETH' }),
        ).toStrictEqual({
          status: 'ready',
          providerId: 'hyperliquid',
          supportedStrategies: ['twap', 'scale', 'chase'],
          positionTpsl: {
            supportsExpectedPosition: true,
            childOrderIds: 'request-correlated',
            takeProfitOrderType: 'take_profit_limit',
            stopLossOrderType: 'stop_market',
            defaultCoverage: 'dynamic-position',
            partialCoverage: {
              single: true,
              pair: 'independent',
              replacement: 'cancel-before-create',
              recovery: 'provider-default',
            },
          },
          supportedTriggerOrderTypes: [
            'stop_market',
            'stop_limit',
            'take_profit_market',
            'take_profit_limit',
          ],
          supportedMarginModes: ['isolated'],
        });
      },
    );

    it.each([
      ['the HIP-3 kill switch is off', { hip3Enabled: false }],
      ['the market is blocklisted', { blocklistMarkets: ['xyz:TSLA'] }],
    ])('does not advertise a HIP-3 market when %s', async (_, options) => {
      const { capabilityProvider } = useHip3Capabilities({}, options);

      expect(
        await capabilityProvider.getOrderCapabilities({ symbol: 'xyz:TSLA' }),
      ).toStrictEqual({
        status: 'unavailable',
        providerId: 'hyperliquid',
        reason: 'market_not_found',
      });
    });

    it('does not advertise a non-USDC-collateral HIP-3 market', async () => {
      const { capabilityProvider } = useHip3Capabilities({
        meta: vi.fn().mockResolvedValue({
          universe: [{ name: 'xyz:TSLA', szDecimals: 3, maxLeverage: 20 }],
          collateralToken: 1,
        }),
      });

      expect(
        await capabilityProvider.getOrderCapabilities({ symbol: 'xyz:TSLA' }),
      ).toStrictEqual({
        status: 'unavailable',
        providerId: 'hyperliquid',
        reason: 'market_not_found',
      });
    });

    it('reports a missing HIP-3 market after checking its DEX metadata', async () => {
      const { capabilityProvider, infoClient } = useHip3Capabilities();

      expect(
        await capabilityProvider.getOrderCapabilities({ symbol: 'xyz:FAKE' }),
      ).toStrictEqual({
        status: 'unavailable',
        providerId: 'hyperliquid',
        reason: 'market_not_found',
      });
      expect(infoClient.meta).toHaveBeenCalledWith({ dex: 'xyz' });
    });

    it('reports a disconnected HIP-3 provider as unavailable', async () => {
      const { capabilityProvider } = useHip3Capabilities();
      await capabilityProvider.disconnect();

      expect(
        await capabilityProvider.getOrderCapabilities({ symbol: 'xyz:TSLA' }),
      ).toStrictEqual({
        status: 'unavailable',
        providerId: 'hyperliquid',
        reason: 'provider_unavailable',
      });
    });

    it('keeps delisted main-DEX discovery aligned with placement', async () => {
      useStrategyClients({
        info: {
          meta: vi.fn().mockResolvedValue({
            universe: [
              {
                name: 'ETH',
                szDecimals: 4,
                maxLeverage: 50,
                isDelisted: true,
              },
            ],
          }),
        },
      });

      expect(
        await provider.getOrderCapabilities({ symbol: 'ETH' }),
      ).toStrictEqual({
        status: 'ready',
        providerId: 'hyperliquid',
        supportedStrategies: ['twap', 'scale', 'chase'],
        positionTpsl: {
          supportsExpectedPosition: true,
          childOrderIds: 'request-correlated',
          takeProfitOrderType: 'take_profit_limit',
          stopLossOrderType: 'stop_market',
          defaultCoverage: 'dynamic-position',
          partialCoverage: {
            single: true,
            pair: 'independent',
            replacement: 'cancel-before-create',
            recovery: 'provider-default',
          },
        },
        supportedTriggerOrderTypes: [
          'stop_market',
          'stop_limit',
          'take_profit_market',
          'take_profit_limit',
        ],
        supportedMarginModes: ['isolated', 'cross'],
      });
    });

    it('reports an empty symbol as invalid', async () => {
      const { infoClient } = useStrategyClients();

      expect(await provider.getOrderCapabilities({ symbol: '' })).toStrictEqual(
        {
          status: 'unavailable',
          providerId: 'hyperliquid',
          reason: 'invalid_symbol',
        },
      );
      expect(infoClient.meta).not.toHaveBeenCalled();
    });

    it('reports a route missing its market as invalid', async () => {
      const { infoClient } = useStrategyClients();

      expect(
        await provider.getOrderCapabilities({ symbol: 'BTC:' }),
      ).toStrictEqual({
        status: 'unavailable',
        providerId: 'hyperliquid',
        reason: 'invalid_symbol',
      });
      expect(infoClient.meta).not.toHaveBeenCalled();
    });

    it('reports a route missing its DEX as invalid', async () => {
      const { infoClient } = useStrategyClients();

      expect(
        await provider.getOrderCapabilities({ symbol: ':BTC' }),
      ).toStrictEqual({
        status: 'unavailable',
        providerId: 'hyperliquid',
        reason: 'invalid_symbol',
      });
      expect(infoClient.meta).not.toHaveBeenCalled();
    });

    it.each([' ETH', 'ETH ', 'ETH BTC', 'a:b:c'])(
      'reports malformed symbol %p as invalid',
      async (symbol) => {
        const { infoClient } = useStrategyClients();

        expect(await provider.getOrderCapabilities({ symbol })).toStrictEqual({
          status: 'unavailable',
          providerId: 'hyperliquid',
          reason: 'invalid_symbol',
        });
        expect(infoClient.meta).not.toHaveBeenCalled();
      },
    );

    it('reports an unknown main-DEX market as unavailable', async () => {
      const { infoClient } = useStrategyClients();

      expect(
        await provider.getOrderCapabilities({ symbol: 'DOGE' }),
      ).toStrictEqual({
        status: 'unavailable',
        providerId: 'hyperliquid',
        reason: 'market_not_found',
      });
      expect(infoClient.meta).toHaveBeenCalledTimes(1);
    });

    it('refreshes metadata at the freshness boundary', async () => {
      const { infoClient } = useStrategyClients();

      await provider.getOrderCapabilities({ symbol: 'DOGE' });
      vi.advanceTimersByTime(
        PERFORMANCE_CONFIG.OrderCapabilitiesMetaFreshnessMs - 1,
      );
      await provider.getOrderCapabilities({ symbol: 'ETH' });

      expect(infoClient.meta).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(1);
      await provider.getOrderCapabilities({ symbol: 'ETH' });

      expect(infoClient.meta).toHaveBeenCalledTimes(2);
    });

    it('shares fresh metadata across unrelated symbols', async () => {
      const { infoClient } = useStrategyClients();

      await provider.getOrderCapabilities({ symbol: 'DOGE' });
      infoClient.meta.mockResolvedValueOnce({
        universe: [
          { name: 'BTC', szDecimals: 3, maxLeverage: 50 },
          { name: 'ETH', szDecimals: 4, maxLeverage: 50 },
          { name: 'PUMP', szDecimals: 0, maxLeverage: 20 },
        ],
      });
      vi.advanceTimersByTime(
        PERFORMANCE_CONFIG.OrderCapabilitiesMetaFreshnessMs,
      );

      await provider.getOrderCapabilities({ symbol: 'DOGE' });

      expect(
        await provider.getOrderCapabilities({ symbol: 'PUMP' }),
      ).toStrictEqual({
        status: 'ready',
        providerId: 'hyperliquid',
        supportedStrategies: ['twap', 'scale', 'chase'],
        positionTpsl: {
          supportsExpectedPosition: true,
          childOrderIds: 'request-correlated',
          takeProfitOrderType: 'take_profit_limit',
          stopLossOrderType: 'stop_market',
          defaultCoverage: 'dynamic-position',
          partialCoverage: {
            single: true,
            pair: 'independent',
            replacement: 'cancel-before-create',
            recovery: 'provider-default',
          },
        },
        supportedTriggerOrderTypes: [
          'stop_market',
          'stop_limit',
          'take_profit_market',
          'take_profit_limit',
        ],
        supportedMarginModes: ['isolated', 'cross'],
      });
      expect(infoClient.meta).toHaveBeenCalledTimes(2);
    });

    it('does not reuse session-long metadata for capability discovery', async () => {
      const { infoClient } = useStrategyClients();

      await provider.getMaxLeverage('ETH');

      expect(
        await provider.getOrderCapabilities({ symbol: 'ETH' }),
      ).toStrictEqual({
        status: 'ready',
        providerId: 'hyperliquid',
        supportedStrategies: ['twap', 'scale', 'chase'],
        positionTpsl: {
          supportsExpectedPosition: true,
          childOrderIds: 'request-correlated',
          takeProfitOrderType: 'take_profit_limit',
          stopLossOrderType: 'stop_market',
          defaultCoverage: 'dynamic-position',
          partialCoverage: {
            single: true,
            pair: 'independent',
            replacement: 'cancel-before-create',
            recovery: 'provider-default',
          },
        },
        supportedTriggerOrderTypes: [
          'stop_market',
          'stop_limit',
          'take_profit_market',
          'take_profit_limit',
        ],
        supportedMarginModes: ['isolated', 'cross'],
      });
      expect(infoClient.meta).toHaveBeenCalledTimes(2);
    });

    it('ages capability metadata from request completion', async () => {
      const requestStarted = createDeferred<void>();
      const pendingMeta = createDeferred<{
        universe: { name: string; szDecimals: number; maxLeverage: number }[];
      }>();
      const meta = vi
        .fn()
        .mockImplementationOnce(() => {
          requestStarted.resolve();
          return pendingMeta.promise;
        })
        .mockResolvedValueOnce({
          universe: [{ name: 'ETH', szDecimals: 4, maxLeverage: 50 }],
        });
      const { infoClient } = useStrategyClients({ info: { meta } });

      const capabilities = provider.getOrderCapabilities({ symbol: 'ETH' });
      await requestStarted.promise;
      vi.advanceTimersByTime(
        PERFORMANCE_CONFIG.OrderCapabilitiesMetaFreshnessMs,
      );
      pendingMeta.resolve({
        universe: [{ name: 'ETH', szDecimals: 4, maxLeverage: 50 }],
      });
      expect(await capabilities).toMatchObject({ status: 'ready' });

      expect(
        await provider.getOrderCapabilities({ symbol: 'ETH' }),
      ).toMatchObject({ status: 'ready' });
      expect(infoClient.meta).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(
        PERFORMANCE_CONFIG.OrderCapabilitiesMetaFreshnessMs,
      );
      expect(
        await provider.getOrderCapabilities({ symbol: 'ETH' }),
      ).toMatchObject({ status: 'ready' });
      expect(infoClient.meta).toHaveBeenCalledTimes(2);
    });

    it('isolates capability metadata from overlapping shared cache writes', async () => {
      const sharedRequestStarted = createDeferred<void>();
      const pendingSharedMeta = createDeferred<{
        universe: { name: string; szDecimals: number; maxLeverage: number }[];
      }>();
      const { infoClient } = useStrategyClients({
        info: {
          meta: vi
            .fn()
            .mockImplementationOnce(() => {
              sharedRequestStarted.resolve();
              return pendingSharedMeta.promise;
            })
            .mockResolvedValueOnce({
              universe: [{ name: 'ETH', szDecimals: 4, maxLeverage: 50 }],
            }),
        },
      });

      const sharedRead = provider.getMaxLeverage('PUMP');
      await sharedRequestStarted.promise;
      expect(
        await provider.getOrderCapabilities({ symbol: 'ETH' }),
      ).toStrictEqual({
        status: 'ready',
        providerId: 'hyperliquid',
        supportedStrategies: ['twap', 'scale', 'chase'],
        positionTpsl: {
          supportsExpectedPosition: true,
          childOrderIds: 'request-correlated',
          takeProfitOrderType: 'take_profit_limit',
          stopLossOrderType: 'stop_market',
          defaultCoverage: 'dynamic-position',
          partialCoverage: {
            single: true,
            pair: 'independent',
            replacement: 'cancel-before-create',
            recovery: 'provider-default',
          },
        },
        supportedTriggerOrderTypes: [
          'stop_market',
          'stop_limit',
          'take_profit_market',
          'take_profit_limit',
        ],
        supportedMarginModes: ['isolated', 'cross'],
      });

      pendingSharedMeta.resolve({
        universe: [{ name: 'PUMP', szDecimals: 0, maxLeverage: 20 }],
      });
      await sharedRead;

      expect(
        await provider.getOrderCapabilities({ symbol: 'ETH' }),
      ).toStrictEqual({
        status: 'ready',
        providerId: 'hyperliquid',
        supportedStrategies: ['twap', 'scale', 'chase'],
        positionTpsl: {
          supportsExpectedPosition: true,
          childOrderIds: 'request-correlated',
          takeProfitOrderType: 'take_profit_limit',
          stopLossOrderType: 'stop_market',
          defaultCoverage: 'dynamic-position',
          partialCoverage: {
            single: true,
            pair: 'independent',
            replacement: 'cancel-before-create',
            recovery: 'provider-default',
          },
        },
        supportedTriggerOrderTypes: [
          'stop_market',
          'stop_limit',
          'take_profit_market',
          'take_profit_limit',
        ],
        supportedMarginModes: ['isolated', 'cross'],
      });
      expect(infoClient.meta).toHaveBeenCalledTimes(2);
    });

    it('deduplicates concurrent metadata refreshes', async () => {
      const metaRequestStarted = createDeferred<void>();
      const pendingMeta = createDeferred<{
        universe: { name: string; szDecimals: number; maxLeverage: number }[];
      }>();
      const { infoClient } = useStrategyClients({
        info: {
          meta: vi.fn().mockImplementation(() => {
            metaRequestStarted.resolve();
            return pendingMeta.promise;
          }),
        },
      });

      const reads = [
        provider.getOrderCapabilities({ symbol: 'BTC' }),
        provider.getOrderCapabilities({ symbol: 'ETH' }),
      ];
      await metaRequestStarted.promise;

      expect(infoClient.meta).toHaveBeenCalledTimes(1);
      pendingMeta.resolve({
        universe: [
          { name: 'BTC', szDecimals: 3, maxLeverage: 50 },
          { name: 'ETH', szDecimals: 4, maxLeverage: 50 },
        ],
      });
      expect(await Promise.all(reads)).toStrictEqual([
        {
          status: 'ready',
          providerId: 'hyperliquid',
          supportedStrategies: ['twap', 'scale', 'chase'],
          positionTpsl: {
            supportsExpectedPosition: true,
            childOrderIds: 'request-correlated',
            takeProfitOrderType: 'take_profit_limit',
            stopLossOrderType: 'stop_market',
            defaultCoverage: 'dynamic-position',
            partialCoverage: {
              single: true,
              pair: 'independent',
              replacement: 'cancel-before-create',
              recovery: 'provider-default',
            },
          },
          supportedTriggerOrderTypes: [
            'stop_market',
            'stop_limit',
            'take_profit_market',
            'take_profit_limit',
          ],
          supportedMarginModes: ['isolated', 'cross'],
        },
        {
          status: 'ready',
          providerId: 'hyperliquid',
          supportedStrategies: ['twap', 'scale', 'chase'],
          positionTpsl: {
            supportsExpectedPosition: true,
            childOrderIds: 'request-correlated',
            takeProfitOrderType: 'take_profit_limit',
            stopLossOrderType: 'stop_market',
            defaultCoverage: 'dynamic-position',
            partialCoverage: {
              single: true,
              pair: 'independent',
              replacement: 'cancel-before-create',
              recovery: 'provider-default',
            },
          },
          supportedTriggerOrderTypes: [
            'stop_market',
            'stop_limit',
            'take_profit_market',
            'take_profit_limit',
          ],
          supportedMarginModes: ['isolated', 'cross'],
        },
      ]);
    });

    it('refreshes and coalesces capability metadata per HIP-3 DEX', async () => {
      const pendingMeta = createDeferred<{
        universe: { name: string; szDecimals: number; maxLeverage: number }[];
        collateralToken: number;
      }>();
      const meta = vi
        .fn()
        .mockReturnValueOnce(pendingMeta.promise)
        .mockResolvedValue({
          universe: [{ name: 'xyz:TSLA', szDecimals: 3, maxLeverage: 20 }],
          collateralToken: 0,
        });
      const { capabilityProvider, infoClient } = useHip3Capabilities({ meta });

      const reads = [
        capabilityProvider.getOrderCapabilities({ symbol: 'xyz:TSLA' }),
        capabilityProvider.getOrderCapabilities({ symbol: 'xyz:XYZ100' }),
      ];
      pendingMeta.resolve({
        universe: [{ name: 'xyz:TSLA', szDecimals: 3, maxLeverage: 20 }],
        collateralToken: 0,
      });
      await Promise.all(reads);

      expect(infoClient.meta).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(
        PERFORMANCE_CONFIG.OrderCapabilitiesMetaFreshnessMs,
      );
      await capabilityProvider.getOrderCapabilities({ symbol: 'xyz:TSLA' });
      expect(infoClient.meta).toHaveBeenCalledTimes(2);
    });

    it('refreshes metadata after reconnect', async () => {
      const { infoClient } = useStrategyClients();

      await provider.getOrderCapabilities({ symbol: 'ETH' });
      await provider.disconnect();
      expect(
        await provider.getOrderCapabilities({ symbol: 'ETH' }),
      ).toStrictEqual({
        status: 'unavailable',
        providerId: 'hyperliquid',
        reason: 'provider_unavailable',
      });
      await provider.initialize();
      await provider.getOrderCapabilities({ symbol: 'ETH' });

      expect(infoClient.meta).toHaveBeenCalledTimes(2);
    });

    it('reports capabilities unavailable during disconnect', async () => {
      const { infoClient } = useStrategyClients();
      const disconnectStarted = createDeferred<void>();
      const pendingDisconnect = createDeferred<void>();
      mockClientService.disconnect.mockImplementationOnce(() => {
        disconnectStarted.resolve();
        return pendingDisconnect.promise;
      });

      const disconnectPromise = provider.disconnect();
      await disconnectStarted.promise;
      expect(
        await provider.getOrderCapabilities({ symbol: 'ETH' }),
      ).toStrictEqual({
        status: 'unavailable',
        providerId: 'hyperliquid',
        reason: 'provider_unavailable',
      });
      pendingDisconnect.resolve();
      await disconnectPromise;

      expect(
        await provider.getOrderCapabilities({ symbol: 'ETH' }),
      ).toStrictEqual({
        status: 'unavailable',
        providerId: 'hyperliquid',
        reason: 'provider_unavailable',
      });
      await provider.initialize();
      expect(
        await provider.getOrderCapabilities({ symbol: 'ETH' }),
      ).toStrictEqual({
        status: 'ready',
        providerId: 'hyperliquid',
        supportedStrategies: ['twap', 'scale', 'chase'],
        positionTpsl: {
          supportsExpectedPosition: true,
          childOrderIds: 'request-correlated',
          takeProfitOrderType: 'take_profit_limit',
          stopLossOrderType: 'stop_market',
          defaultCoverage: 'dynamic-position',
          partialCoverage: {
            single: true,
            pair: 'independent',
            replacement: 'cancel-before-create',
            recovery: 'provider-default',
          },
        },
        supportedTriggerOrderTypes: [
          'stop_market',
          'stop_limit',
          'take_profit_market',
          'take_profit_limit',
        ],
        supportedMarginModes: ['isolated', 'cross'],
      });
      expect(infoClient.meta).toHaveBeenCalledTimes(1);
    });

    it('does not reconnect when initialization overlaps a disconnect', async () => {
      const initializeStarted = createDeferred<void>();
      const pendingInitialize = createDeferred<void>();
      const clientDisconnectStarted = createDeferred<void>();
      const pendingClientDisconnect = createDeferred<void>();
      mockClientService.initialize.mockImplementationOnce(() => {
        initializeStarted.resolve();
        return pendingInitialize.promise;
      });
      mockClientService.disconnect.mockImplementationOnce(() => {
        clientDisconnectStarted.resolve();
        return pendingClientDisconnect.promise;
      });

      const initializeResult = provider.initialize();
      await initializeStarted.promise;
      const disconnectResult = provider.disconnect();
      pendingInitialize.resolve();

      expect(await initializeResult).toStrictEqual({
        success: false,
        error: PERPS_ERROR_CODES.PROVIDER_LIFECYCLE_STALE,
      });
      await clientDisconnectStarted.promise;
      expect(
        await provider.getOrderCapabilities({ symbol: 'ETH' }),
      ).toStrictEqual({
        status: 'unavailable',
        providerId: 'hyperliquid',
        reason: 'provider_unavailable',
      });

      pendingClientDisconnect.resolve();
      expect(await disconnectResult).toStrictEqual({ success: true });
    });

    it('does not initialize while a disconnect is in progress', async () => {
      useStrategyClients();
      const clientDisconnectStarted = createDeferred<void>();
      const pendingClientDisconnect = createDeferred<void>();
      mockClientService.disconnect.mockImplementationOnce(() => {
        clientDisconnectStarted.resolve();
        return pendingClientDisconnect.promise;
      });

      const disconnectResult = provider.disconnect();
      await clientDisconnectStarted.promise;

      expect(await provider.initialize()).toStrictEqual({
        success: false,
        error: PERPS_ERROR_CODES.PROVIDER_LIFECYCLE_STALE,
      });
      expect(mockClientService.initialize).not.toHaveBeenCalled();

      pendingClientDisconnect.resolve();
      expect(await disconnectResult).toStrictEqual({ success: true });
      expect(await provider.initialize()).toStrictEqual({
        success: true,
        chainId: '42161',
      });
    });

    it('shares one teardown between overlapping disconnects', async () => {
      const { infoClient } = useStrategyClients();
      const disconnectStarted = createDeferred<void>();
      const pendingDisconnect = createDeferred<void>();
      mockClientService.disconnect.mockImplementationOnce(() => {
        disconnectStarted.resolve();
        return pendingDisconnect.promise;
      });

      const firstResult = provider.disconnect();
      const secondResult = provider.disconnect();

      expect(
        await provider.getOrderCapabilities({ symbol: 'ETH' }),
      ).toStrictEqual({
        status: 'unavailable',
        providerId: 'hyperliquid',
        reason: 'provider_unavailable',
      });

      await disconnectStarted.promise;
      expect(mockClientService.disconnect).toHaveBeenCalledTimes(1);
      pendingDisconnect.resolve();
      expect(await Promise.all([firstResult, secondResult])).toStrictEqual([
        { success: true },
        { success: true },
      ]);

      expect(
        await provider.getOrderCapabilities({ symbol: 'ETH' }),
      ).toStrictEqual({
        status: 'unavailable',
        providerId: 'hyperliquid',
        reason: 'provider_unavailable',
      });
      await provider.initialize();
      expect(
        await provider.getOrderCapabilities({ symbol: 'ETH' }),
      ).toStrictEqual({
        status: 'ready',
        providerId: 'hyperliquid',
        supportedStrategies: ['twap', 'scale', 'chase'],
        positionTpsl: {
          supportsExpectedPosition: true,
          childOrderIds: 'request-correlated',
          takeProfitOrderType: 'take_profit_limit',
          stopLossOrderType: 'stop_market',
          defaultCoverage: 'dynamic-position',
          partialCoverage: {
            single: true,
            pair: 'independent',
            replacement: 'cancel-before-create',
            recovery: 'provider-default',
          },
        },
        supportedTriggerOrderTypes: [
          'stop_market',
          'stop_limit',
          'take_profit_market',
          'take_profit_limit',
        ],
        supportedMarginModes: ['isolated', 'cross'],
      });
      expect(infoClient.meta).toHaveBeenCalledTimes(1);
    });

    it('invalidates an in-flight refresh when client disconnect fails', async () => {
      const requestStarted = createDeferred<void>();
      const pendingMeta = createDeferred<{
        universe: { name: string; szDecimals: number; maxLeverage: number }[];
      }>();
      const { infoClient } = useStrategyClients({
        info: {
          meta: vi
            .fn()
            .mockImplementationOnce(() => {
              requestStarted.resolve();
              return pendingMeta.promise;
            })
            .mockResolvedValueOnce({
              universe: [{ name: 'ETH', szDecimals: 4, maxLeverage: 50 }],
            }),
        },
      });
      mockClientService.disconnect.mockRejectedValueOnce(
        new Error('disconnect failed'),
      );

      const staleRead = provider.getOrderCapabilities({ symbol: 'ETH' });
      await requestStarted.promise;
      const disconnectResult = await provider.disconnect();
      pendingMeta.resolve({
        universe: [{ name: 'ETH', szDecimals: 4, maxLeverage: 50 }],
      });

      expect(disconnectResult).toStrictEqual({
        success: false,
        error: 'disconnect failed',
      });
      expect(await staleRead).toStrictEqual({
        status: 'unavailable',
        providerId: 'hyperliquid',
        reason: 'provider_unavailable',
      });
      await provider.initialize();
      expect(
        await provider.getOrderCapabilities({ symbol: 'ETH' }),
      ).toStrictEqual({
        status: 'ready',
        providerId: 'hyperliquid',
        supportedStrategies: ['twap', 'scale', 'chase'],
        positionTpsl: {
          supportsExpectedPosition: true,
          childOrderIds: 'request-correlated',
          takeProfitOrderType: 'take_profit_limit',
          stopLossOrderType: 'stop_market',
          defaultCoverage: 'dynamic-position',
          partialCoverage: {
            single: true,
            pair: 'independent',
            replacement: 'cancel-before-create',
            recovery: 'provider-default',
          },
        },
        supportedTriggerOrderTypes: [
          'stop_market',
          'stop_limit',
          'take_profit_market',
          'take_profit_limit',
        ],
        supportedMarginModes: ['isolated', 'cross'],
      });
      expect(infoClient.meta).toHaveBeenCalledTimes(2);
    });

    it('retries immediately after a metadata refresh failure', async () => {
      const { infoClient } = useStrategyClients({
        info: {
          meta: vi
            .fn()
            .mockRejectedValueOnce(new Error('offline'))
            .mockResolvedValueOnce({
              universe: [{ name: 'ETH', szDecimals: 4, maxLeverage: 50 }],
            }),
        },
      });

      expect(
        await provider.getOrderCapabilities({ symbol: 'ETH' }),
      ).toStrictEqual({
        status: 'unavailable',
        providerId: 'hyperliquid',
        reason: 'provider_unavailable',
      });
      expect(
        await provider.getOrderCapabilities({ symbol: 'ETH' }),
      ).toStrictEqual({
        status: 'ready',
        providerId: 'hyperliquid',
        supportedStrategies: ['twap', 'scale', 'chase'],
        positionTpsl: {
          supportsExpectedPosition: true,
          childOrderIds: 'request-correlated',
          takeProfitOrderType: 'take_profit_limit',
          stopLossOrderType: 'stop_market',
          defaultCoverage: 'dynamic-position',
          partialCoverage: {
            single: true,
            pair: 'independent',
            replacement: 'cancel-before-create',
            recovery: 'provider-default',
          },
        },
        supportedTriggerOrderTypes: [
          'stop_market',
          'stop_limit',
          'take_profit_market',
          'take_profit_limit',
        ],
        supportedMarginModes: ['isolated', 'cross'],
      });
      expect(infoClient.meta).toHaveBeenCalledTimes(2);
    });

    it('discards an in-flight main-DEX refresh after disconnect', async () => {
      const universe = [{ name: 'ETH', szDecimals: 4, maxLeverage: 50 }];
      const requestStarted = createDeferred<void>();
      const pendingMeta = createDeferred<{ universe: typeof universe }>();
      const meta = vi
        .fn()
        .mockImplementationOnce(() => {
          requestStarted.resolve();
          return pendingMeta.promise;
        })
        .mockResolvedValueOnce({ universe });
      const { infoClient } = useStrategyClients({ info: { meta } });

      const capabilitiesPromise = provider.getOrderCapabilities({
        symbol: 'ETH',
      });
      await requestStarted.promise;
      await provider.disconnect();
      pendingMeta.resolve({ universe });

      expect(await capabilitiesPromise).toStrictEqual({
        status: 'unavailable',
        providerId: 'hyperliquid',
        reason: 'provider_unavailable',
      });
      await provider.initialize();
      expect(
        await provider.getOrderCapabilities({ symbol: 'ETH' }),
      ).toStrictEqual({
        status: 'ready',
        providerId: 'hyperliquid',
        supportedStrategies: ['twap', 'scale', 'chase'],
        positionTpsl: {
          supportsExpectedPosition: true,
          childOrderIds: 'request-correlated',
          takeProfitOrderType: 'take_profit_limit',
          stopLossOrderType: 'stop_market',
          defaultCoverage: 'dynamic-position',
          partialCoverage: {
            single: true,
            pair: 'independent',
            replacement: 'cancel-before-create',
            recovery: 'provider-default',
          },
        },
        supportedTriggerOrderTypes: [
          'stop_market',
          'stop_limit',
          'take_profit_market',
          'take_profit_limit',
        ],
        supportedMarginModes: ['isolated', 'cross'],
      });
      expect(infoClient.meta).toHaveBeenCalledTimes(2);
    });

    it('does not cache capability metadata that resolves after disconnect', async () => {
      const requestStarted = createDeferred<void>();
      const pendingMeta = createDeferred<{
        universe: { name: string; szDecimals: number; maxLeverage: number }[];
      }>();
      const { infoClient } = useStrategyClients({
        info: {
          meta: vi
            .fn()
            .mockImplementationOnce(() => {
              requestStarted.resolve();
              return pendingMeta.promise;
            })
            .mockResolvedValueOnce({
              universe: [{ name: 'ETH', szDecimals: 4, maxLeverage: 50 }],
            }),
        },
      });

      const capabilitiesPromise = provider.getOrderCapabilities({
        symbol: 'ETH',
      });
      await requestStarted.promise;
      await provider.disconnect();
      pendingMeta.resolve({
        universe: [{ name: 'ETH', szDecimals: 4, maxLeverage: 99 }],
      });

      expect(await capabilitiesPromise).toStrictEqual({
        status: 'unavailable',
        providerId: 'hyperliquid',
        reason: 'provider_unavailable',
      });
      expect(await provider.getMaxLeverage('ETH')).toBe(50);
      expect(infoClient.meta).toHaveBeenCalledTimes(2);
    });

    it('does not cache general metadata that resolves after disconnect', async () => {
      const universe = [{ name: 'ETH', szDecimals: 4, maxLeverage: 50 }];
      const requestStarted = createDeferred<void>();
      const pendingMeta = createDeferred<{ universe: typeof universe }>();
      const { infoClient } = useStrategyClients({
        info: {
          meta: vi
            .fn()
            .mockImplementationOnce(() => {
              requestStarted.resolve();
              return pendingMeta.promise;
            })
            .mockResolvedValueOnce({ universe }),
        },
      });

      const staleLeverage = provider.getMaxLeverage('ETH');
      await requestStarted.promise;
      const disconnectResult = provider.disconnect();
      pendingMeta.resolve({ universe });

      expect(await staleLeverage).toBe(50);
      expect(mockPlatformDependencies.logger.error).not.toHaveBeenCalled();
      expect(await disconnectResult).toStrictEqual({ success: true });
      await provider.initialize();
      expect(await provider.getMaxLeverage('ETH')).toBe(50);
      expect(infoClient.meta).toHaveBeenCalledTimes(2);
    });

    it('returns market data that finishes during disconnect without caching it', async () => {
      const requestStarted = createDeferred<void>();
      const pendingMids = createDeferred<Record<string, string>>();
      const { infoClient } = useStrategyClients({
        info: {
          allMids: vi
            .fn()
            .mockImplementationOnce(() => {
              requestStarted.resolve();
              return pendingMids.promise;
            })
            .mockResolvedValue({ ETH: '3000' }),
        },
      });

      const marketDataPromise = provider.getMarketDataWithPrices();
      await requestStarted.promise;
      await provider.disconnect();
      pendingMids.resolve({ ETH: '3000' });

      expect(await marketDataPromise).toStrictEqual(
        expect.arrayContaining([expect.objectContaining({ symbol: 'ETH' })]),
      );
      expect(mockPlatformDependencies.logger.error).not.toHaveBeenCalled();

      const callsAfterStaleRead = infoClient.metaAndAssetCtxs.mock.calls.length;
      await provider.initialize();
      await provider.getMarketDataWithPrices();
      expect(infoClient.metaAndAssetCtxs.mock.calls.length).toBeGreaterThan(
        callsAfterStaleRead,
      );
    });

    it('does not cache Perp DEX metadata that resolves after disconnect', async () => {
      const requestStarted = createDeferred<void>();
      const pendingPerpDexs =
        createDeferred<(null | { name: string; deployerFeeScale: string })[]>();
      const { infoClient } = useStrategyClients({
        info: {
          perpDexs: vi
            .fn()
            .mockImplementationOnce(() => {
              requestStarted.resolve();
              return pendingPerpDexs.promise;
            })
            .mockResolvedValueOnce([
              null,
              { name: 'xyz', deployerFeeScale: '1' },
            ]),
          meta: vi.fn().mockResolvedValue({
            universe: [{ name: 'xyz:TSLA', szDecimals: 3, maxLeverage: 20 }],
          }),
        },
      });
      provider = createTestProvider({
        hip3Enabled: true,
        allowlistMarkets: ['xyz:*'],
      });
      const params = {
        orderType: 'market' as const,
        amount: '1000',
        symbol: 'xyz:TSLA',
      };

      const staleFees = provider.calculateFees(params);
      await requestStarted.promise;
      const disconnectPromise = provider.disconnect();
      pendingPerpDexs.resolve([null, { name: 'xyz', deployerFeeScale: '0.5' }]);

      await expect(staleFees).rejects.toThrow(
        PERPS_ERROR_CODES.PROVIDER_LIFECYCLE_STALE,
      );
      expect(await disconnectPromise).toStrictEqual({ success: true });
      await provider.initialize();
      expect((await provider.calculateFees(params)).protocolFeeRate).toBe(
        0.0009,
      );
      expect(infoClient.perpDexs).toHaveBeenCalledTimes(2);
    });

    it('clears cached capability metadata when the network changes', async () => {
      const meta = vi
        .fn()
        .mockResolvedValueOnce({
          universe: [{ name: 'ETH', szDecimals: 4, maxLeverage: 50 }],
        })
        .mockResolvedValueOnce({
          universe: [{ name: 'BTC', szDecimals: 5, maxLeverage: 40 }],
        });
      const { infoClient } = useStrategyClients({ info: { meta } });

      expect(
        await provider.getOrderCapabilities({ symbol: 'ETH' }),
      ).toMatchObject({ status: 'ready' });
      await provider.toggleTestnet();

      expect(
        await provider.getOrderCapabilities({ symbol: 'ETH' }),
      ).toStrictEqual({
        status: 'unavailable',
        providerId: 'hyperliquid',
        reason: 'market_not_found',
      });
      expect(infoClient.meta).toHaveBeenCalledTimes(2);
    });

    it('retries client setup after initialization fails during a network toggle', async () => {
      const { infoClient } = useStrategyClients();
      mockClientService.initialize
        .mockRejectedValueOnce(new Error('initialization failed'))
        .mockResolvedValueOnce(undefined);

      expect(await provider.toggleTestnet()).toMatchObject({
        success: false,
        error: 'initialization failed',
      });
      expect(
        await provider.getOrderCapabilities({ symbol: 'ETH' }),
      ).toMatchObject({
        status: 'ready',
        providerId: 'hyperliquid',
      });
      expect(mockClientService.initialize).toHaveBeenCalledTimes(2);
      expect(infoClient.meta).toHaveBeenCalledTimes(1);
    });

    it('keeps the current network eligible when disconnect fails during a network toggle', async () => {
      const { infoClient } = useStrategyClients();
      mockClientService.disconnect.mockRejectedValueOnce(
        new Error('disconnect failed'),
      );

      expect(await provider.toggleTestnet()).toStrictEqual({
        success: false,
        isTestnet: false,
        error: 'disconnect failed',
      });
      expect(mockClientService.setTestnetMode).not.toHaveBeenCalled();
      expect(mockWalletService.setTestnetMode).not.toHaveBeenCalled();
      expect(
        await provider.getOrderCapabilities({ symbol: 'ETH' }),
      ).toStrictEqual({
        status: 'ready',
        providerId: 'hyperliquid',
        supportedStrategies: ['twap', 'scale', 'chase'],
        positionTpsl: {
          supportsExpectedPosition: true,
          childOrderIds: 'request-correlated',
          takeProfitOrderType: 'take_profit_limit',
          stopLossOrderType: 'stop_market',
          defaultCoverage: 'dynamic-position',
          partialCoverage: {
            single: true,
            pair: 'independent',
            replacement: 'cancel-before-create',
            recovery: 'provider-default',
          },
        },
        supportedTriggerOrderTypes: [
          'stop_market',
          'stop_limit',
          'take_profit_market',
          'take_profit_limit',
        ],
        supportedMarginModes: ['isolated', 'cross'],
      });
      expect(infoClient.meta).toHaveBeenCalledTimes(1);
    });

    it('does not cache capability metadata that resolves after a network change', async () => {
      const requestStarted = createDeferred<void>();
      const pendingMeta = createDeferred<{
        universe: { name: string; szDecimals: number; maxLeverage: number }[];
      }>();
      const meta = vi
        .fn()
        .mockImplementationOnce(() => {
          requestStarted.resolve();
          return pendingMeta.promise;
        })
        .mockResolvedValueOnce({
          universe: [{ name: 'BTC', szDecimals: 5, maxLeverage: 40 }],
        });
      const { infoClient } = useStrategyClients({ info: { meta } });

      const staleCapabilities = provider.getOrderCapabilities({
        symbol: 'ETH',
      });
      await requestStarted.promise;
      await provider.toggleTestnet();
      pendingMeta.resolve({
        universe: [{ name: 'ETH', szDecimals: 4, maxLeverage: 50 }],
      });

      expect(await staleCapabilities).toStrictEqual({
        status: 'unavailable',
        providerId: 'hyperliquid',
        reason: 'provider_unavailable',
      });
      expect(
        await provider.getOrderCapabilities({ symbol: 'BTC' }),
      ).toMatchObject({ status: 'ready' });
      expect(infoClient.meta).toHaveBeenCalledTimes(2);
    });

    it('reports unavailable when market metadata cannot be loaded', async () => {
      useStrategyClients({
        info: { meta: vi.fn().mockRejectedValue(new Error('offline')) },
      });
      const coldProvider = createTestProvider();

      expect(
        await coldProvider.getOrderCapabilities({ symbol: 'ETH' }),
      ).toStrictEqual({
        status: 'unavailable',
        providerId: 'hyperliquid',
        reason: 'provider_unavailable',
      });
    });
  });

  describe('Scale price ladder preview', () => {
    const params = {
      symbol: 'BTC',
      minPrice: 1234.567,
      maxPrice: 1234.767,
      count: 3,
    };

    it('leaves optional sizing absent while preserving normalized prices', async () => {
      useStrategyClients();

      const result = await provider.getScalePriceLadder({
        ...params,
        sizing: { usdAmount: '60' },
      });

      expect(result).toStrictEqual({
        status: 'ready',
        providerId: 'hyperliquid',
        prices: ['1234.6', '1234.7', '1234.8'],
      });
    });

    it('normalizes every rung with provider-owned market precision', async () => {
      const { infoClient } = useStrategyClients();

      expect(await provider.getScalePriceLadder(params)).toStrictEqual({
        status: 'ready',
        providerId: 'hyperliquid',
        prices: ['1234.6', '1234.7', '1234.8'],
      });
      expect(infoClient.meta).toHaveBeenCalledTimes(1);
    });

    it('rejects rungs that collapse to duplicate provider prices', async () => {
      useStrategyClients();

      await expect(
        provider.getScalePriceLadder({
          ...params,
          minPrice: 100.123456,
          maxPrice: 100.123457,
        }),
      ).rejects.toThrow(PERPS_ERROR_CODES.ORDER_SCALE_RANGE_INVALID);
    });

    it('reports a route owned by another provider', async () => {
      const { infoClient } = useStrategyClients();

      expect(
        await provider.getScalePriceLadder({
          ...params,
          providerId: 'lighter',
        }),
      ).toStrictEqual({
        status: 'unavailable',
        providerId: 'hyperliquid',
        reason: 'provider_not_routable',
      });
      expect(infoClient.meta).not.toHaveBeenCalled();
    });

    it('reports an unknown market', async () => {
      useStrategyClients();

      expect(
        await provider.getScalePriceLadder({ ...params, symbol: 'DOGE' }),
      ).toStrictEqual({
        status: 'unavailable',
        providerId: 'hyperliquid',
        reason: 'market_not_found',
      });
    });
  });

  describe('Network-scoped fee cache', () => {
    const mainnetFees = {
      userCrossRate: '0.00030',
      userAddRate: '0.00010',
      userSpotCrossRate: '0.00040',
      userSpotAddRate: '0.00020',
      activeReferralDiscount: '0',
      dailyUserVlm: [],
    };
    const testnetFees = {
      ...mainnetFees,
      userCrossRate: '0.00060',
      userAddRate: '0.00020',
    };

    it('clears cached user fee rates when the network changes', async () => {
      const userFees = vi
        .fn()
        .mockResolvedValueOnce(mainnetFees)
        .mockResolvedValueOnce(testnetFees);
      const { infoClient } = useStrategyClients({ info: { userFees } });
      const params = {
        orderType: 'market' as const,
        amount: '1000',
        symbol: 'ETH',
      };

      expect((await provider.calculateFees(params)).protocolFeeRate).toBe(
        0.0003,
      );
      await provider.toggleTestnet();

      expect((await provider.calculateFees(params)).protocolFeeRate).toBe(
        0.0006,
      );
      expect(infoClient.userFees).toHaveBeenCalledTimes(2);
    });

    it('does not cache user fee rates that resolve after a network change', async () => {
      const requestStarted = createDeferred<void>();
      const pendingUserFees = createDeferred<typeof mainnetFees>();
      const userFees = vi
        .fn()
        .mockImplementationOnce(() => {
          requestStarted.resolve();
          return pendingUserFees.promise;
        })
        .mockResolvedValueOnce(testnetFees);
      const { infoClient } = useStrategyClients({ info: { userFees } });
      const params = {
        orderType: 'market' as const,
        amount: '1000',
        symbol: 'ETH',
      };

      const staleFees = provider.calculateFees(params);
      await requestStarted.promise;
      await provider.toggleTestnet();
      pendingUserFees.resolve(mainnetFees);
      await expect(staleFees).rejects.toThrow(
        PERPS_ERROR_CODES.PROVIDER_LIFECYCLE_STALE,
      );

      expect((await provider.calculateFees(params)).protocolFeeRate).toBe(
        0.0006,
      );
      expect(infoClient.userFees).toHaveBeenCalledTimes(2);
    });

    it('does not cache Perp DEX metadata that resolves after a network change', async () => {
      const requestStarted = createDeferred<void>();
      const pendingPerpDexs =
        createDeferred<(null | { name: string; deployerFeeScale: string })[]>();
      const { infoClient } = useStrategyClients({
        info: {
          perpDexs: vi
            .fn()
            .mockImplementationOnce(() => {
              requestStarted.resolve();
              return pendingPerpDexs.promise;
            })
            .mockResolvedValueOnce([
              null,
              { name: 'xyz', deployerFeeScale: '1' },
            ]),
          meta: vi.fn().mockResolvedValue({
            universe: [{ name: 'xyz:TSLA', szDecimals: 3, maxLeverage: 20 }],
          }),
        },
      });
      provider = createTestProvider({
        hip3Enabled: true,
        allowlistMarkets: ['xyz:*'],
      });
      const params = {
        orderType: 'market' as const,
        amount: '1000',
        symbol: 'xyz:TSLA',
      };

      const staleFees = provider.calculateFees(params);
      await requestStarted.promise;
      await provider.toggleTestnet();
      pendingPerpDexs.resolve([null, { name: 'xyz', deployerFeeScale: '0.5' }]);

      await expect(staleFees).rejects.toThrow(
        PERPS_ERROR_CODES.PROVIDER_LIFECYCLE_STALE,
      );
      expect((await provider.calculateFees(params)).protocolFeeRate).toBe(
        0.0009,
      );
      expect(infoClient.perpDexs).toHaveBeenCalledTimes(2);
    });

    it('retains confirmed builder approval that finishes after disconnect', async () => {
      let cachedBuilderFee:
        | { attempted: boolean; success: boolean }
        | undefined;
      const mockedCache = vi.mocked(TradingReadinessCache);
      mockedCache.getBuilderFee.mockImplementation(() => cachedBuilderFee);
      mockedCache.setBuilderFee.mockImplementation(
        (_network, _userAddress, status) => {
          cachedBuilderFee = status;
        },
      );
      const verificationStarted = createDeferred<void>();
      const pendingVerification = createDeferred<number>();
      const maxBuilderFee = vi
        .fn()
        .mockResolvedValueOnce(0)
        .mockImplementationOnce(() => {
          verificationStarted.resolve();
          return pendingVerification.promise;
        })
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(BUILDER_FEE_CONFIG.MaxFeeDecimal);
      const { exchangeClient } = useStrategyClients({
        info: { maxBuilderFee },
      });
      const params = {
        ...baseOrder,
        orderType: 'market',
      } satisfies OrderParams;

      const stalePlacement = provider.placeOrder(params);
      await verificationStarted.promise;
      const disconnect = provider.disconnect();
      pendingVerification.resolve(BUILDER_FEE_CONFIG.MaxFeeDecimal);
      await Promise.all([stalePlacement, disconnect]);

      expect(exchangeClient.approveBuilderFee).toHaveBeenCalledTimes(1);

      await provider.initialize();
      await provider.placeOrder(params);

      expect(exchangeClient.approveBuilderFee).toHaveBeenCalledTimes(1);
    });

    it('does not share pending builder setup across accounts', async () => {
      const firstAccount = '0x1234567890123456789012345678901234567890';
      const secondAccount = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';
      let selectedAccount = firstAccount;
      mockWalletService.getUserAddressWithDefault.mockImplementation(() =>
        Promise.resolve(selectedAccount),
      );

      const firstApprovalStarted = createDeferred<void>();
      const pendingFirstApproval = createDeferred<number>();
      const maxBuilderFee = vi
        .fn()
        .mockImplementationOnce(() => {
          firstApprovalStarted.resolve();
          return pendingFirstApproval.promise;
        })
        .mockResolvedValue(BUILDER_FEE_CONFIG.MaxFeeDecimal);
      useStrategyClients({ info: { maxBuilderFee } });
      const params = {
        ...baseOrder,
        orderType: 'market' as const,
      };

      const firstPlacement = provider.placeOrder(params);
      await firstApprovalStarted.promise;
      selectedAccount = secondAccount;
      const secondPlacement = provider.placeOrder(params);
      await new Promise<void>((resolve) => setImmediate(resolve));
      const approvalChecksBeforeFirstResolved = maxBuilderFee.mock.calls.length;

      pendingFirstApproval.resolve(BUILDER_FEE_CONFIG.MaxFeeDecimal);
      await Promise.all([firstPlacement, secondPlacement]);

      expect(approvalChecksBeforeFirstResolved).toBe(2);
      expect(maxBuilderFee).toHaveBeenNthCalledWith(1, {
        user: firstAccount,
        builder: BUILDER_FEE_CONFIG.MainnetBuilder,
      });
      expect(maxBuilderFee).toHaveBeenNthCalledWith(2, {
        user: secondAccount,
        builder: BUILDER_FEE_CONFIG.MainnetBuilder,
      });
    });
  });

  describe('Strategy notional minimums', () => {
    // validateOrder owns the minimums it can decide without the asset's size
    // grid — the TWAP total and the ordinary per-order minimum. A scale
    // ladder's rungs depend on that grid, so they are checked in the placement
    // path instead; see "Scale ladder is validated before anything is signed".
    it("rejects a TWAP below the venue's minimum total", async () => {
      useStrategyClients();

      const result = await provider.validateOrder({
        ...baseOrder,
        usdAmount: String(HYPERLIQUID_TWAP_LIMITS.MinNotionalUsd - 1),
        orderType: 'twap',
        twapDuration: 30,
      } satisfies OrderParams);

      expect(result).toStrictEqual({
        isValid: false,
        error: PERPS_ERROR_CODES.ORDER_TWAP_NOTIONAL_TOO_SMALL,
      });
    });

    it("accepts a TWAP at the venue's minimum total", async () => {
      useStrategyClients();

      const result = await provider.validateOrder({
        ...baseOrder,
        usdAmount: String(HYPERLIQUID_TWAP_LIMITS.MinNotionalUsd),
        orderType: 'twap',
        twapDuration: 30,
      } satisfies OrderParams);

      expect(result).toStrictEqual({ isValid: true });
    });

    it('never reaches the exchange for an under-funded ladder', async () => {
      const { exchangeClient } = useStrategyClients();

      const result = await provider.placeOrder({
        ...baseOrder,
        usdAmount: '50',
        orderType: 'scale',
        scaleMinPrice: '2000',
        scaleMaxPrice: '3000',
        scaleNumOrders: 20,
      } satisfies OrderParams);

      expect(result.success).toBe(false);
      expect(result.error).toBe(
        PERPS_ERROR_CODES.ORDER_SCALE_NOTIONAL_TOO_SMALL,
      );
      expect(exchangeClient.order).not.toHaveBeenCalled();
    });

    // A ladder whose average rung clears the minimum can still carry a rung
    // that does not once the skew has weighted it.
    it('never reaches the exchange when a skew starves the cheapest rung', async () => {
      const { exchangeClient } = useStrategyClients();

      const result = await provider.placeOrder({
        ...baseOrder,
        usdAmount: '100',
        orderType: 'scale',
        scaleMinPrice: '2000',
        scaleMaxPrice: '3000',
        scaleNumOrders: 5,
        scaleSkew: 20,
      } satisfies OrderParams);

      expect(result.success).toBe(false);
      expect(result.error).toBe(
        PERPS_ERROR_CODES.ORDER_SCALE_NOTIONAL_TOO_SMALL,
      );
      expect(exchangeClient.order).not.toHaveBeenCalled();
    });

    it('accepts the same ladder without the skew', async () => {
      const { exchangeClient } = useStrategyClients({
        exchange: {
          order: vi.fn().mockResolvedValue({
            status: 'ok',
            response: {
              data: {
                statuses: [
                  { resting: { oid: 11 } },
                  { resting: { oid: 22 } },
                  { resting: { oid: 33 } },
                  { resting: { oid: 44 } },
                  { resting: { oid: 55 } },
                ],
              },
            },
          }),
        },
      });

      const result = await provider.placeOrder({
        ...baseOrder,
        usdAmount: '100',
        orderType: 'scale',
        scaleMinPrice: '2000',
        scaleMaxPrice: '3000',
        scaleNumOrders: 5,
      } satisfies OrderParams);

      expect(result.success).toBe(true);
      expect(exchangeClient.order).toHaveBeenCalledTimes(1);
    });

    it('never reaches the exchange for an invalid skew', async () => {
      const { exchangeClient } = useStrategyClients();

      const result = await provider.placeOrder({
        ...baseOrder,
        orderType: 'scale',
        scaleMinPrice: '2000',
        scaleMaxPrice: '3000',
        scaleNumOrders: 3,
        scaleSkew: 0,
      } satisfies OrderParams);

      expect(result.success).toBe(false);
      expect(result.error).toBe(PERPS_ERROR_CODES.ORDER_SCALE_RANGE_INVALID);
      expect(exchangeClient.order).not.toHaveBeenCalled();
    });

    it('leaves a chase on the ordinary per-order minimum', async () => {
      useStrategyClients();

      const result = await provider.validateOrder({
        ...baseOrder,
        usdAmount: '20',
        orderType: 'chase',
      } satisfies OrderParams);

      expect(result).toStrictEqual({ isValid: true });
    });
  });

  describe('Chase tick failures', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    const rested = (oid: number): Record<string, unknown> => ({
      status: 'ok',
      response: { data: { statuses: [{ resting: { oid } }] } },
    });

    const bookAt = (bid: string): Record<string, unknown> => ({
      coin: 'ETH',
      levels: [[{ px: bid, sz: '10', n: 1 }], [{ px: '3001', sz: '10', n: 1 }]],
    });

    it('keeps chasing when a book read fails, leaving the order resting', async () => {
      const order = vi.fn().mockResolvedValue(rested(55));
      const l2Book = vi
        .fn()
        .mockResolvedValueOnce(bookAt('2999'))
        .mockRejectedValueOnce(new Error('network blip'))
        .mockResolvedValue(bookAt('2998'));
      const { exchangeClient } = useStrategyClients({
        exchange: { order },
        info: { l2Book },
      });

      const placed = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
      } satisfies OrderParams);

      // Tick 1 throws on the book read; tick 2 must still happen and re-price.
      await vi.advanceTimersByTimeAsync(2000);

      expect(order).toHaveBeenCalledTimes(2);
      expect(exchangeClient.cancel).toHaveBeenCalledWith({
        cancels: [{ a: 1, o: 55 }],
      });

      // The session survived the transient failure, so its handle still works.
      const cancelled = await provider.cancelOrder({
        orderId: placed.orderId,
        symbol: 'ETH',
        orderType: 'chase',
      });
      expect(cancelled.success).toBe(true);
    });

    it('ends the session cleanly when the replacement fails to rest', async () => {
      // The old order is cancelled and the re-place throws: nothing is on the
      // book, so the session must not keep claiming to hold a resting order.
      const order = vi
        .fn()
        .mockResolvedValueOnce(rested(55))
        .mockRejectedValue(new Error('insufficient margin'));
      const l2Book = vi
        .fn()
        .mockResolvedValueOnce(bookAt('2999'))
        .mockResolvedValue(bookAt('2998'));
      const { exchangeClient } = useStrategyClients({
        exchange: { order },
        info: { l2Book },
      });

      const placed = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
      } satisfies OrderParams);

      await vi.advanceTimersByTimeAsync(5000);

      // Two attempts: the original placement and the failed replacement. No
      // further ticks ran, so the session stopped rather than looping.
      expect(order).toHaveBeenCalledTimes(2);

      // Cancelling reports success and releases the handle, because there is
      // genuinely nothing left resting — it does not report an incomplete
      // cancel forever against the dead order id.
      const first = await provider.cancelOrder({
        orderId: placed.orderId,
        symbol: 'ETH',
        orderType: 'chase',
      });
      expect(first).toStrictEqual({
        success: true,
        orderId: placed.orderId,
      });
      expect(exchangeClient.cancel).toHaveBeenCalledTimes(1);

      // The handle is released, so a second cancel finds nothing.
      const second = await provider.cancelOrder({
        orderId: placed.orderId,
        symbol: 'ETH',
        orderType: 'chase',
      });
      expect(second).toStrictEqual({ success: true, orderId: placed.orderId });
    });
  });

  describe('A cancel refused because the order already left the book', () => {
    // HyperLiquid answers a cancel it cannot match with this message. It is a
    // rejection of the request but a confirmation of what the caller wanted.
    const alreadyGone = {
      status: 'ok',
      response: {
        data: {
          statuses: [
            { error: 'Order was never placed, already canceled, or filled.' },
          ],
        },
      },
    };

    it('completes a chase cancel whose child had already filled', async () => {
      useStrategyClients({
        exchange: {
          order: vi.fn().mockResolvedValue({
            status: 'ok',
            response: { data: { statuses: [{ resting: { oid: 55 } }] } },
          }),
          cancel: vi.fn().mockResolvedValue(alreadyGone),
        },
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

      // Nothing of the chase rests, so the cancel succeeded and the handle is
      // released rather than pinned open on a filled order forever.
      expect(result).toStrictEqual({ success: true, orderId: placed.orderId });

      const second = await provider.cancelOrder({
        orderId: placed.orderId,
        symbol: 'ETH',
        orderType: 'chase',
      });
      expect(second).toStrictEqual({ success: true, orderId: placed.orderId });
    });

    it('completes a chase cancel when the SDK throws that its child is gone', async () => {
      useStrategyClients({
        exchange: {
          order: vi.fn().mockResolvedValue({
            status: 'ok',
            response: { data: { statuses: [{ resting: { oid: 55 } }] } },
          }),
          cancel: vi
            .fn()
            .mockRejectedValue(
              new Error('Order was never placed, already canceled, or filled.'),
            ),
        },
      });
      const placed = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
      });

      const result = await provider.cancelOrder({
        orderId: placed.orderId,
        symbol: 'ETH',
        orderType: 'chase',
      });

      expect(result).toStrictEqual({ success: true, orderId: placed.orderId });
      expect(await provider.getChaseOrders()).toStrictEqual([]);
    });

    it('completes a scale cancel when one rung had already filled', async () => {
      useStrategyClients({
        exchange: {
          order: vi.fn().mockResolvedValue({
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
          }),
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
                  'success',
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
        orderId: placed.orderId,
        symbol: 'ETH',
        orderType: 'scale',
      });

      expect(result).toStrictEqual({ success: true, orderId: placed.orderId });

      const second = await provider.cancelOrder({
        orderId: placed.orderId,
        symbol: 'ETH',
        orderType: 'scale',
      });
      expect(second.error).toBe(
        PERPS_ERROR_CODES.ORDER_STRATEGY_HANDLE_UNKNOWN,
      );
    });

    it.each([
      [
        'a non-ok response',
        {
          status: 'err',
          response: {
            data: { statuses: ['success', 'success', 'success'] },
          },
        },
      ],
      [
        'a truncated response',
        {
          status: 'ok',
          response: { data: { statuses: ['success'] } },
        },
      ],
    ])('retains every scale child after %s', async (_label, failedCancel) => {
      const cancel = vi
        .fn()
        .mockResolvedValueOnce(failedCancel)
        .mockResolvedValueOnce({
          status: 'ok',
          response: {
            data: { statuses: ['success', 'success', 'success'] },
          },
        });
      useStrategyClients({
        exchange: {
          order: vi.fn().mockResolvedValue({
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

      const first = await provider.cancelOrder({
        orderId: placed.orderId,
        symbol: 'ETH',
        orderType: 'scale',
      });
      const second = await provider.cancelOrder({
        orderId: placed.orderId,
        symbol: 'ETH',
        orderType: 'scale',
      });

      expect(first.error).toBe(
        PERPS_ERROR_CODES.ORDER_STRATEGY_CANCEL_INCOMPLETE,
      );
      expect(second).toStrictEqual({
        success: true,
        orderId: placed.orderId,
      });
      expect(cancel).toHaveBeenNthCalledWith(2, {
        cancels: [
          { a: 1, o: 11 },
          { a: 1, o: 22 },
          { a: 1, o: 33 },
        ],
      });
    });

    it('still reports a genuinely refused cancel as incomplete', async () => {
      useStrategyClients({
        exchange: {
          order: vi.fn().mockResolvedValue({
            status: 'ok',
            response: { data: { statuses: [{ resting: { oid: 55 } }] } },
          }),
          cancel: vi.fn().mockResolvedValue({
            status: 'ok',
            response: { data: { statuses: [{ error: 'cancel refused' }] } },
          }),
        },
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

      // The order is still on the book, so the handle must survive for a retry.
      expect(result.error).toBe(
        PERPS_ERROR_CODES.ORDER_STRATEGY_CANCEL_INCOMPLETE,
      );
    });
  });

  describe('Chase reprice when the exchange refuses the cancel', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('leaves the old order alone and retries on the next tick', async () => {
      const order = vi.fn().mockResolvedValue({
        status: 'ok',
        response: { data: { statuses: [{ resting: { oid: 55 } }] } },
      });
      const cancel = vi
        .fn()
        .mockResolvedValueOnce({
          status: 'ok',
          response: { data: { statuses: [{ error: 'cancel refused' }] } },
        })
        .mockResolvedValue({
          status: 'ok',
          response: { data: { statuses: ['success'] } },
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

      await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
      } satisfies OrderParams);

      // Tick 1's cancel is refused, so no replacement may be placed — doing so
      // would double the position while the old order still rests.
      await vi.advanceTimersByTimeAsync(1000);
      expect(order).toHaveBeenCalledTimes(1);

      // Tick 2 retries and succeeds, so the chase resumes rather than ending.
      await vi.advanceTimersByTimeAsync(1000);
      expect(order).toHaveBeenCalledTimes(2);
    });
  });

  describe('editOrder rejects strategy placements', () => {
    it.each(['twap', 'scale', 'chase'] as OrderType[])(
      'refuses to modify an order into a %s',
      async (orderType) => {
        const { exchangeClient } = useStrategyClients();

        const result = await provider.editOrder({
          orderId: '123',
          newOrder: { ...baseOrder, orderType } satisfies OrderParams,
        });

        expect(result).toStrictEqual({
          success: false,
          error: PERPS_ERROR_CODES.ORDER_EDIT_STRATEGY_UNSUPPORTED,
        });
        expect(exchangeClient.modify).not.toHaveBeenCalled();
      },
    );
  });

  describe('Scale ladder is validated before anything is signed', () => {
    /**
     * Place a scale order and report what the exchange client saw.
     *
     * @param order - Scale-specific order params.
     * @returns The placement result and the mock exchange client.
     */
    const placeLadder = async (
      order: Record<string, unknown>,
    ): Promise<{ result: OrderResult; exchangeClient: MockClient }> => {
      const { exchangeClient } = useStrategyClients();

      const result = await provider.placeOrder({
        ...baseOrder,
        orderType: 'scale',
        ...order,
      } satisfies OrderParams);

      return { result, exchangeClient };
    };

    it('rejects a range whose rungs collapse onto the same venue price', async () => {
      // ETH has 4 size decimals, so prices carry two. 3000.001 and 3000.002
      // both format to 3000, which would stack the ladder at one price instead
      // of spreading it.
      const { result, exchangeClient } = await placeLadder({
        scaleMinPrice: '3000.001',
        scaleMaxPrice: '3000.002',
        scaleNumOrders: 2,
      });

      expect(result.error).toBe(PERPS_ERROR_CODES.ORDER_SCALE_RANGE_INVALID);
      // No leverage change and no order: an invalid ladder must not cost a
      // signing prompt or a venue side effect first.
      expect(exchangeClient.updateLeverage).not.toHaveBeenCalled();
      expect(exchangeClient.order).not.toHaveBeenCalled();
    });

    it('rejects a total that cannot give every rung a whole size unit', async () => {
      // BTC has 3 size decimals, so one size unit is 0.001 BTC — about $50
      // here. A 0.019 BTC total is nineteen units to spread over twenty rungs:
      // every rung is worth far more than the $10 minimum, so this is reached
      // only by the grid check, not by the notional one.
      const { result, exchangeClient } = await placeLadder({
        symbol: 'BTC',
        currentPrice: 50000,
        size: '0.019',
        usdAmount: '950',
        scaleMinPrice: '40000',
        scaleMaxPrice: '60000',
        scaleNumOrders: 20,
      });

      expect(result.error).toBe(PERPS_ERROR_CODES.ORDER_SCALE_SIZE_TOO_SMALL);
      expect(exchangeClient.updateLeverage).not.toHaveBeenCalled();
      expect(exchangeClient.order).not.toHaveBeenCalled();
    });

    it('rejects a ladder whose rungs fall below the per-order minimum', async () => {
      // $50 over 20 rungs is twenty $2.50 orders; the venue rejects every one.
      const { result, exchangeClient } = await placeLadder({
        usdAmount: '50',
        scaleMinPrice: '2000',
        scaleMaxPrice: '3000',
        scaleNumOrders: 20,
      });

      expect(result.error).toBe(
        PERPS_ERROR_CODES.ORDER_SCALE_NOTIONAL_TOO_SMALL,
      );
      expect(exchangeClient.order).not.toHaveBeenCalled();
    });

    it('rejects on the real grid slice, not the average one', async () => {
      // 0.0039 ETH over 20 rungs averages 1.95 size units, but the grid split
      // floors that to 1 unit on nineteen of them and puts the remainder on the
      // first. At the 60000 rung the average slice is worth $11.70 — over the
      // $10 minimum — while the slice actually submitted is worth $6. Only a
      // check against the real grid sizes catches this.
      const { result, exchangeClient } = await placeLadder({
        size: '0.0039',
        usdAmount: '11.70',
        scaleMinPrice: '60000',
        scaleMaxPrice: '70000',
        scaleNumOrders: 20,
      });

      expect(result.error).toBe(
        PERPS_ERROR_CODES.ORDER_SCALE_NOTIONAL_TOO_SMALL,
      );
      expect(exchangeClient.updateLeverage).not.toHaveBeenCalled();
      expect(exchangeClient.order).not.toHaveBeenCalled();
    });

    it('submits exactly the ladder it validated', async () => {
      const order = vi.fn().mockResolvedValue({
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
      });
      const { exchangeClient } = useStrategyClients({ exchange: { order } });

      await provider.placeOrder({
        ...baseOrder,
        orderType: 'scale',
        scaleMinPrice: '2000',
        scaleMaxPrice: '3000',
        scaleNumOrders: 3,
      } satisfies OrderParams);

      const submitted = exchangeClient.order.mock.calls[0][0];
      expect(
        submitted.orders.map((entry: { p: string }) => entry.p),
      ).toStrictEqual(['2000', '2500', '3000']);
      expect(
        submitted.orders.map((entry: { s: string }) => entry.s),
      ).toStrictEqual(['0.3334', '0.3333', '0.3333']);
    });
  });

  describe('Chase replacements keep the fee they were quoted at', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('reuses the placement-time builder fee after the discount is cleared', async () => {
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

      useStrategyClients({
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

      // The rewards discount is live only around the caller's placeOrder.
      provider.setUserFeeDiscount(5000);
      await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
      } satisfies OrderParams);
      const quotedFee = order.mock.calls[0][0].builder.f;

      // TradingService clears it as soon as placeOrder returns, which for a
      // chase is long before the re-pricing loop runs.
      provider.setUserFeeDiscount(undefined);
      await vi.advanceTimersByTimeAsync(1000);

      expect(order).toHaveBeenCalledTimes(2);
      expect(order.mock.calls[1][0].builder.f).toBe(quotedFee);
    });

    it('marks the replacement cloid after the subscription context is cleared', async () => {
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

      useStrategyClients({
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

      provider.setUserFeeResolution({
        feeBips: 0,
        discountBips: 10000,
        source: 'subscription',
        subscription: { eligible: true, reason: 'eligible' },
        subscriptionWaiverKind: 'full',
      });
      await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
      } satisfies OrderParams);
      expect(
        hasFeeReductionAppliedFlag(order.mock.calls[0][0].orders[0].c),
      ).toBe(true);

      // TradingService clears the resolution as soon as placeOrder returns,
      // long before the chase re-prices. The replacement still pays the
      // discounted fee, so it must still carry the attribution.
      provider.setUserFeeResolution(undefined);
      await vi.advanceTimersByTimeAsync(1000);

      expect(order).toHaveBeenCalledTimes(2);
      expect(
        hasFeeReductionAppliedFlag(order.mock.calls[1][0].orders[0].c),
      ).toBe(true);
    });
  });

  describe('Chase re-prices only what is still resting', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    /**
     * Build an l2Book mock whose touch moves after the first read.
     *
     * @returns The mock.
     */
    const bookThatMoves = (): Mock =>
      vi
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

    it('reads the remainder after the cancel, not before it', async () => {
      const order = vi.fn().mockResolvedValue({
        status: 'ok',
        response: { data: { statuses: [{ resting: { oid: 55 } }] } },
      });
      const callOrder: string[] = [];
      const cancel = vi.fn().mockImplementation(async () => {
        callOrder.push('cancel');
        return { status: 'ok', response: { data: { statuses: ['success'] } } };
      });
      const orderStatus = vi.fn().mockImplementation(async () => {
        callOrder.push('orderStatus');
        return {
          status: 'order',
          order: {
            status: callOrder.includes('cancel') ? 'canceled' : 'open',
            order: {
              coin: 'ETH',
              side: 'B',
              limitPx: '2999',
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
        };
      });

      useStrategyClients({
        exchange: { order, cancel },
        info: { l2Book: bookThatMoves(), orderStatus },
      });

      await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
      } satisfies OrderParams);

      await vi.advanceTimersByTimeAsync(1000);

      // Once the cancel has landed no further fills can reach the order, so the
      // remainder it reports is final. Reading first would leave a window in
      // which a fill lands and is then re-placed on top. A liveness read may
      // precede the cancel — what matters is that a read follows it.
      expect(callOrder.slice(callOrder.indexOf('cancel'))).toStrictEqual([
        'cancel',
        'orderStatus',
      ]);
    });

    it('replaces a partly filled order at its remaining size', async () => {
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

      useStrategyClients({
        exchange: { order },
        info: {
          l2Book: bookThatMoves(),
          // 0.6 of the 1 ETH had filled by the time the cancel landed.
          orderStatus: vi
            .fn()
            .mockResolvedValueOnce({
              status: 'order',
              order: {
                status: 'open',
                order: {
                  coin: 'ETH',
                  side: 'B',
                  limitPx: '2999',
                  sz: '1',
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
            })
            .mockResolvedValue({
              status: 'order',
              order: {
                status: 'canceled',
                order: {
                  coin: 'ETH',
                  side: 'B',
                  limitPx: '2999',
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
            }),
        },
      });

      await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
      } satisfies OrderParams);
      expect(order.mock.calls[0][0].orders[0].s).toBe('1');

      await vi.advanceTimersByTimeAsync(1000);

      // The replacement must cover only what was left. Re-placing the original
      // size would buy 1.6 ETH in total against a 1 ETH request.
      expect(order).toHaveBeenCalledTimes(2);
      expect(order.mock.calls[1][0].orders[0].s).toBe('0.4');
    });

    it('reports no remainder when the canceled child filled during repricing', async () => {
      const order = vi.fn().mockResolvedValue({
        status: 'ok',
        response: { data: { statuses: [{ resting: { oid: 55 } }] } },
      });
      useStrategyClients({
        exchange: { order },
        info: {
          l2Book: bookThatMoves(),
          orderStatus: vi
            .fn()
            .mockResolvedValueOnce({
              status: 'order',
              order: {
                status: 'open',
                order: {
                  coin: 'ETH',
                  side: 'B',
                  limitPx: '2999',
                  sz: '1',
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
            })
            .mockResolvedValue({
              status: 'order',
              order: {
                status: 'filled',
                order: {
                  coin: 'ETH',
                  side: 'B',
                  limitPx: '2999',
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
            }),
        },
      });

      const placed = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
      } satisfies OrderParams);

      await vi.advanceTimersByTimeAsync(1000);

      expect(await provider.getChaseOrders()).toContainEqual(
        expect.objectContaining({
          handle: placed.orderId,
          remainingSize: '0',
          restingOrderId: null,
          status: CHASE_ORDER_STATUS.Filled,
        }),
      );
      expect(order).toHaveBeenCalledTimes(1);
    });

    it('ends the session without cancelling when the order already filled', async () => {
      const order = vi.fn().mockResolvedValue({
        status: 'ok',
        response: { data: { statuses: [{ resting: { oid: 55 } }] } },
      });
      const { exchangeClient } = useStrategyClients({
        exchange: { order },
        info: {
          l2Book: bookThatMoves(),
          // The order had already filled in full.
          orderStatus: vi.fn().mockResolvedValue({
            status: 'order',
            order: {
              status: 'filled',
              order: {
                coin: 'ETH',
                side: 'B',
                limitPx: '2999',
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
          }),
        },
      });

      const placed = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
      } satisfies OrderParams);

      await vi.advanceTimersByTimeAsync(5000);

      // The order's level is gone from the book, so the tick verifies it rather
      // than assuming, finds it filled, and ends the session — releasing its
      // slot against the concurrency cap without spending a cancel on an order
      // that no longer exists.
      expect(order).toHaveBeenCalledTimes(1);
      expect(exchangeClient.cancel).not.toHaveBeenCalled();

      const result = await provider.cancelOrder({
        orderId: placed.orderId,
        symbol: 'ETH',
        orderType: 'chase',
      });
      expect(result).toStrictEqual({ success: true, orderId: placed.orderId });
    });

    it('retries on the next tick when the resting child is briefly unknown', async () => {
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
      const { exchangeClient, infoClient } = useStrategyClients({
        exchange: { order },
        info: { l2Book: bookThatMoves() },
      });
      infoClient.orderStatus
        .mockResolvedValueOnce({ status: 'unknownOid' })
        .mockResolvedValueOnce({ status: 'unknownOid' })
        .mockResolvedValueOnce({ status: 'unknownOid' });

      const placed = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
      } satisfies OrderParams);

      await vi.advanceTimersByTimeAsync(1200);

      expect(infoClient.orderStatus).toHaveBeenCalledTimes(3);
      expect(exchangeClient.cancel).not.toHaveBeenCalled();
      expect(order).toHaveBeenCalledTimes(1);
      expect(await provider.getChaseOrders()).toContainEqual(
        expect.objectContaining({
          restingOrderId: '55',
          status: CHASE_ORDER_STATUS.Active,
        }),
      );

      await vi.advanceTimersByTimeAsync(1000);

      expect(order).toHaveBeenCalledTimes(2);
      expect(exchangeClient.cancel).toHaveBeenCalledWith({
        cancels: [{ a: 1, o: 55 }],
      });

      expect(
        await provider.cancelOrder({
          orderId: placed.orderId,
          symbol: 'ETH',
          orderType: 'chase',
        }),
      ).toStrictEqual({
        success: true,
        orderId: placed.orderId,
      });
      expect(exchangeClient.cancel).toHaveBeenCalledWith({
        cancels: [{ a: 1, o: 66 }],
      });
    });
  });

  describe('Strategy notional is checked against the submitted size', () => {
    it('rejects a TWAP whose size-grid rounding drops it under the venue minimum', async () => {
      const { exchangeClient } = useStrategyClients();

      // A reduce-only order may never round up — the venue rejects a close
      // larger than the position — so its size is floored onto the grid. $100.10
      // of ETH at 3000 floors to 0.0333, which is $99.90: under the venue's $100
      // TWAP minimum, even though the requested notional cleared it. Only a
      // check against the size actually being submitted catches this.
      const result = await provider.placeOrder({
        ...baseOrder,
        size: '0.0334',
        usdAmount: '100.10',
        reduceOnly: true,
        orderType: 'twap',
        twapDuration: 30,
      } satisfies OrderParams);

      expect(result.success).toBe(false);
      expect(result.error).toBe(
        PERPS_ERROR_CODES.ORDER_TWAP_NOTIONAL_TOO_SMALL,
      );
      expect(exchangeClient.twapOrder).not.toHaveBeenCalled();
    });
  });

  describe('Chase pricing against the book', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    /**
     * A book with the given bid levels and a fixed ask.
     *
     * @param bids - Bid levels, best first.
     * @returns The l2Book payload.
     */
    const bookWithBids = (
      bids: { px: string; sz: string }[],
    ): Record<string, unknown> => ({
      coin: 'ETH',
      levels: [
        bids.map((level) => ({ ...level, n: 1 })),
        [{ px: '3005', sz: '10', n: 1 }],
      ],
    });

    it('joins the touch when the spread is a single tick', async () => {
      const order = vi.fn().mockResolvedValue({
        status: 'ok',
        response: { data: { statuses: [{ resting: { oid: 55 } }] } },
      });
      useStrategyClients({
        exchange: { order },
        info: {
          l2Book: vi.fn().mockResolvedValue({
            coin: 'ETH',
            levels: [
              [{ px: '2999.9', sz: '10', n: 1 }],
              [{ px: '3000', sz: '10', n: 1 }],
            ],
          }),
        },
      });

      await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
      } satisfies OrderParams);

      // Improving would cross, which a post-only order cannot do, so it joins
      // the bid instead of resting a tick above it.
      expect(order.mock.calls[0][0].orders[0].p).toBe('2999.9');
    });

    it('re-prices when the external touch moves behind its own order', async () => {
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

      // Tick 1: the chase's own 1 ETH at 2999.1 tops the book, with a real
      // external bid of 2999 beneath it. Tick 2: that external bid drops to
      // 2990 and only the chase's own order is left at the top.
      const l2Book = vi
        .fn()
        .mockResolvedValueOnce(bookWithBids([{ px: '2999', sz: '10' }]))
        .mockResolvedValue(
          bookWithBids([
            { px: '2999.1', sz: '1' },
            { px: '2990', sz: '10' },
          ]),
        );

      useStrategyClients({
        exchange: { order },
        info: { l2Book },
      });

      await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
      } satisfies OrderParams);
      expect(order.mock.calls[0][0].orders[0].p).toBe('2999.1');

      await vi.advanceTimersByTimeAsync(1000);

      // Reading the raw book would see its own 2999.1 as the best bid, conclude
      // nothing had moved, and sit there while the market walked away. Netting
      // its own size out of that level exposes the real 2990 touch.
      expect(order).toHaveBeenCalledTimes(2);
      expect(order.mock.calls[1][0].orders[0].p).toBe('2990.1');
    });
  });

  describe('Chase concurrency cap', () => {
    it("refuses a chase beyond the venue's simultaneous limit", async () => {
      const { exchangeClient } = useStrategyClients({
        exchange: {
          order: vi.fn().mockResolvedValue({
            status: 'ok',
            response: { data: { statuses: [{ resting: { oid: 55 } }] } },
          }),
        },
      });

      for (
        let placed = 0;
        placed < CHASE_ORDER_CONFIG.MaxActiveSessions;
        placed++
      ) {
        const result = await provider.placeOrder({
          ...baseOrder,
          orderType: 'chase',
        } satisfies OrderParams);
        expect(result.success).toBe(true);
      }

      const overflow = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
      } satisfies OrderParams);

      expect(overflow.success).toBe(false);
      expect(overflow.error).toBe(PERPS_ERROR_CODES.ORDER_CHASE_LIMIT_REACHED);
      expect(exchangeClient.order).toHaveBeenCalledTimes(
        CHASE_ORDER_CONFIG.MaxActiveSessions,
      );
    });

    it('refuses an overflow chase before signing or changing leverage', async () => {
      const { exchangeClient } = useStrategyClients({
        exchange: {
          order: vi.fn().mockResolvedValue({
            status: 'ok',
            response: { data: { statuses: [{ resting: { oid: 55 } }] } },
          }),
        },
      });

      for (
        let placed = 0;
        placed < CHASE_ORDER_CONFIG.MaxActiveSessions;
        placed += 1
      ) {
        await provider.placeOrder({
          ...baseOrder,
          orderType: 'chase',
        } satisfies OrderParams);
      }
      exchangeClient.updateLeverage.mockClear();

      const overflow = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        leverage: 5,
      } satisfies OrderParams);

      // Refused before the shared preamble, which completes the signing setup
      // and applies leverage — neither should be spent on a request that was
      // always going to be turned away.
      expect(overflow.error).toBe(PERPS_ERROR_CODES.ORDER_CHASE_LIMIT_REACHED);
      expect(exchangeClient.updateLeverage).not.toHaveBeenCalled();
    });

    it('frees a slot when a chase is cancelled', async () => {
      useStrategyClients({
        exchange: {
          order: vi.fn().mockResolvedValue({
            status: 'ok',
            response: { data: { statuses: [{ resting: { oid: 55 } }] } },
          }),
        },
      });

      const placed = [];
      for (
        let index = 0;
        index < CHASE_ORDER_CONFIG.MaxActiveSessions;
        index++
      ) {
        placed.push(
          await provider.placeOrder({
            ...baseOrder,
            orderType: 'chase',
          } satisfies OrderParams),
        );
      }

      await provider.cancelOrder({
        orderId: placed[0].orderId,
        symbol: 'ETH',
        orderType: 'chase',
      });

      const replacement = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
      } satisfies OrderParams);
      expect(replacement.success).toBe(true);
    });
  });

  describe('Chase cancel racing the post-cancel remainder read', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('rests nothing when a cancel lands during the remainder read', async () => {
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
      let callerCancel: Promise<CancelOrderResult> | undefined;
      const orderStatus = vi.fn().mockImplementation(async () => {
        // The old order is already cancelled and the replacement has not gone
        // up. A caller cancelling here finds nothing to cancel, reports success
        // and drops the handle — so the tick must not rest anything after it.
        callerCancel = provider.cancelOrder({
          orderId: sessionId,
          symbol: 'ETH',
          orderType: 'chase',
        });
        await Promise.resolve();
        return {
          status: 'order',
          order: {
            status: 'canceled',
            order: {
              coin: 'ETH',
              side: 'B',
              limitPx: '2999.1',
              sz: '1',
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
        };
      });

      useStrategyClients({
        exchange: { order },
        info: {
          orderStatus,
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
                [{ px: '2990', sz: '10', n: 1 }],
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

      // Only the original placement: no unreachable replacement was left live.
      expect(order).toHaveBeenCalledTimes(1);
    });
  });

  describe('Chase state when a post-cancel read fails', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('retries a transient unknown status before replacing the child', async () => {
      const order = vi
        .fn()
        .mockResolvedValueOnce({
          status: 'ok',
          response: { data: { statuses: [{ resting: { oid: 55 } }] } },
        })
        .mockResolvedValueOnce({
          status: 'ok',
          response: { data: { statuses: [{ resting: { oid: 66 } }] } },
        });
      const cancelledOrderStatus = {
        status: 'order',
        order: {
          status: 'canceled',
          order: {
            coin: 'ETH',
            side: 'B',
            limitPx: '2999.1',
            sz: '1',
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
      };
      const orderStatus = vi
        .fn()
        .mockResolvedValueOnce({
          ...cancelledOrderStatus,
          order: { ...cancelledOrderStatus.order, status: 'open' },
        })
        .mockResolvedValueOnce({ status: 'unknownOid' })
        .mockResolvedValueOnce(cancelledOrderStatus);
      useStrategyClients({
        exchange: { order },
        info: {
          orderStatus,
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
                [{ px: '2990', sz: '10', n: 1 }],
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

      await vi.advanceTimersByTimeAsync(1100);

      expect(orderStatus).toHaveBeenCalledTimes(3);
      expect(order).toHaveBeenCalledTimes(2);
      expect(placed.success).toBe(true);
      expect(order.mock.calls[1][0].orders[0]).toMatchObject({ s: '1' });
    });

    it('does not retain the cancelled child as a Chase route after a fill', async () => {
      const order = vi.fn().mockResolvedValue({
        status: 'ok',
        response: { data: { statuses: [{ resting: { oid: 55 } }] } },
      });
      const orderStatus = (
        status: 'open' | 'filled',
        size: string,
      ): Record<string, unknown> => ({
        status: 'order',
        order: {
          status,
          order: {
            coin: 'ETH',
            side: 'B',
            limitPx: '2999.1',
            sz: size,
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
      const { exchangeClient } = useStrategyClients({
        exchange: { order },
        info: {
          orderStatus: vi
            .fn()
            .mockResolvedValueOnce(orderStatus('open', '1'))
            .mockResolvedValueOnce(orderStatus('filled', '0')),
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
                [{ px: '2990', sz: '10', n: 1 }],
                [{ px: '3001', sz: '10', n: 1 }],
              ],
            }),
        },
      });

      await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
      } satisfies OrderParams);
      await vi.advanceTimersByTimeAsync(1000);

      await provider.cancelOrder({ orderId: '55', symbol: 'ETH' });

      expect(exchangeClient.cancel).toHaveBeenCalledTimes(2);
      expect(exchangeClient.cancel).toHaveBeenLastCalledWith({
        cancels: [{ a: 1, o: 55 }],
      });
    });

    it('ends the session rather than rescheduling a chase with nothing resting', async () => {
      const order = vi.fn().mockResolvedValue({
        status: 'ok',
        response: { data: { statuses: [{ resting: { oid: 55 } }] } },
      });
      const { exchangeClient } = useStrategyClients({
        exchange: { order },
        info: {
          // The cancel succeeds, then the remainder lookup fails.
          orderStatus: vi.fn().mockRejectedValue(new Error('network blip')),
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
                [{ px: '2990', sz: '10', n: 1 }],
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

      await vi.advanceTimersByTimeAsync(5000);

      // The order was cancelled, so nothing rests. Recovery must not keep
      // ticking a session that has no live order.
      expect(exchangeClient.cancel).toHaveBeenCalledTimes(1);
      expect(order).toHaveBeenCalledTimes(1);

      // And the handle releases cleanly instead of reporting an incomplete
      // cancel against an order that is already gone.
      const result = await provider.cancelOrder({
        orderId: placed.orderId,
        symbol: 'ETH',
        orderType: 'chase',
      });
      expect(result).toStrictEqual({ success: true, orderId: placed.orderId });
    });
  });

  describe('Chase concurrency cap under concurrent placement', () => {
    it('does not exceed the cap when placements overlap', async () => {
      const order = vi.fn().mockImplementation(async () => {
        // Every placement is in flight at once: the cap is checked before this
        // resolves, so a check that does not reserve its slot lets them all in.
        await Promise.resolve();
        return {
          status: 'ok',
          response: { data: { statuses: [{ resting: { oid: 55 } }] } },
        };
      });
      const { exchangeClient } = useStrategyClients({ exchange: { order } });

      const attempts = CHASE_ORDER_CONFIG.MaxActiveSessions + 3;
      const results = await Promise.all(
        Array.from({ length: attempts }, async () =>
          provider.placeOrder({
            ...baseOrder,
            orderType: 'chase',
          } satisfies OrderParams),
        ),
      );

      const accepted = results.filter((result) => result.success);
      expect(accepted).toHaveLength(CHASE_ORDER_CONFIG.MaxActiveSessions);
      expect(exchangeClient.order).toHaveBeenCalledTimes(
        CHASE_ORDER_CONFIG.MaxActiveSessions,
      );
      results
        .filter((result) => !result.success)
        .forEach((result) => {
          expect(result.error).toBe(
            PERPS_ERROR_CODES.ORDER_CHASE_LIMIT_REACHED,
          );
        });
    });
  });

  describe('Chase netting uses the live resting size', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(async () => {
      // Stop the running Chase while its ticks are still on fake time.
      await provider.disconnect();
      vi.useRealTimers();
    });

    it('resolves ambiguous Chase children concurrently', async () => {
      const pendingFirstStatus = createDeferred<Record<string, unknown>>();
      const openStatus = (oid: number): Record<string, unknown> => ({
        status: 'order',
        order: {
          status: 'open',
          order: {
            coin: 'ETH',
            side: 'B',
            limitPx: '2999.1',
            sz: '1',
            origSz: '1',
            oid,
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
      const orderStatus = vi
        .fn()
        .mockImplementation(({ oid }) =>
          oid === 55
            ? pendingFirstStatus.promise
            : Promise.resolve(openStatus(oid)),
        );
      const order = vi
        .fn()
        .mockResolvedValueOnce({
          status: 'ok',
          response: { data: { statuses: [{ resting: { oid: 55 } }] } },
        })
        .mockResolvedValueOnce({
          status: 'ok',
          response: { data: { statuses: [{ resting: { oid: 66 } }] } },
        })
        .mockResolvedValue({
          status: 'ok',
          response: { data: { statuses: [{ resting: { oid: 77 } }] } },
        });
      const l2Book = vi
        .fn()
        .mockResolvedValueOnce({
          coin: 'ETH',
          levels: [
            [{ px: '2999', sz: '10', n: 1 }],
            [{ px: '3001', sz: '10', n: 1 }],
          ],
        })
        .mockResolvedValueOnce({
          coin: 'ETH',
          levels: [
            [
              { px: '2999.1', sz: '2', n: 2 },
              { px: '2999', sz: '10', n: 1 },
            ],
            [{ px: '3001', sz: '10', n: 1 }],
          ],
        })
        .mockResolvedValue({
          coin: 'ETH',
          levels: [
            [
              { px: '2999.2', sz: '1', n: 1 },
              { px: '2999.1', sz: '1', n: 1 },
              { px: '2998', sz: '10', n: 1 },
            ],
            [{ px: '3001', sz: '10', n: 1 }],
          ],
        });
      useStrategyClients({
        exchange: { order },
        info: { l2Book, orderStatus },
      });

      const first = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
      } satisfies OrderParams);
      const second = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
      } satisfies OrderParams);
      if (!first.orderId || !second.orderId) {
        throw new Error('Expected both Chase handles');
      }

      vi.advanceTimersByTime(1000);
      for (
        let index = 0;
        index < 10 && orderStatus.mock.calls.length < 2;
        index++
      ) {
        await Promise.resolve();
      }

      expect(
        orderStatus.mock.calls.map(([params]) => params.oid),
      ).toStrictEqual([55, 66]);

      pendingFirstStatus.resolve(openStatus(55));
      for (let index = 0; index < 10; index++) {
        await Promise.resolve();
      }
    });

    it('sees external liquidity sharing its level after a partial fill', async () => {
      const order = vi.fn().mockResolvedValue({
        status: 'ok',
        response: { data: { statuses: [{ resting: { oid: 55 } }] } },
      });

      // The chase placed 1 ETH at 2999.1 and 0.8 of it has since filled, so
      // only 0.2 is its own. The level shows 0.5 — the other 0.3 is external,
      // and it is still the best bid.
      const orderStatus = vi.fn().mockResolvedValue({
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
          },
        },
      });

      useStrategyClients({
        exchange: { order },
        info: {
          orderStatus,
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
                  { px: '2999.1', sz: '0.5', n: 2 },
                  { px: '2900', sz: '10', n: 1 },
                ],
                [{ px: '3001', sz: '10', n: 1 }],
              ],
            }),
        },
      });

      await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
      } satisfies OrderParams);

      await vi.advanceTimersByTimeAsync(1000);

      // Netting the live 0.2 leaves 0.3 of external size at 2999.1, so that is
      // still the best external bid and the chase improves on it by a tick.
      // Netting the stale 1 ETH would wipe the level out entirely and quote off
      // the 2900 level below — 99 dollars away from the real touch.
      expect(orderStatus).toHaveBeenCalled();
      expect(order).toHaveBeenCalledTimes(2);
      expect(order.mock.calls[1][0].orders[0].p).toBe('2999.2');
    });
  });

  describe('Strategy placement racing a disconnect', () => {
    it('retracts a TWAP that finishes after same-account teardown', async () => {
      let disconnected: Promise<unknown> | undefined;
      const twapOrder = vi.fn().mockImplementation(async () => {
        disconnected = provider.disconnect();
        mockClientService.getExchangeClient.mockImplementation(() => {
          throw new Error(PERPS_ERROR_CODES.EXCHANGE_CLIENT_NOT_AVAILABLE);
        });
        await Promise.resolve();
        return {
          status: 'ok',
          response: {
            type: 'twapOrder',
            data: { status: { running: { twapId: 987 } } },
          },
        };
      });
      const twapCancel = vi.fn().mockResolvedValue({
        status: 'ok',
        response: { type: 'twapCancel', data: { status: 'success' } },
      });
      const { exchangeClient } = useStrategyClients({
        exchange: { twapOrder, twapCancel },
      });

      const placed = await provider.placeOrder({
        ...baseOrder,
        orderType: 'twap',
        twapDuration: 30,
      } satisfies OrderParams);
      await disconnected;

      expect(exchangeClient.twapCancel).toHaveBeenCalledWith({ a: 1, t: 987 });
      expect(placed).toMatchObject({
        success: false,
        error: PERPS_ERROR_CODES.PROVIDER_LIFECYCLE_STALE,
        submittedSize: '1',
      });
      expect(placed.orderId).toBeUndefined();
    });

    /**
     * Place a TWAP that disconnects as the venue accepts it, after the caller
     * changes the account or network.
     *
     * @param changeContext - Switches the account or network before teardown.
     * @returns The placement result and the client that served it.
     */
    const placeTwapDuringContextChange = async (
      changeContext: () => void,
    ): Promise<{ placed: OrderResult; exchangeClient: MockClient }> => {
      let disconnected: Promise<unknown> | undefined;
      const twapOrder = vi.fn().mockImplementation(async () => {
        changeContext();
        disconnected = provider.disconnect();
        await Promise.resolve();
        return {
          status: 'ok',
          response: {
            type: 'twapOrder',
            data: { status: { running: { twapId: 987 } } },
          },
        };
      });
      const twapCancel = vi.fn().mockResolvedValue({
        status: 'ok',
        response: { type: 'twapCancel', data: { status: 'success' } },
      });
      const { exchangeClient } = useStrategyClients({
        exchange: { twapOrder, twapCancel },
      });

      const placed = await provider.placeOrder({
        ...baseOrder,
        orderType: 'twap',
        twapDuration: 30,
      } satisfies OrderParams);
      await disconnected;

      return { placed, exchangeClient };
    };

    it('does not retract a TWAP after its account changes', async () => {
      const { placed, exchangeClient } = await placeTwapDuringContextChange(
        () => {
          mockWalletService.getUserAddressWithDefault.mockResolvedValue(
            '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
          );
        },
      );

      expect(exchangeClient.twapCancel).not.toHaveBeenCalled();
      expect(placed).toMatchObject({
        success: false,
        error: PERPS_ERROR_CODES.PROVIDER_LIFECYCLE_STALE,
        orderId: '987',
      });
    });

    it('does not retract a TWAP after its network changes', async () => {
      const { placed, exchangeClient } = await placeTwapDuringContextChange(
        () => {
          mockClientService.isTestnetMode.mockReturnValue(true);
        },
      );

      expect(exchangeClient.twapCancel).not.toHaveBeenCalled();
      expect(placed).toMatchObject({
        success: false,
        error: PERPS_ERROR_CODES.PROVIDER_LIFECYCLE_STALE,
        orderId: '987',
      });
    });

    it('treats an already-finished stale TWAP as retracted', async () => {
      let disconnected: Promise<unknown> | undefined;
      const twapOrder = vi.fn().mockImplementation(async () => {
        disconnected = provider.disconnect();
        await Promise.resolve();
        return {
          status: 'ok',
          response: {
            type: 'twapOrder',
            data: { status: { running: { twapId: 987 } } },
          },
        };
      });
      const twapCancel = vi.fn().mockResolvedValue({
        status: 'ok',
        response: {
          type: 'twapCancel',
          data: { status: { error: 'Twap not found' } },
        },
      });
      useStrategyClients({ exchange: { twapOrder, twapCancel } });

      const placed = await provider.placeOrder({
        ...baseOrder,
        orderType: 'twap',
        twapDuration: 30,
      } satisfies OrderParams);
      await disconnected;

      expect(placed).toStrictEqual({
        success: false,
        error: PERPS_ERROR_CODES.PROVIDER_LIFECYCLE_STALE,
        submittedSize: '1',
      });
    });

    it('retracts resting Scale rungs after same-account teardown', async () => {
      let disconnected: Promise<unknown> | undefined;
      const order = vi.fn().mockImplementation(async () => {
        disconnected = provider.disconnect();
        mockClientService.getExchangeClient.mockImplementation(() => {
          throw new Error(PERPS_ERROR_CODES.EXCHANGE_CLIENT_NOT_AVAILABLE);
        });
        await Promise.resolve();
        return {
          status: 'ok',
          response: {
            data: {
              statuses: [
                { resting: { oid: 11 } },
                { filled: { oid: 22, avgPx: '2500', totalSz: '0.3333' } },
                { resting: { oid: 33 } },
              ],
            },
          },
        };
      });
      const cancel = vi.fn().mockResolvedValue({
        status: 'ok',
        response: { data: { statuses: ['success', 'success'] } },
      });
      const { exchangeClient } = useStrategyClients({
        exchange: { order, cancel },
      });

      const placed = await provider.placeOrder({
        ...baseOrder,
        orderType: 'scale',
        scaleMinPrice: '2000',
        scaleMaxPrice: '3000',
        scaleNumOrders: 3,
      } satisfies OrderParams);
      await disconnected;

      expect(exchangeClient.cancel).toHaveBeenCalledWith({
        cancels: [
          { a: 1, o: 11 },
          { a: 1, o: 33 },
        ],
      });
      expect(placed).toMatchObject({
        success: false,
        error: PERPS_ERROR_CODES.PROVIDER_LIFECYCLE_STALE,
        submittedSize: '1',
      });
      expect(placed.orderId).toBeUndefined();
      expect(placed.childOrderIds).toStrictEqual([]);
      expect(placed.acceptedChildren).toStrictEqual([
        { orderId: '11', state: 'resting' },
        { orderId: '22', state: 'filled' },
        { orderId: '33', state: 'resting' },
      ]);
    });

    it('does not retract Scale rungs after the venue marks their account unsupported', async () => {
      let disconnected: Promise<unknown> | undefined;
      const order = vi.fn().mockImplementation(async () => {
        disconnected = provider.disconnect();
        await disconnected;
        return {
          status: 'ok',
          response: {
            data: {
              statuses: [
                { resting: { oid: 11 } },
                { error: 'Multi-sig required' },
                { resting: { oid: 33 } },
              ],
            },
          },
        };
      });
      const cancel = vi.fn().mockResolvedValue({
        status: 'ok',
        response: { data: { statuses: ['success', 'success'] } },
      });
      const { exchangeClient } = useStrategyClients({
        exchange: { order, cancel },
      });

      const placed = await provider.placeOrder({
        ...baseOrder,
        orderType: 'scale',
        scaleMinPrice: '2000',
        scaleMaxPrice: '3000',
        scaleNumOrders: 3,
      } satisfies OrderParams);
      await disconnected;

      expect(exchangeClient.cancel).not.toHaveBeenCalled();
      expect(placed).toMatchObject({
        success: false,
        error: PERPS_ERROR_CODES.PROVIDER_LIFECYCLE_STALE,
        childOrderIds: ['11', '33'],
      });
    });
  });

  describe('Chase placement racing a disconnect', () => {
    it('keeps placement blocked until every overlapping lifecycle owner exits', async () => {
      let releaseDisconnect: (() => void) | undefined;
      mockClientService.disconnect.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            releaseDisconnect = resolve;
          }),
      );
      const { exchangeClient } = useStrategyClients();

      const disconnecting = provider.disconnect();
      await provider.suspendChaseOrders();
      const placed = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
      });
      releaseDisconnect?.();
      await disconnecting;

      expect(placed.success).toBe(false);
      expect(placed.error).toBe(PERPS_ERROR_CODES.ORDER_CHASE_ABANDONED);
      expect(exchangeClient.order).not.toHaveBeenCalled();
    });

    it('rejects a placement admitted after disconnect starts', async () => {
      const { exchangeClient } = useStrategyClients();

      const disconnecting = provider.disconnect();
      const placed = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
      });
      await disconnecting;

      expect(placed.success).toBe(false);
      expect(placed.error).toBe(PERPS_ERROR_CODES.ORDER_CHASE_ABANDONED);
      expect(exchangeClient.order).not.toHaveBeenCalled();
    });

    /**
     * Tear the provider down from inside the mid-flight order submission.
     *
     * The teardown models what `HyperLiquidClientService.disconnect` does:
     * it drops the service's client reference synchronously, so every later
     * `getExchangeClient` throws, while the instance already handed out keeps
     * working. Anything the provider wants to do about its in-flight order has
     * to be done through the client it is already holding.
     *
     * @param cancel - The cancel the retraction attempt will get back.
     * @param changeContext - Optional account or network change before teardown.
     * @returns The placement result and the exchange client that served it.
     */
    const placeChaseTornDownMidFlight = async (
      cancel: Mock,
      changeContext?: () => void,
    ): Promise<{ placed: OrderResult; exchangeClient: MockClient }> => {
      let disconnected: Promise<unknown> | undefined;
      const order = vi.fn().mockImplementation(async () => {
        // The order is on its way to the venue when the provider is torn down.
        changeContext?.();
        disconnected = provider.disconnect();
        mockClientService.getExchangeClient.mockImplementation(() => {
          throw new Error(PERPS_ERROR_CODES.EXCHANGE_CLIENT_NOT_AVAILABLE);
        });
        await Promise.resolve();
        return {
          status: 'ok',
          response: { data: { statuses: [{ resting: { oid: 55 } }] } },
        };
      });
      const { exchangeClient } = useStrategyClients({
        exchange: { order, cancel },
      });

      const placed = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
      } satisfies OrderParams);
      await disconnected;

      return { placed, exchangeClient };
    };

    it('does not retract an orphaned Chase after its account changes', async () => {
      const cancel = vi.fn().mockResolvedValue({
        status: 'ok',
        response: { data: { statuses: ['success'] } },
      });
      const { placed, exchangeClient } = await placeChaseTornDownMidFlight(
        cancel,
        () => {
          mockWalletService.getUserAddressWithDefault.mockResolvedValue(
            '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
          );
        },
      );

      expect(exchangeClient.cancel).not.toHaveBeenCalled();
      expect(placed).toMatchObject({
        success: false,
        error: PERPS_ERROR_CODES.ORDER_CHASE_ABANDONED,
        childOrderIds: ['55'],
      });
    });

    it('does not retract an orphaned Chase after its network changes', async () => {
      const cancel = vi.fn().mockResolvedValue({
        status: 'ok',
        response: { data: { statuses: ['success'] } },
      });
      const { placed, exchangeClient } = await placeChaseTornDownMidFlight(
        cancel,
        () => {
          mockClientService.isTestnetMode.mockReturnValue(true);
        },
      );

      expect(exchangeClient.cancel).not.toHaveBeenCalled();
      expect(placed).toMatchObject({
        success: false,
        error: PERPS_ERROR_CODES.ORDER_CHASE_ABANDONED,
        childOrderIds: ['55'],
      });
    });

    it('retracts the order it could not put a strategy behind', async () => {
      const cancel = vi.fn().mockResolvedValue({
        status: 'ok',
        response: { data: { statuses: ['success'] } },
      });
      const { placed, exchangeClient } =
        await placeChaseTornDownMidFlight(cancel);

      // The placement is reported as a failure, so nothing downstream treats it
      // as an order that exists: the caches a successful placement invalidates
      // are not invalidated, and no handle names it. Leaving it resting would
      // make that report false at the venue — and the exchange id is only good
      // while this provider still points at the account that placed it, which a
      // disconnect is the usual prelude to changing. So it is taken back and the
      // failure is true on both sides.
      //
      // The teardown has already made `getExchangeClient` throw, so the cancel
      // can only have gone through the instance captured before the submission.
      // A provider that looked a client up at retraction time would never have
      // sent this request at all.
      expect(exchangeClient.cancel).toHaveBeenCalledWith({
        cancels: [{ a: 1, o: 55 }],
      });
      expect(placed.success).toBe(false);
      expect(placed.error).toBe(PERPS_ERROR_CODES.ORDER_CHASE_ABANDONED);
      expect(placed.orderId).toBeUndefined();
      // Nothing rests, so there is no id worth handing back: naming one would
      // send the caller to cancel an order that is already gone.
      expect(placed.childOrderIds).toBeUndefined();
    });

    it('reports the resting order when it cannot be retracted', async () => {
      // The venue refuses the cancel and the order stays on the book. This is
      // the only case where the caller is left holding a live order, so it is
      // the only one that gets an id to reach it with.
      const cancel = vi.fn().mockResolvedValue({
        status: 'ok',
        response: {
          data: { statuses: [{ error: 'Order could not be found' }] },
        },
      });
      const { placed, exchangeClient } =
        await placeChaseTornDownMidFlight(cancel);

      expect(placed.success).toBe(false);
      expect(placed.error).toBe(PERPS_ERROR_CODES.ORDER_CHASE_ABANDONED);
      expect(placed.childOrderIds).toStrictEqual(['55']);

      // Reachable through the ordinary single-order cancel, which is the only
      // route that can name it once no session holds it. That cancel runs on a
      // provider that has since reconnected, so the service serves a client
      // again — the id is only worth anything while that client still signs as
      // the account the order was placed under.
      mockClientService.getExchangeClient.mockReturnValue(
        exchangeClient as never,
      );
      await provider.initialize();
      const cancelled = await provider.cancelOrder({
        orderId: (placed.childOrderIds as string[])[0],
        symbol: 'ETH',
      });
      expect(cancelled.orderId).toBe('55');
    });

    it('reports the resting order when the retraction itself fails', async () => {
      // A provider mid-teardown can fail the cancel outright rather than have
      // it refused. Best-effort by construction: the placement still resolves
      // as an abandoned chase rather than throwing the cancel's error.
      const cancel = vi.fn().mockRejectedValue(new Error('client torn down'));
      const { placed } = await placeChaseTornDownMidFlight(cancel);

      expect(placed.success).toBe(false);
      expect(placed.error).toBe(PERPS_ERROR_CODES.ORDER_CHASE_ABANDONED);
      expect(placed.childOrderIds).toStrictEqual(['55']);
    });

    it('retains legacy HIP-3 collateral when an orphaned child still rests', async () => {
      let disconnected: Promise<unknown> | undefined;
      let transferred = false;
      const order = vi.fn().mockImplementation(async () => {
        disconnected = provider.disconnect();
        mockClientService.getExchangeClient.mockImplementation(() => {
          throw new Error(PERPS_ERROR_CODES.EXCHANGE_CLIENT_NOT_AVAILABLE);
        });
        await Promise.resolve();
        return {
          status: 'ok',
          response: { data: { statuses: [{ resting: { oid: 55 } }] } },
        };
      });
      const sendAsset = vi.fn().mockImplementation(async () => {
        transferred = true;
        return { status: 'ok' };
      });
      useStrategyClients({
        exchange: {
          order,
          sendAsset,
          cancel: vi.fn().mockResolvedValue({
            status: 'ok',
            response: {
              data: { statuses: [{ error: 'Order could not be found' }] },
            },
          }),
        },
        info: {
          clearinghouseState: vi
            .fn()
            .mockImplementation(({ dex }) =>
              Promise.resolve(
                createClearinghouseBalance(
                  dex === 'xyz' && !transferred ? '0' : '1000',
                ),
              ),
            ),
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

      const placed = await provider.placeOrder({
        ...baseOrder,
        symbol: 'xyz:TSLA',
        orderType: 'chase',
      } satisfies OrderParams);
      await disconnected;

      expect(placed).toMatchObject({
        success: false,
        error: PERPS_ERROR_CODES.ORDER_CHASE_ABANDONED,
        childOrderIds: ['55'],
      });
      expect(sendAsset).toHaveBeenCalledTimes(1);
    });

    it('places nothing when the teardown lands during the book read', async () => {
      let disconnected: Promise<unknown> | undefined;
      const { exchangeClient } = useStrategyClients({
        info: {
          // The book read is a round trip after the preamble's own checks, so
          // a disconnect can land inside it.
          l2Book: vi.fn().mockImplementation(async () => {
            disconnected = provider.disconnect();
            await Promise.resolve();
            return {
              coin: 'ETH',
              levels: [
                [{ px: '2999', sz: '10', n: 1 }],
                [{ px: '3001', sz: '10', n: 1 }],
              ],
            };
          }),
        },
      });

      const placed = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
      } satisfies OrderParams);
      await disconnected;

      // Nothing is signed: the check between the book read and the submission
      // means no window between two awaits on this path ends in a fresh order
      // for a provider that has already stopped.
      expect(exchangeClient.order).not.toHaveBeenCalled();
      expect(exchangeClient.cancel).not.toHaveBeenCalled();
      expect(placed.success).toBe(false);
      expect(placed.error).toBe(PERPS_ERROR_CODES.ORDER_CHASE_ABANDONED);
      expect(placed.childOrderIds).toBeUndefined();
    });
  });

  describe('Two chases on the same side do not leapfrog each other', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('treats another session of its own as not-external liquidity', async () => {
      let placements = 0;
      const order = vi.fn().mockImplementation(async () => {
        placements += 1;
        return {
          status: 'ok',
          response: {
            data: { statuses: [{ resting: { oid: 54 + placements } }] },
          },
        };
      });

      // The external bid never moves. The first two reads are the placements,
      // when nothing of ours is resting yet; afterwards the book carries the
      // two chases' combined 2 ETH at 2999.1 on top of the external 2999.
      let bookReads = 0;
      const l2Book = vi.fn().mockImplementation(async () => {
        bookReads += 1;
        const bids =
          bookReads <= 2
            ? [{ px: '2999', sz: '10', n: 1 }]
            : [
                { px: '2999.1', sz: '2', n: 2 },
                { px: '2999', sz: '10', n: 1 },
              ];
        return {
          coin: 'ETH',
          levels: [bids, [{ px: '3001', sz: '10', n: 1 }]],
        };
      });

      useStrategyClients({ exchange: { order }, info: { l2Book } });

      await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
      } satisfies OrderParams);
      await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
      } satisfies OrderParams);
      expect(order).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(5000);

      // Netting only its own order, each session would read the other's 1 ETH
      // as external size at 2999.1, improve to 2999.2, then improve on that —
      // walking each other up an unchanged market. Netting everything this
      // provider holds leaves 2999 as the real touch, the quote unchanged, and
      // no re-price at all.
      expect(order).toHaveBeenCalledTimes(2);
    });
  });

  describe('Chase fee rate against the user schedule', () => {
    it('quotes the maker rate even when the account has its own fee tier', async () => {
      const { infoClient } = useStrategyClients({
        info: {
          // These are the fields the fee path actually reads; a `feeSchedule`
          // shape parses to NaN and falls back to the base rates, which would
          // make this test pass without ever entering the branch it is about.
          userFees: vi.fn().mockResolvedValue({
            userCrossRate: '0.00030',
            userAddRate: '0.00010',
            userSpotCrossRate: '0.00040',
            userSpotAddRate: '0.00020',
            activeReferralDiscount: '0',
            dailyUserVlm: [],
          }),
        },
      });

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

      // The account's own schedule was consulted, not the fallback base rates.
      expect(infoClient.userFees).toHaveBeenCalled();
      // A chase is post-only whatever the caller passes, and that has to hold
      // for the account's own schedule as well as the base rates.
      expect(chase.feeRate).toBeLessThan(market.feeRate);
    });
  });

  describe('Chase placement racing a disconnect during preparation', () => {
    it('places nothing when the teardown lands during preparation', async () => {
      let disconnected: Promise<unknown> | undefined;
      const { exchangeClient } = useStrategyClients({
        exchange: {
          // The leverage update is part of the shared preamble, before the
          // chase handler is even reached.
          updateLeverage: vi.fn().mockImplementation(async () => {
            disconnected = provider.disconnect();
            await Promise.resolve();
            return { status: 'ok' };
          }),
          order: vi.fn().mockResolvedValue({
            status: 'ok',
            response: { data: { statuses: [{ resting: { oid: 55 } }] } },
          }),
        },
      });

      const placed = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        leverage: 5,
        chaseIntervalMs: 1000,
      } satisfies OrderParams);
      await disconnected;

      // The disconnect landed during the preamble, which is before the chase
      // reads the book or submits anything — so no order is created for a
      // provider that has been torn down, and there is nothing left resting to
      // report.
      expect(exchangeClient.order).not.toHaveBeenCalled();
      expect(placed.success).toBe(false);
      expect(placed.error).toBe(PERPS_ERROR_CODES.ORDER_CHASE_ABANDONED);
      expect(placed.childOrderIds).toBeUndefined();
    });
  });
});
