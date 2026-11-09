import { describe, expect, it } from 'vitest';

import {
  LIGHTER_MAX_WIRE_PRICE,
  LIGHTER_GROUPING_ONE_TRIGGERS_THE_OTHER,
  LIGHTER_GROUPING_ONE_TRIGGERS_OCO,
  LIGHTER_MIN_TRADING_API_KEY_INDEX,
  LIGHTER_MAX_TRADING_API_KEY_INDEX,
  LIGHTER_TRADING_API_KEY_COUNT,
  LIGHTER_KEY_REGISTRATION_VISIBILITY_TIMEOUT_MS,
  LIGHTER_KEY_REGISTRATION_VISIBILITY_POLL_MS,
  LIGHTER_KEY_REGISTRATION_VISIBILITY_MAX_ATTEMPTS,
  LIGHTER_FILL_REPLAY_LIMIT,
  LIGHTER_RECOVERY_ACCOUNT_INDEX_LIMIT,
  LIGHTER_ORDER_TYPE_STOP_LOSS_LIMIT,
  LIGHTER_ORDER_TYPE_TAKE_PROFIT_LIMIT,
} from '../src/constants/index.js';
// Checks the account-signer and agent surface through the package entrypoint,
// the way a client imports it, so a dropped or renamed export fails here.
import {
  HYPERLIQUID_L1_ACTION_DOMAIN_NAME,
  HYPERLIQUID_L1_ACTION_PRIMARY_TYPE,
  PerpsController,
  TP_SL_PRECISION_CONFIG,
  calculateAccountSummary,
  calculateNetClosedPnl,
  calculatePercentageForPrice,
  calculatePriceForPercentage,
  calculatePriceForRoE,
  calculateRoEForPrice,
  calculateSignedRoEForPrice,
  estimateCloseReceive,
  estimateIsolatedLeverageChange,
  formatRoePercent,
  getCrossCollateral,
  getMaxStopLossPercentage,
  isPositiveTriggerPrice,
  isStopLossSafeFromLiquidation,
  isValidStopLossPercentage,
  isValidStopLossPrice,
  isValidTakeProfitPrice,
  validateTPSLPrices,
} from '../src/index.js';
import type {
  CalculateAccountSummaryParams,
  CloseReceiveEstimate,
  CloseReceiveEstimateParams,
  IsolatedLeverageChange,
  IsolatedLeverageChangeParams,
  NetClosedPnlParams,
  PerpsAccountSummary,
  TpslCalculationParams,
  TpslValidationResult,
  DirectProviderOrderCapabilities,
  DirectProviderOrderCapabilitiesUnavailableReason,
  GetAccountSupportParams,
  UpdatePositionTPSLParams,
  MarketInfo,
  PerpsAccountSupport,
  PerpsAccountSigner,
  PerpsAgentAccount,
  PerpsAgentSigner,
  PerpsControllerClearAgentSignersAction,
  PerpsControllerGetAccountSupportAction,
  PerpsControllerReconcileChaseOrderCancellationAction,
  PerpsControllerPrepareTradingWalletAction,
  PerpsControllerSetAgentSignerAction,
  PerpsFeeResolverScope,
  PerpsPlatformDependencies,
  PerpsTradingFeeGrant,
  PerpsTypedDataPayload,
} from '../src/index.js';
import { createGuardedHyperLiquidClient } from '../src/utils/guardedHyperLiquidClient.js';
import {
  LIGHTER_ATTACHED_MAX_GROUPS,
  LIGHTER_ATTACHED_HANDLE_PREFIX,
  parseLighterAttachedGroups,
  correlateLighterAttachedOrders,
  toAttachedOrderGroup,
} from '../src/utils/lighterAttachedOrders.js';
import { assertExpectedPosition } from '../src/utils/positionProtection.js';

describe('@metamask/perps-controller public API', () => {
  it('exports the durable recovery account capacity', () => {
    expect(LIGHTER_RECOVERY_ACCOUNT_INDEX_LIMIT).toBe(64);
  });
  it('exports attached constants and utility subpath helpers', () => {
    expect([
      LIGHTER_MAX_WIRE_PRICE,
      LIGHTER_GROUPING_ONE_TRIGGERS_THE_OTHER,
      LIGHTER_GROUPING_ONE_TRIGGERS_OCO,
    ]).toStrictEqual([4294967295, 1, 3]);
    expect(LIGHTER_ATTACHED_MAX_GROUPS).toBe(64);
    expect(LIGHTER_ATTACHED_HANDLE_PREFIX).toBe('lighter-attached:');
    expect(parseLighterAttachedGroups(null)).toStrictEqual([]);
    expect(typeof correlateLighterAttachedOrders).toBe('function');
    expect(typeof toAttachedOrderGroup).toBe('function');
  });
  it('exports durable attached-order inventory and explicit venue review', () => {
    expect(typeof PerpsController.prototype.getAttachedOrderGroups).toBe(
      'function',
    );
    expect(typeof PerpsController.prototype.reviewAttachedOrderGroups).toBe(
      'function',
    );
  });
  it('exports strict recovery review and explicit protection resolution', () => {
    expect(typeof PerpsController.prototype.reviewRecoveryVenue).toBe(
      'function',
    );
    expect(typeof PerpsController.prototype.resolveRecoveryProtection).toBe(
      'function',
    );
  });

  it('exposes explicit non-financial reconciliation on the public controller', () => {
    expect(typeof PerpsController.prototype.reconcileRecoveredDispatches).toBe(
      'function',
    );
  });

  it('exports observation-only exact Chase cancellation reconciliation and its messenger action', () => {
    const action: PerpsControllerReconcileChaseOrderCancellationAction['type'] =
      'PerpsController:reconcileChaseOrderCancellation';
    expect(
      typeof PerpsController.prototype.reconcileChaseOrderCancellation,
    ).toBe('function');
    expect(action).toBe('PerpsController:reconcileChaseOrderCancellation');
  });

  it('exports the account support contracts and controller method', () => {
    const params: GetAccountSupportParams = { providerId: 'hyperliquid' };
    const support: PerpsAccountSupport = {
      isSupported: false,
      reason: 'multi_sig_account',
    };
    const action: PerpsControllerGetAccountSupportAction['type'] =
      'PerpsController:getAccountSupport';

    expect(typeof PerpsController.prototype.getAccountSupport).toBe('function');
    expect(params.providerId).toBe('hyperliquid');
    expect(support).toStrictEqual({
      isSupported: false,
      reason: 'multi_sig_account',
    });
    expect(action).toBe('PerpsController:getAccountSupport');
  });

  it('exports the trading configuration constants', () => {
    expect([
      LIGHTER_MIN_TRADING_API_KEY_INDEX,
      LIGHTER_MAX_TRADING_API_KEY_INDEX,
      LIGHTER_TRADING_API_KEY_COUNT,
      LIGHTER_KEY_REGISTRATION_VISIBILITY_TIMEOUT_MS,
      LIGHTER_KEY_REGISTRATION_VISIBILITY_POLL_MS,
      LIGHTER_KEY_REGISTRATION_VISIBILITY_MAX_ATTEMPTS,
      LIGHTER_FILL_REPLAY_LIMIT,
    ]).toStrictEqual([2, 254, 253, 10000, 250, 40, 100]);
  });

  it('exposes optional protection preconditions, capabilities and utility subpath helpers', () => {
    const legacy: UpdatePositionTPSLParams = { symbol: 'BTC' };
    const guarded: UpdatePositionTPSLParams = {
      symbol: 'BTC',
      expectedPosition: { size: '-1', entryPrice: '100000' },
    };
    const capability: DirectProviderOrderCapabilities = {
      status: 'ready',
      providerId: 'lighter',
      supportedStrategies: [],
      positionTpsl: {
        supportsExpectedPosition: true,
        childOrderIds: 'request-correlated',
        takeProfitOrderType: 'take_profit_market',
        stopLossOrderType: 'stop_market',
        defaultCoverage: 'position-snapshot',
        partialCoverage: {
          single: true,
          pair: 'equal-quantity-oco',
          replacement: 'cancel-before-create',
          recovery: 'explicit-current-position-intent',
        },
      },
    };
    expect(legacy.expectedPosition).toBeUndefined();
    expect(() =>
      assertExpectedPosition(guarded.expectedPosition, {
        size: '-1.0',
        entryPrice: '100000.0',
      }),
    ).not.toThrow();
    expect(capability.positionTpsl?.supportsExpectedPosition).toBe(true);
    expect(capability.positionTpsl?.partialCoverage?.pair).toBe(
      'equal-quantity-oco',
    );
    expect(typeof createGuardedHyperLiquidClient).toBe('function');
  });

  it('exports the native trigger-limit wire types', () => {
    expect([
      LIGHTER_ORDER_TYPE_STOP_LOSS_LIMIT,
      LIGHTER_ORDER_TYPE_TAKE_PROFIT_LIMIT,
    ]).toStrictEqual([3, 5]);
  });

  it('exports optional native price precision and unsupported-market capability reasons', () => {
    const unspecifiedGrid: Pick<MarketInfo, 'priceDecimals'> = {};
    const venueGrid: Pick<MarketInfo, 'priceDecimals'> = { priceDecimals: 2 };
    const reason: DirectProviderOrderCapabilitiesUnavailableReason =
      'order_market_unsupported';

    expect(unspecifiedGrid.priceDecimals).toBeUndefined();
    expect(venueGrid.priceDecimals).toBe(2);
    expect(reason).toBe('order_market_unsupported');
  });

  it('exports the EIP-712 shape of a HyperLiquid L1 action', () => {
    expect(HYPERLIQUID_L1_ACTION_DOMAIN_NAME).toBe('Exchange');
    expect(HYPERLIQUID_L1_ACTION_PRIMARY_TYPE).toBe('Agent');
  });

  it('exposes the agent and preparation methods on PerpsController', () => {
    expect(typeof PerpsController.prototype.setAgentSigner).toBe('function');
    expect(typeof PerpsController.prototype.clearAgentSigners).toBe('function');
    expect(typeof PerpsController.prototype.prepareTradingWallet).toBe(
      'function',
    );
  });

  it('exports the signer types and action types', () => {
    const payload: PerpsTypedDataPayload = {
      domain: {
        name: HYPERLIQUID_L1_ACTION_DOMAIN_NAME,
        version: '1',
        chainId: 1337,
        verifyingContract: '0x0000000000000000000000000000000000000000',
      },
      types: {},
      primaryType: HYPERLIQUID_L1_ACTION_PRIMARY_TYPE,
      message: {},
    };
    const accountSigner: PerpsAccountSigner = {
      signTypedData: async () => '0x',
      signPersonalMessage: async () => '0x',
    };
    const agentSigner: PerpsAgentSigner = {
      address: '0x0000000000000000000000000000000000000001',
      signTypedData: async () => '0x',
    };
    const account: PerpsAgentAccount = {
      mainAddress: '0x0000000000000000000000000000000000000002',
      isTestnet: true,
    };
    const actionTypes: [
      PerpsControllerSetAgentSignerAction['type'],
      PerpsControllerClearAgentSignersAction['type'],
      PerpsControllerPrepareTradingWalletAction['type'],
    ] = [
      'PerpsController:setAgentSigner',
      'PerpsController:clearAgentSigners',
      'PerpsController:prepareTradingWallet',
    ];

    expect([payload, accountSigner, agentSigner, account]).toHaveLength(4);
    expect(actionTypes).toStrictEqual([
      'PerpsController:setAgentSigner',
      'PerpsController:clearAgentSigners',
      'PerpsController:prepareTradingWallet',
    ]);
  });

  it('exports the shared TP/SL and account summary calculations', () => {
    const params: TpslCalculationParams = {
      currentPrice: 2500,
      entryPrice: 2500,
      direction: 'long',
      leverage: 2,
    };
    const accountParams: CalculateAccountSummaryParams = {
      totalEquity: '15.57',
      crossMarginSummary: {
        accountValue: '10.4',
        maintenanceMargin: '0.2444',
        notional: '12.31',
        marginUsed: '1.231',
      },
      spotCollateral: 0,
    };
    const summary: PerpsAccountSummary = calculateAccountSummary(accountParams);
    const validation: TpslValidationResult = validateTPSLPrices(
      '2625',
      '2375',
      params,
    );

    expect(calculatePriceForRoE(-10, false, params)).toBe('2375');
    expect(calculateSignedRoEForPrice('2375', params)).toBe('-10.00');
    expect(calculateRoEForPrice('2375', true, params)).toBe('0.00');
    expect(calculatePriceForPercentage(10, true, params)).toBe('2750');
    expect(calculatePercentageForPrice('2750', true, params)).toBe('10.00');
    expect(getMaxStopLossPercentage(2)).toBe(198);
    expect(isValidStopLossPercentage(199, 2)).toBe(false);
    expect(isPositiveTriggerPrice('-5')).toBe(false);
    expect(isValidTakeProfitPrice('2625', params)).toBe(true);
    expect(isValidStopLossPrice('2625', params)).toBe(false);
    expect(isStopLossSafeFromLiquidation('1900', '2000', 'long')).toBe(false);
    expect(validation).toBe('valid');
    expect(formatRoePercent(12.5, { signed: true })).toBe('+12.50');
    expect(TP_SL_PRECISION_CONFIG).toStrictEqual({
      TriggerPriceBands: [
        { BelowPrice: 0.01, Decimals: 8 },
        { BelowPrice: 1, Decimals: 6 },
        { BelowPrice: 100, Decimals: 4 },
      ],
      TriggerPriceDefaultDecimals: 2,
      PercentageDecimals: 2,
    });
    expect(getCrossCollateral(accountParams.crossMarginSummary, 0)).toBeCloseTo(
      10.4,
    );
    expect(summary.accountLeverage).toBeCloseTo(12.31 / 15.57);
  });

  it('exports the shared close-receive estimate and net closed PnL', () => {
    const closeParams: CloseReceiveEstimateParams = {
      position: {
        size: '1',
        entryPrice: '2000',
        marginUsed: '1100',
        unrealizedPnl: '100',
        leverage: { type: 'isolated' },
      },
      providerId: 'hyperliquid',
      closeSize: 0.5,
      price: 2100,
      feeRate: 0.0005,
    };
    const fill: NetClosedPnlParams = { pnl: '1234.56789', fee: '0.1' };
    const close: CloseReceiveEstimate = estimateCloseReceive(closeParams);

    expect(close).toStrictEqual({
      marginReturned: 500,
      realizedPnl: 50,
      fee: 0.525,
      receive: 549.47,
    });
    expect(calculateNetClosedPnl(fill)).toBe(1234.46789);
  });

  it('exports the isolated leverage change estimate', () => {
    const params: IsolatedLeverageChangeParams = {
      position: {
        size: '1',
        positionValue: '2000',
        marginUsed: '400',
        leverage: { type: 'isolated', value: 5 },
      },
      providerId: 'hyperliquid',
      market: {},
      leverage: 10,
      marginTiers: [{ lowerBound: 0, maxLeverage: 25 }],
    };
    const result: IsolatedLeverageChange =
      estimateIsolatedLeverageChange(params);

    expect(result.removableMargin).toBeCloseTo(180);
    expect(result.margin).toBeCloseTo(220);
    expect(result.liquidationPrice).toBeCloseTo(1780 / 0.98);
  });

  it('exports the optional trading fee grant dependency contract', async () => {
    const scope: PerpsFeeResolverScope = {
      providerId: 'hyperliquid',
      isTestnet: false,
    };
    const grant: PerpsTradingFeeGrant = {
      ...scope,
      feeBips: 2,
      expiresAt: Date.now() + 60_000,
    };
    const rewardsWithGrant: PerpsPlatformDependencies['rewards'] = {
      getPerpsDiscountForAccount: async () => null,
      getPerpsTradingFeeGrant: async (requestedScope) =>
        requestedScope.providerId === scope.providerId ? grant : null,
    };
    const legacyRewards: PerpsPlatformDependencies['rewards'] = {
      getPerpsDiscountForAccount: async () => 6500,
    };

    expect(
      await rewardsWithGrant.getPerpsTradingFeeGrant?.(scope),
    ).toStrictEqual(grant);
    expect(legacyRewards.getPerpsTradingFeeGrant).toBeUndefined();
  });
});
