import { describe, expect, it } from 'vitest';

// Imports the advanced-order surface through the package entry, the way a
// client does, so a dropped or renamed export fails here.
import {
  CHASE_ORDER_CONFIG,
  CHASE_ORDER_RUNNING_STATUSES,
  HYPERLIQUID_TWAP_LIMITS,
  ORDER_PRICE_WARNING_CONFIG,
  PerpsController,
  TWAP_ORDER_ACTIVE_STATUSES,
  TWAP_ORDER_CONFIG,
  checkChasePlacement,
  classifyScalePriceWarnings,
  computeChaseQuotePrice,
  computeTwapSlicePreview,
  createLiveChaseOrderList,
  createLiveTwapOrderList,
  formatPerpsDuration,
  getStrategyRules,
  isChaseOrderCancelable,
  isChaseOrderRunning,
  isTwapOrderActive,
  mergeChaseOrderHistory,
  mergeTwapOrders,
  partitionTwapOrders,
  reconcileTwapExecution,
  sizeScaleLadder,
  validateOrderParams,
  validateScaleOrder,
  validateTwapOrder,
} from '../src/index.js';
import type {
  AdvancedOrderValidationResult,
  ChaseOrderLists,
  ChasePlacementCheck,
  PerpsDurationFormatOptions,
  PerpsStrategyRules,
  ScaleLadderSizing,
  ScalePriceWarning,
  TwapSlicePreview,
} from '../src/index.js';

describe('@metamask/perps-controller advanced-order public API', () => {
  it('exports the TWAP, chase and scale helpers', () => {
    const helpers = [
      checkChasePlacement,
      classifyScalePriceWarnings,
      computeChaseQuotePrice,
      computeTwapSlicePreview,
      createLiveChaseOrderList,
      createLiveTwapOrderList,
      formatPerpsDuration,
      getStrategyRules,
      isChaseOrderCancelable,
      isChaseOrderRunning,
      isTwapOrderActive,
      mergeChaseOrderHistory,
      mergeTwapOrders,
      partitionTwapOrders,
      reconcileTwapExecution,
      sizeScaleLadder,
      validateOrderParams,
      validateScaleOrder,
      validateTwapOrder,
    ];

    expect(helpers.every((helper) => typeof helper === 'function')).toBe(true);
  });

  it('exports the constants the helpers and lists use', () => {
    expect(TWAP_ORDER_ACTIVE_STATUSES).toStrictEqual(['active']);
    expect(CHASE_ORDER_RUNNING_STATUSES).toStrictEqual([
      'active',
      'termination_pending',
    ]);
    expect(HYPERLIQUID_TWAP_LIMITS.SliceIntervalSeconds).toBe(30);
    expect(TWAP_ORDER_CONFIG).toStrictEqual({
      RefreshIntervalMs: 5000,
      StreamCatchUpIntervalMs: 1000,
    });
    expect(CHASE_ORDER_CONFIG).toMatchObject({
      RefreshIntervalMs: 1000,
      HistoryLimit: 50,
    });
    expect(ORDER_PRICE_WARNING_CONFIG.FarFromMarketRatio).toBe(0.05);
  });

  it('exposes the live lists on the controller', () => {
    expect(typeof PerpsController.prototype.subscribeToLiveTwapOrders).toBe(
      'function',
    );
    expect(typeof PerpsController.prototype.subscribeToChaseOrderLists).toBe(
      'function',
    );
  });

  it('exports the advanced-order types', () => {
    const rules: PerpsStrategyRules = {
      twap: {
        minDurationMinutes: 1,
        maxDurationMinutes: 60,
        minNotionalUsd: 20,
        sliceIntervalSeconds: 10,
      },
    };
    const valid: AdvancedOrderValidationResult = validateTwapOrder({
      rules: rules.twap,
      durationMinutes: 2,
    });
    const preview: TwapSlicePreview | undefined = computeTwapSlicePreview({
      rules: rules.twap,
      durationMinutes: 1,
      size: '6',
      sizeDecimals: 0,
    });
    const lists: ChaseOrderLists = mergeChaseOrderHistory({ current: [] });
    const check: ChasePlacementCheck = checkChasePlacement({
      rules: {
        maxActiveSessions: 1,
        defaultIntervalMs: 1000,
        minIntervalMs: 1000,
      },
      chaseOrders: [],
    });
    const sizing: ScaleLadderSizing = sizeScaleLadder({
      prices: ['1', '2'],
      sizeDecimals: 0,
      size: '2',
    });
    const warnings: ScalePriceWarning[] = classifyScalePriceWarnings({
      prices: ['101'],
      isBuy: true,
      bestBid: '99',
      bestAsk: '100',
    });
    const options: PerpsDurationFormatOptions = { unitDisplay: 'long' };

    expect(valid).toStrictEqual({ isValid: true });
    expect(preview).toMatchObject({ sliceCount: 6, sizePerSlice: '1' });
    expect(lists).toStrictEqual({ running: [], history: [] });
    expect(check).toStrictEqual({
      canPlace: true,
      activeCount: 0,
      maxActiveSessions: 1,
    });
    expect(sizing).toStrictEqual({
      sizes: ['1', '1'],
      totalSize: '2',
      totalNotional: '3',
    });
    expect(warnings).toStrictEqual([{ code: 'crosses_market' }]);
    expect(formatPerpsDuration(5 * 60_000, options)).toBe('5 minutes');
  });
});
