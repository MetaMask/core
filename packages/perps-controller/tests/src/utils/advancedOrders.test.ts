import { BigNumber } from 'bignumber.js';
import { describe, expect, it } from 'vitest';

import { HYPERLIQUID_ORDER_CAPABILITIES } from '../../../src/constants/hyperLiquidConfig.js';
import { CHASE_ORDER_STATUS } from '../../../src/constants/perpsConfig.js';
import { PERPS_ERROR_CODES } from '../../../src/perpsErrorCodes.js';
import type {
  ChaseOrder,
  PerpsOrderCapabilities,
  TwapOrder,
  TwapOrderFill,
} from '../../../src/types/index.js';
import {
  CHASE_ORDER_RUNNING_STATUSES,
  boundTwapExecution,
  TWAP_ORDER_ACTIVE_STATUSES,
  checkChasePlacement,
  classifyScalePriceWarnings,
  computeTwapSlicePreview,
  getStrategyRules,
  isChaseOrderCancelable,
  isChaseOrderRunning,
  isTwapOrderActive,
  mergeChaseOrderHistory,
  mergeTwapOrders,
  partitionTwapOrders,
  reconcileTwapExecution,
  sizeScaleLadder,
  supersedesTwapOrder,
  validateScaleOrder,
  validateTwapOrder,
} from '../../../src/utils/advancedOrders.js';

// A second venue with other bounds, cadence and chase cap, and no scale: the
// helpers must follow whichever rules the venue reports.
const FAKE_VENUE_CAPABILITIES: PerpsOrderCapabilities = {
  status: 'ready',
  providerId: 'lighter',
  supportedStrategies: ['twap', 'chase'],
  strategyRules: {
    twap: {
      minDurationMinutes: 1,
      maxDurationMinutes: 60,
      minNotionalUsd: 20,
      sliceIntervalSeconds: 10,
    },
    chase: {
      maxActiveSessions: 2,
      defaultIntervalMs: 5000,
      minIntervalMs: 500,
    },
  },
};
const NO_STRATEGY_CAPABILITIES: PerpsOrderCapabilities = {
  status: 'ready',
  providerId: 'lighter',
  supportedStrategies: [],
};
const HL_TWAP = getStrategyRules(HYPERLIQUID_ORDER_CAPABILITIES, 'twap');
const FAKE_TWAP = getStrategyRules(FAKE_VENUE_CAPABILITIES, 'twap');

const fill = (
  fillId: string,
  size: string,
  price: string,
  timestamp = 2_000,
): TwapOrderFill => ({
  fillId,
  orderId: `slice-${fillId}`,
  side: 'buy',
  price,
  size,
  fee: '0',
  feeToken: 'USDC',
  timestamp,
  transactionHash: `0x${fillId}`,
});

const twap = (overrides: Partial<TwapOrder> = {}): TwapOrder => ({
  orderId: '1',
  symbol: 'BTC',
  side: 'buy',
  size: '0.003',
  executedSize: '0',
  remainingSize: '0.003',
  executedNotional: '0',
  fillProgressBps: 0,
  timeProgressBps: 0,
  elapsedTimeMilliseconds: 0,
  durationMinutes: 30,
  randomize: false,
  reduceOnly: false,
  status: 'active',
  startedAt: 1_000,
  lastUpdated: 1_000,
  fills: [],
  ...overrides,
});

const chase = (
  handle: string,
  status: ChaseOrder['status'],
  overrides: Partial<ChaseOrder> = {},
): ChaseOrder => ({
  handle,
  symbol: 'BTC',
  side: 'buy',
  originalSize: '0.01',
  remainingSize: '0.01',
  arrivalPrice: '100000',
  restingPrice: '100050',
  restingOrderId: '77',
  distanceChasedBps: 5,
  repricings: 1,
  startedAt: 1,
  status,
  ...overrides,
});

describe('advancedOrders', () => {
  describe('getStrategyRules', () => {
    it('reads the rules a venue reports for a supported strategy', () => {
      expect(getStrategyRules(FAKE_VENUE_CAPABILITIES, 'chase')).toStrictEqual({
        maxActiveSessions: 2,
        defaultIntervalMs: 5000,
        minIntervalMs: 500,
      });
    });

    it('returns undefined for an unsupported strategy, an unavailable market or missing capabilities', () => {
      expect(
        getStrategyRules(FAKE_VENUE_CAPABILITIES, 'scale'),
      ).toBeUndefined();
      expect(
        getStrategyRules(
          { status: 'unavailable', reason: 'market_not_found' },
          'twap',
        ),
      ).toBeUndefined();
      expect(getStrategyRules(undefined, 'twap')).toBeUndefined();
    });

    it('returns undefined when a supported strategy reports no rules', () => {
      expect(
        getStrategyRules(
          { ...NO_STRATEGY_CAPABILITIES, supportedStrategies: ['twap'] },
          'twap',
        ),
      ).toBeUndefined();
    });
  });

  describe('TWAP', () => {
    it('treats only active schedules as running', () => {
      expect(TWAP_ORDER_ACTIVE_STATUSES).toStrictEqual(['active']);
      expect(isTwapOrderActive({ status: 'active' })).toBe(true);
      expect(isTwapOrderActive({ status: 'completed_underfilled' })).toBe(
        false,
      );
    });

    it('splits active from ended schedules in order', () => {
      const orders = [
        twap({ orderId: 'a', status: 'canceled' }),
        twap({ orderId: 'b' }),
        twap({ orderId: 'c', status: 'failed' }),
      ];

      const { active, ended } = partitionTwapOrders(orders);

      expect(active.map((order) => order.orderId)).toStrictEqual(['b']);
      expect(ended.map((order) => order.orderId)).toStrictEqual(['a', 'c']);
    });

    describe('reconcileTwapExecution', () => {
      it('raises stale venue totals from slice fills', () => {
        expect(
          reconcileTwapExecution(
            twap({
              fills: [
                fill('1', '0.001', '100000'),
                fill('2', '0.001', '101000'),
              ],
            }),
          ),
        ).toMatchObject({
          executedSize: '0.002',
          remainingSize: '0.001',
          executedNotional: '201',
          averagePrice: '100500',
          fillProgressBps: 6666,
        });
      });

      it('never lowers what the venue reported', () => {
        const order = twap({
          executedSize: '0.002',
          executedNotional: '200',
          fills: [fill('1', '0.001', '100000')],
        });

        expect(reconcileTwapExecution(order)).toBe(order);
      });

      it('caps fills above the schedule size and prorates the notional', () => {
        expect(
          reconcileTwapExecution(
            twap({
              size: '0.002',
              fills: [fill('1', '0.002', '100'), fill('2', '0.002', '300')],
            }),
          ),
        ).toMatchObject({
          executedSize: '0.002',
          remainingSize: '0',
          executedNotional: '0.4',
          averagePrice: '200',
          fillProgressBps: 10000,
        });
      });

      it('keeps the schedule when it has no fills, unreadable values or no size', () => {
        const empty = twap();
        const broken = twap({ fills: [fill('1', 'x', '100')] });
        const zeroSize = twap({
          size: '0',
          fills: [fill('1', '0.001', '100')],
        });

        expect(reconcileTwapExecution(empty)).toBe(empty);
        expect(reconcileTwapExecution(broken)).toBe(broken);
        expect(reconcileTwapExecution(zeroSize)).toBe(zeroSize);
      });
    });

    describe('boundTwapExecution', () => {
      it.each([
        ['-1', '0', '10', 0],
        ['2.5', '2.5', '7.5', 2500],
        ['11', '10', '0', 10000],
      ])(
        'bounds %s of 10 to %s executed, %s remaining, %s bps',
        (executed, executedSize, remainingSize, fillProgressBps) => {
          const bounded = boundTwapExecution(
            new BigNumber('10'),
            new BigNumber(executed),
          );

          expect({
            executedSize: bounded.executedSize.toFixed(),
            remainingSize: bounded.remainingSize.toFixed(),
            fillProgressBps: bounded.fillProgressBps,
          }).toStrictEqual({ executedSize, remainingSize, fillProgressBps });
        },
      );

      it('reports no progress for an empty schedule', () => {
        expect(
          boundTwapExecution(new BigNumber(0), new BigNumber(1))
            .fillProgressBps,
        ).toBe(0);
      });
    });

    describe('supersedesTwapOrder', () => {
      it('lets an ended record replace a running one whatever its time', () => {
        expect(
          supersedesTwapOrder(
            { status: 'completed', lastUpdated: 1_000 },
            { status: 'active', lastUpdated: 1_500 },
          ),
        ).toBe(true);
        expect(
          supersedesTwapOrder(
            { status: 'active', lastUpdated: 2_000 },
            { status: 'completed', lastUpdated: 1_000 },
          ),
        ).toBe(false);
      });

      it('otherwise takes only a strictly newer record', () => {
        expect(
          supersedesTwapOrder(
            { status: 'active', lastUpdated: 2_000 },
            { status: 'active', lastUpdated: 1_000 },
          ),
        ).toBe(true);
        expect(
          supersedesTwapOrder(
            { status: 'canceled', lastUpdated: 1_000 },
            { status: 'completed', lastUpdated: 1_000 },
          ),
        ).toBe(false);
      });
    });

    describe('mergeTwapOrders', () => {
      it('unites fills and takes the schedule from the newer record', () => {
        const read = twap({
          lastUpdated: 1_000,
          fills: [fill('1', '0.001', '100000')],
        });
        const pushed = twap({ status: 'canceled', lastUpdated: 2_000 });

        expect(mergeTwapOrders([read], [pushed])).toStrictEqual([
          expect.objectContaining({
            status: 'canceled',
            executedSize: '0.001',
            fills: [read.fills[0]],
          }),
        ]);
      });

      it('keeps an ended schedule over a running record that ties or is newer', () => {
        const ended = twap({ status: 'completed', lastUpdated: 1_000 });

        expect(
          mergeTwapOrders([ended], [twap({ lastUpdated: 1_000 })]),
        ).toMatchObject([{ status: 'completed' }]);
        expect(
          mergeTwapOrders([twap({ lastUpdated: 1_500 })], [ended]),
        ).toMatchObject([{ status: 'completed' }]);
      });

      it('keeps the held schedule when the incoming record is older', () => {
        const held = twap({ status: 'completed', lastUpdated: 3_000 });

        expect(
          mergeTwapOrders([held], [twap({ lastUpdated: 1_000 })]),
        ).toMatchObject([{ status: 'completed' }]);
      });

      it('keeps held records the incoming list omits and sorts newest first', () => {
        const older = twap({ orderId: 'old', startedAt: 1 });
        const newer = twap({ orderId: 'new', startedAt: 2 });
        const otherVenue = twap({
          orderId: 'old',
          startedAt: 3,
          providerId: 'lighter',
        });

        expect(
          mergeTwapOrders([older], [newer, otherVenue]).map((order) => [
            order.providerId,
            order.orderId,
          ]),
        ).toStrictEqual([
          ['lighter', 'old'],
          [undefined, 'new'],
          [undefined, 'old'],
        ]);
      });
    });

    describe('validateTwapOrder', () => {
      it.each([
        [HL_TWAP, 30, '150', { isValid: true }],
        [
          HL_TWAP,
          undefined,
          '150',
          {
            isValid: false,
            error: PERPS_ERROR_CODES.ORDER_TWAP_DURATION_REQUIRED,
          },
        ],
        [
          HL_TWAP,
          4,
          '150',
          {
            isValid: false,
            error: PERPS_ERROR_CODES.ORDER_TWAP_DURATION_INVALID,
          },
        ],
        [
          HL_TWAP,
          1441,
          '150',
          {
            isValid: false,
            error: PERPS_ERROR_CODES.ORDER_TWAP_DURATION_INVALID,
          },
        ],
        [
          HL_TWAP,
          30.5,
          '150',
          {
            isValid: false,
            error: PERPS_ERROR_CODES.ORDER_TWAP_DURATION_INVALID,
          },
        ],
        [
          HL_TWAP,
          30,
          '99.99',
          {
            isValid: false,
            error: PERPS_ERROR_CODES.ORDER_TWAP_NOTIONAL_TOO_SMALL,
          },
        ],
        [
          HL_TWAP,
          30,
          'abc',
          {
            isValid: false,
            error: PERPS_ERROR_CODES.ORDER_TWAP_NOTIONAL_TOO_SMALL,
          },
        ],
        [FAKE_TWAP, 2, '50', { isValid: true }],
        [
          FAKE_TWAP,
          90,
          '50',
          {
            isValid: false,
            error: PERPS_ERROR_CODES.ORDER_TWAP_DURATION_INVALID,
          },
        ],
        [
          FAKE_TWAP,
          2,
          '19',
          {
            isValid: false,
            error: PERPS_ERROR_CODES.ORDER_TWAP_NOTIONAL_TOO_SMALL,
          },
        ],
      ])(
        'judges %o, %s min, $%s against the venue rules',
        (rules, durationMinutes, usdAmount, expected) => {
          expect(
            validateTwapOrder({ rules, durationMinutes, usdAmount }),
          ).toStrictEqual(expected);
        },
      );

      it('skips the minimum while the amount is unknown', () => {
        expect(
          validateTwapOrder({ rules: HL_TWAP, durationMinutes: 30 }),
        ).toStrictEqual({ isValid: true });
      });

      it('reports a venue without TWAP as unsupported', () => {
        expect(
          validateTwapOrder({
            rules: getStrategyRules(NO_STRATEGY_CAPABILITIES, 'twap'),
            durationMinutes: 30,
            usdAmount: '500',
          }),
        ).toStrictEqual({
          isValid: false,
          error: PERPS_ERROR_CODES.ORDER_STRATEGY_MARKET_UNSUPPORTED,
        });
      });
    });

    describe('computeTwapSlicePreview', () => {
      it('cuts the order on each venue cadence and floors to the size grid', () => {
        const input = { durationMinutes: 10, size: '0.0125', sizeDecimals: 4 };

        expect(
          computeTwapSlicePreview({
            ...input,
            rules: HL_TWAP,
            price: '100000',
          }),
        ).toStrictEqual({
          sliceCount: 20,
          sliceIntervalSeconds: 30,
          sizePerSlice: '0.0006',
          sizeDecimals: 4,
          minimumSize: '0.0001',
          isBelowMinimumSize: false,
          notionalPerSlice: '60',
        });
        expect(
          computeTwapSlicePreview({ ...input, rules: FAKE_TWAP }),
        ).toStrictEqual({
          sliceCount: 60,
          sliceIntervalSeconds: 10,
          sizePerSlice: '0.0002',
          sizeDecimals: 4,
          minimumSize: '0.0001',
          isBelowMinimumSize: false,
        });
      });

      it('flags a slice that floors below the size grid', () => {
        expect(
          computeTwapSlicePreview({
            rules: HL_TWAP,
            durationMinutes: 1440,
            size: '0.01',
            sizeDecimals: 3,
          }),
        ).toMatchObject({ sizePerSlice: '0', isBelowMinimumSize: true });
      });

      it.each([
        ['no rules', { rules: undefined }],
        ['no duration', { durationMinutes: undefined }],
        ['a duration shorter than one slice', { durationMinutes: 0.1 }],
        ['no size', { size: undefined }],
        ['a zero size', { size: '0' }],
        ['a negative size grid', { sizeDecimals: -1 }],
      ])('returns undefined for %s', (_label, overrides) => {
        expect(
          computeTwapSlicePreview({
            rules: HL_TWAP,
            durationMinutes: 10,
            size: '1',
            sizeDecimals: 3,
            ...overrides,
          }),
        ).toBeUndefined();
      });
    });
  });

  describe('chase', () => {
    it('lists active and cancel-pending chases as running', () => {
      expect(CHASE_ORDER_RUNNING_STATUSES).toStrictEqual([
        CHASE_ORDER_STATUS.Active,
        CHASE_ORDER_STATUS.TerminationPending,
      ]);
      expect(isChaseOrderRunning(chase('h', 'termination_pending'))).toBe(true);
      expect(isChaseOrderRunning(chase('h', 'duration_reached'))).toBe(false);
    });

    it('offers a cancel while running or while a stopped child still rests', () => {
      expect(isChaseOrderCancelable(chase('h', 'active'))).toBe(true);
      expect(isChaseOrderCancelable(chase('h', 'max_distance_reached'))).toBe(
        true,
      );
      expect(
        isChaseOrderCancelable(chase('h', 'filled', { restingOrderId: null })),
      ).toBe(false);
    });

    describe('checkChasePlacement', () => {
      const orders = [
        chase('h1', 'active'),
        chase('h2', 'termination_pending'),
        chase('h3', 'backgrounded'),
      ];

      it('counts only chasing sessions against the venue cap', () => {
        expect(
          checkChasePlacement({
            rules: getStrategyRules(HYPERLIQUID_ORDER_CAPABILITIES, 'chase'),
            chaseOrders: orders,
          }),
        ).toStrictEqual({
          canPlace: true,
          activeCount: 1,
          maxActiveSessions: 5,
        });
      });

      it('refuses at the cap of the venue in use', () => {
        expect(
          checkChasePlacement({
            rules: getStrategyRules(FAKE_VENUE_CAPABILITIES, 'chase'),
            chaseOrders: [...orders, chase('h4', 'active')],
          }),
        ).toStrictEqual({
          canPlace: false,
          activeCount: 2,
          maxActiveSessions: 2,
          error: PERPS_ERROR_CODES.ORDER_CHASE_LIMIT_REACHED,
        });
      });

      it('allows any count on a venue without a cap', () => {
        expect(
          checkChasePlacement({
            rules: { defaultIntervalMs: 15000, minIntervalMs: 1000 },
            chaseOrders: [chase('h1', 'active'), chase('h2', 'active')],
          }),
        ).toStrictEqual({ canPlace: true, activeCount: 2 });
      });

      it('reports a venue without chase as unsupported', () => {
        expect(
          checkChasePlacement({ rules: undefined, chaseOrders: [] }),
        ).toStrictEqual({
          canPlace: false,
          activeCount: 0,
          error: PERPS_ERROR_CODES.ORDER_STRATEGY_MARKET_UNSUPPORTED,
        });
      });
    });

    describe('mergeChaseOrderHistory', () => {
      it('splits a read into running and history, newest first', () => {
        expect(
          mergeChaseOrderHistory({
            current: [
              chase('a', 'active', { startedAt: 1 }),
              chase('b', 'canceled', { startedAt: 2 }),
              chase('c', 'termination_pending', { startedAt: 3 }),
            ],
          }),
        ).toStrictEqual({
          running: [
            chase('c', 'termination_pending', { startedAt: 3 }),
            chase('a', 'active', { startedAt: 1 }),
          ],
          history: [chase('b', 'canceled', { startedAt: 2 })],
        });
      });

      it('keeps ended chases the provider dropped and drops vanished running ones', () => {
        const previous = mergeChaseOrderHistory({
          current: [chase('a', 'active'), chase('b', 'filled')],
        });

        expect(mergeChaseOrderHistory({ previous, current: [] })).toStrictEqual(
          { running: [], history: [chase('b', 'filled')] },
        );
      });

      it('replaces a history row with its fresher read and bounds history', () => {
        const previous = mergeChaseOrderHistory({
          current: [
            chase('a', 'duration_reached', { startedAt: 1 }),
            chase('b', 'canceled', { startedAt: 2 }),
          ],
        });

        expect(
          mergeChaseOrderHistory({
            previous,
            current: [chase('a', 'canceled', { startedAt: 1 })],
            historyLimit: 1,
          }).history,
        ).toStrictEqual([chase('b', 'canceled', { startedAt: 2 })]);
        expect(
          mergeChaseOrderHistory({
            previous,
            current: [chase('a', 'canceled', { startedAt: 1 })],
          }).history.map((order) => order.status),
        ).toStrictEqual(['canceled', 'canceled']);
      });
    });
  });

  describe('scale', () => {
    const prices = ['99000', '100000', '101000'];

    describe('sizeScaleLadder', () => {
      it('buys the largest grid ladder whose value stays within the USD amount', () => {
        expect(
          sizeScaleLadder({ prices, sizeDecimals: 5, usdAmount: '297.5' }),
        ).toStrictEqual({
          sizes: ['0.00099', '0.00099', '0.00099'],
          totalSize: '0.00297',
          totalNotional: '297',
        });
      });

      it('splits an exact size as given, with skew', () => {
        expect(
          sizeScaleLadder({ prices, sizeDecimals: 3, size: '0.006', skew: 2 }),
        ).toStrictEqual({
          sizes: ['0.001', '0.002', '0.003'],
          totalSize: '0.006',
          totalNotional: '602',
        });
      });

      it.each([
        ['a missing size', { size: '' }, PERPS_ERROR_CODES.ORDER_SIZE_POSITIVE],
        [
          'a zero amount',
          { usdAmount: '0' },
          PERPS_ERROR_CODES.ORDER_SIZE_POSITIVE,
        ],
        [
          'an amount below one grid unit per rung',
          { usdAmount: '1' },
          PERPS_ERROR_CODES.ORDER_SCALE_SIZE_TOO_SMALL,
        ],
        [
          'a skew that starves a rung',
          { size: '0.003', skew: 100 },
          PERPS_ERROR_CODES.ORDER_SCALE_SIZE_TOO_SMALL,
        ],
      ] as const)('refuses %s', (_label, sizing, error) => {
        expect(() =>
          sizeScaleLadder({ prices, sizeDecimals: 3, ...sizing }),
        ).toThrow(error);
      });

      it('skips budgets a heavy skew cannot split onto the grid', () => {
        // Small totals starve the first rung at skew 10, so the search moves
        // past them to the largest ladder that splits and fits.
        expect(
          sizeScaleLadder({
            prices,
            sizeDecimals: 3,
            usdAmount: '1000',
            skew: 10,
          }),
        ).toStrictEqual({
          sizes: ['0.001', '0.003', '0.005'],
          totalSize: '0.009',
          totalNotional: '904',
        });
      });

      it('refuses an amount whose only ladders overshoot it', () => {
        // Three units fit by the lowest price but not at the ladder's prices.
        expect(() =>
          sizeScaleLadder({
            prices: ['1', '1000'],
            sizeDecimals: 0,
            usdAmount: '3',
          }),
        ).toThrow(PERPS_ERROR_CODES.ORDER_SCALE_SIZE_TOO_SMALL);
      });
    });

    describe('validateScaleOrder', () => {
      const rules = getStrategyRules(HYPERLIQUID_ORDER_CAPABILITIES, 'scale');
      const draft = { rules, minPrice: 99000, maxPrice: 101000, count: 3 };

      it('accepts a ladder whose cheapest rung meets the venue minimum', () => {
        expect(
          validateScaleOrder({
            ...draft,
            preview: {
              prices,
              sizes: ['0.0001', '0.0001', '0.0001'],
              minimumQuoteAmount: '9.9',
            },
          }),
        ).toStrictEqual({ isValid: true });
      });

      it.each([
        [
          'no range',
          { minPrice: undefined },
          PERPS_ERROR_CODES.ORDER_SCALE_RANGE_REQUIRED,
        ],
        [
          'an inverted range',
          { minPrice: 102000 },
          PERPS_ERROR_CODES.ORDER_SCALE_RANGE_INVALID,
        ],
        [
          'a zero price',
          { minPrice: 0 },
          PERPS_ERROR_CODES.ORDER_SCALE_RANGE_INVALID,
        ],
        [
          'a non-positive skew',
          { skew: 0 },
          PERPS_ERROR_CODES.ORDER_SCALE_RANGE_INVALID,
        ],
        [
          'too few rungs',
          { count: 1 },
          PERPS_ERROR_CODES.ORDER_SCALE_COUNT_INVALID,
        ],
        [
          'too many rungs',
          { count: 21 },
          PERPS_ERROR_CODES.ORDER_SCALE_COUNT_INVALID,
        ],
        [
          'a rung below the venue minimum',
          {
            preview: {
              prices,
              sizes: ['0.0001', '0.0001', '0.0001'],
              minimumQuoteAmount: '10',
            },
          },
          PERPS_ERROR_CODES.ORDER_SCALE_NOTIONAL_TOO_SMALL,
        ],
        [
          'a venue without scale',
          { rules: undefined },
          PERPS_ERROR_CODES.ORDER_STRATEGY_MARKET_UNSUPPORTED,
        ],
      ] as const)('refuses %s', (_label, overrides, error) => {
        expect(validateScaleOrder({ ...draft, ...overrides })).toStrictEqual({
          isValid: false,
          error,
        });
      });

      it('reports a bad count before a bad skew, as placement does', () => {
        expect(
          validateScaleOrder({ ...draft, count: 1, skew: -1 }),
        ).toStrictEqual({
          isValid: false,
          error: PERPS_ERROR_CODES.ORDER_SCALE_COUNT_INVALID,
        });
      });

      it.each([
        [
          'a preview with fewer sizes than prices',
          { prices, sizes: ['1', '1'], minimumQuoteAmount: '10' },
        ],
        [
          'an unreadable minimum',
          { prices, sizes: ['1', '1', '1'], minimumQuoteAmount: 'n/a' },
        ],
      ])('refuses %s', (_label, preview) => {
        expect(validateScaleOrder({ ...draft, preview })).toStrictEqual({
          isValid: false,
          error: PERPS_ERROR_CODES.ORDER_SCALE_NOTIONAL_TOO_SMALL,
        });
      });

      it('applies the rung bounds the venue reports', () => {
        expect(
          validateScaleOrder({
            ...draft,
            rules: { minOrders: 4, maxOrders: 6 },
          }),
        ).toStrictEqual({
          isValid: false,
          error: PERPS_ERROR_CODES.ORDER_SCALE_COUNT_INVALID,
        });
      });
    });

    describe('classifyScalePriceWarnings', () => {
      // A wide spread, so the bid and ask give different answers.
      const book = { bestBid: '99500', bestAsk: '100500' };

      it.each([
        ['buy', true, ['100500', '101000'], [{ code: 'crosses_market' }]],
        [
          'buy',
          true,
          ['100000', '100500'],
          [{ code: 'partially_crosses_market' }],
        ],
        // Above the bid but below the ask: resting, not crossing.
        ['buy', true, ['99600', '100400'], []],
        ['sell', false, ['99000', '99500'], [{ code: 'crosses_market' }]],
        [
          'sell',
          false,
          ['99500', '100000'],
          [{ code: 'partially_crosses_market' }],
        ],
        ['sell', false, ['99600', '100400'], []],
      ] as const)(
        'checks a %s ladder %o for crossing against the opposite touch',
        (_side, isBuy, ladder, warnings) => {
          expect(
            classifyScalePriceWarnings({ prices: ladder, isBuy, ...book }),
          ).toStrictEqual(warnings);
        },
      );

      it('measures distance from the near touch, rounded up', () => {
        // 89,000 is 10.55% under the bid but 11.44% under the ask.
        expect(
          classifyScalePriceWarnings({
            prices: ['89000', '95000'],
            isBuy: true,
            ...book,
          }),
        ).toStrictEqual([{ code: 'far_from_market', distancePercent: 11 }]);
        // 110,000 is 9.45% over the ask but 10.55% over the bid.
        expect(
          classifyScalePriceWarnings({
            prices: ['105000', '110000'],
            isBuy: false,
            ...book,
          }),
        ).toStrictEqual([{ code: 'far_from_market', distancePercent: 10 }]);
        // 94,600 is 4.92% under the bid, 5.87% under the ask: no warning.
        expect(
          classifyScalePriceWarnings({
            prices: ['94600', '99000'],
            isBuy: true,
            ...book,
          }),
        ).toStrictEqual([]);
      });

      it('gives no distance warning to a reduce-only ladder', () => {
        expect(
          classifyScalePriceWarnings({
            prices: ['50000', '99000'],
            isBuy: true,
            reduceOnly: true,
            ...book,
          }),
        ).toStrictEqual([]);
      });

      it('runs each check only once its touch is known', () => {
        expect(
          classifyScalePriceWarnings({
            prices: ['50000', '101000'],
            isBuy: true,
            bestAsk: '100500',
          }),
        ).toStrictEqual([{ code: 'partially_crosses_market' }]);
        expect(
          classifyScalePriceWarnings({
            prices: ['50000', '101000'],
            isBuy: true,
            bestBid: '0',
          }),
        ).toStrictEqual([]);
      });

      it('returns no warning for an empty or unreadable ladder', () => {
        expect(
          classifyScalePriceWarnings({ prices: [], isBuy: true, ...book }),
        ).toStrictEqual([]);
        expect(
          classifyScalePriceWarnings({
            prices: ['0', '100'],
            isBuy: true,
            ...book,
          }),
        ).toStrictEqual([]);
      });
    });
  });
});
