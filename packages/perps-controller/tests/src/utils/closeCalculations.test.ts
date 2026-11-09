import { describe, expect, it } from 'vitest';

import type { OrderFill, Position } from '../../../src/types/index.js';
import type {
  CloseReceiveEstimate,
  CloseReceiveEstimateParams,
  NetClosedPnlParams,
} from '../../../src/utils/closeCalculations.js';
import {
  calculateNetClosedPnl,
  estimateCloseReceive,
} from '../../../src/utils/closeCalculations.js';
import { adaptPositionFromLighter } from '../../../src/utils/lighterAdapter.js';

// A long of 1 entered at 2,000 and marked at 2,100: its Hyperliquid isolated
// margin of 1,100 holds the 100 of unrealized PnL; cross margin of 1,000 does
// not. Closed at 2,100 with a 0.05% fee rate.
const isolatedLong: CloseReceiveEstimateParams = {
  position: {
    size: '1',
    entryPrice: '2000',
    marginUsed: '1100',
    unrealizedPnl: '100',
    leverage: { type: 'isolated' },
  },
  providerId: 'hyperliquid',
  closeSize: 1,
  price: 2100,
  feeRate: 0.0005,
};
const crossLong: CloseReceiveEstimateParams = {
  ...isolatedLong,
  position: {
    ...isolatedLong.position,
    marginUsed: '1000',
    leverage: { type: 'cross' },
  },
};

function estimate(
  marginReturned: number | undefined,
  realizedPnl: number | undefined,
  fee: number | undefined,
  receive: number | undefined,
): CloseReceiveEstimate {
  return { marginReturned, realizedPnl, fee, receive };
}

// Reference rows. Clients assert the same rows against
// `estimateCloseReceive`; the Terminal rows it replaces are carried over with
// the fee given as a rate.
const CLOSE_RECEIVE_ROWS: {
  close: string;
  params: CloseReceiveEstimateParams;
  expected: CloseReceiveEstimate;
}[] = [
  {
    close: 'a Hyperliquid isolated long in full at a gain',
    params: isolatedLong,
    expected: estimate(1000, 100, 1.05, 1098.95),
  },
  {
    close: 'a Hyperliquid cross long in full at a gain',
    params: crossLong,
    expected: estimate(1000, 100, 1.05, 1098.95),
  },
  {
    close: 'half a Hyperliquid isolated long',
    params: { ...isolatedLong, closeSize: 0.5 },
    expected: estimate(500, 50, 0.525, 549.47),
  },
  {
    close: 'half a Hyperliquid cross long',
    params: { ...crossLong, closeSize: '0.5' },
    expected: estimate(500, 50, 0.525, 549.47),
  },
  {
    close: 'a Hyperliquid isolated long at a loss',
    params: {
      ...isolatedLong,
      position: {
        ...isolatedLong.position,
        marginUsed: '900',
        unrealizedPnl: '-100',
      },
      price: 1900,
    },
    expected: estimate(1000, -100, 0.95, 899.05),
  },
  {
    close: 'a Hyperliquid cross long at a loss',
    params: {
      ...crossLong,
      position: { ...crossLong.position, unrealizedPnl: '-100' },
      price: '1900',
    },
    expected: estimate(1000, -100, 0.95, 899.05),
  },
  {
    close: 'half a 5x Hyperliquid isolated short above its entry',
    params: {
      position: {
        size: '-0.5',
        entryPrice: '100000',
        marginUsed: '9800',
        unrealizedPnl: '-200',
        leverage: { type: 'isolated' },
      },
      providerId: 'hyperliquid',
      closeSize: 0.25,
      price: 100400,
      feeRate: 0.0004,
    },
    expected: estimate(5000, -100, 10.04, 4889.96),
  },
  {
    // Lighter isolated `marginUsed` is required margin, not the collateral.
    close: 'a Lighter isolated long, whose margin returned is unknown',
    params: {
      ...isolatedLong,
      position: { ...isolatedLong.position, marginUsed: '1000' },
      providerId: 'lighter',
    },
    expected: estimate(undefined, 100, 1.05, undefined),
  },
  {
    close: 'a Lighter cross long',
    params: { ...crossLong, providerId: 'lighter' },
    expected: estimate(1000, 100, 1.05, 1098.95),
  },
  {
    close: 'a limit close above the live price',
    params: { ...isolatedLong, price: 2600 },
    expected: estimate(1000, 600, 1.3, 1598.7),
  },
  {
    // The closed share of a 2x long's margin, not its notional of 12.
    close: 'part of a 2x Hyperliquid isolated long',
    params: {
      position: {
        size: '0.008',
        entryPrice: '2497.6',
        marginUsed: '9.966189',
        unrealizedPnl: '0.0044',
        leverage: { type: 'isolated' },
      },
      providerId: 'hyperliquid',
      closeSize: 0.0048,
      price: 2500,
      feeRate: 0.00145,
    },
    expected: estimate(5.9770734, 0.01152, 0.0174, 5.97),
  },
  {
    // Margin with its PnL, 62.4375, shows as 62.44; less the 0.01 fee, 62.43.
    // Rounding margin and PnL apart would give 62.56 - 0.13 - 0.01 = 62.42.
    close: 'with a negative half cent of PnL',
    params: {
      position: {
        size: '1',
        entryPrice: '1001',
        marginUsed: '499.5',
        unrealizedPnl: '-1',
        leverage: { type: 'isolated' },
      },
      providerId: 'hyperliquid',
      closeSize: 0.125,
      price: 1000,
      feeRate: 0.00008,
    },
    expected: estimate(62.5625, -0.125, 0.01, 62.43),
  },
  {
    // Margin 2.675 shows as 2.68.
    close: 'with half a cent of margin',
    params: {
      position: {
        size: '1',
        entryPrice: '100',
        marginUsed: '3.675',
        unrealizedPnl: '1',
        leverage: { type: 'isolated' },
      },
      providerId: 'hyperliquid',
      closeSize: 1,
      price: 100,
      feeRate: 0,
    },
    expected: estimate(2.675, 0, 0, 2.68),
  },
  {
    // Margin with its PnL, 8.995, shows as 9.00; Math.round(x * 100) / 100
    // gives 8.99.
    close: 'with half a cent of margin after a loss',
    params: {
      position: {
        size: '1',
        entryPrice: '2.005',
        marginUsed: '10',
        unrealizedPnl: '0',
        leverage: { type: 'isolated' },
      },
      providerId: 'hyperliquid',
      closeSize: 1,
      price: 1,
      feeRate: 0,
    },
    expected: estimate(10, -1.005, 0, 9),
  },
  {
    // A rebate of half a cent shows as -0.01, away from zero.
    close: 'with a maker rebate of half a cent',
    params: {
      position: {
        size: '1',
        entryPrice: '50',
        marginUsed: '10',
        unrealizedPnl: '0',
        leverage: { type: 'isolated' },
      },
      providerId: 'hyperliquid',
      closeSize: 1,
      price: 50,
      feeRate: -0.0001,
    },
    expected: estimate(10, 0, -0.005, 10.01),
  },
];

// Reference rows. Clients assert the same rows against
// `calculateNetClosedPnl`.
const NET_CLOSED_PNL_ROWS: {
  fill: string;
  params: NetClosedPnlParams;
  expected: number;
}[] = [
  {
    fill: 'a gain',
    params: { pnl: '1234.56789', fee: '0.1' },
    expected: 1234.46789,
  },
  { fill: 'a loss', params: { pnl: '-5.5', fee: '0.25' }, expected: -5.75 },
  {
    fill: 'a break-even made a loss by its fee',
    params: { pnl: '0', fee: '0.1' },
    expected: -0.1,
  },
  {
    fill: 'a maker rebate',
    params: { pnl: '10', fee: '-0.02' },
    expected: 10.02,
  },
  { fill: 'numeric figures', params: { pnl: 0.3, fee: 0.1 }, expected: 0.2 },
];

describe('estimateCloseReceive', () => {
  it.each(CLOSE_RECEIVE_ROWS)(
    'estimates closing $close',
    ({ params, expected }) => {
      expect(estimateCloseReceive(params)).toStrictEqual(expected);
    },
  );

  it('takes a Position as-is', () => {
    const position: Position = {
      symbol: 'ETH',
      size: '1',
      entryPrice: '2000',
      positionValue: '2100',
      unrealizedPnl: '100',
      marginUsed: '1100',
      leverage: { type: 'isolated', value: 2, rawUsd: '1000' },
      liquidationPrice: '1100',
      maxLeverage: 25,
      returnOnEquity: '0.1',
      cumulativeFunding: { allTime: '0', sinceOpen: '0', sinceChange: '0' },
      takeProfitCount: 0,
      stopLossCount: 0,
      providerId: 'hyperliquid',
    };

    expect(
      estimateCloseReceive({
        position,
        providerId: 'hyperliquid',
        closeSize: 1,
        price: 2100,
        feeRate: 0.0005,
      }),
    ).toStrictEqual(estimate(1000, 100, 1.05, 1098.95));
  });

  it('subtracts unrealized PnL only from Hyperliquid isolated margin', () => {
    const sameMargin = {
      ...isolatedLong.position,
      marginUsed: '1100',
    };

    expect(
      estimateCloseReceive({ ...isolatedLong, position: sameMargin })
        .marginReturned,
    ).toBe(1000);
    expect(
      estimateCloseReceive({
        ...isolatedLong,
        position: { ...sameMargin, leverage: { type: 'cross' } },
      }).marginReturned,
    ).toBe(1100);
    expect(
      estimateCloseReceive({
        ...isolatedLong,
        position: { ...sameMargin, leverage: { type: 'cross' } },
        providerId: 'lighter',
      }).marginReturned,
    ).toBe(1100);
  });

  it('leaves a Lighter isolated close unknown when required and allocated margin differ', () => {
    // Entered at 2,000, marked at 2,100, 20% initial margin fraction and 1,000
    // of allocated collateral: the adapter reports the required 420 as
    // `marginUsed`, so 420 + 100 would understate the cash by 580.
    const position = adaptPositionFromLighter({
      marketId: 0,
      symbol: 'ETH',
      initialMarginFraction: '20',
      openOrderCount: 0,
      allocatedMargin: '1000',
      marginMode: 1,
      sign: 1,
      position: '1',
      avgEntryPrice: '2000',
      positionValue: '2100',
      unrealizedPnl: '100',
      realizedPnl: '0',
      liquidationPrice: '0',
    });

    expect(position.marginUsed).toBe('420');
    expect(
      estimateCloseReceive({
        position,
        providerId: 'lighter',
        closeSize: 1,
        price: 2100,
        feeRate: 0,
      }),
    ).toStrictEqual(estimate(undefined, 100, 0, undefined));
  });

  it('leaves isolated margin returned undefined for an unknown provider', () => {
    const providerId = 'unknown';

    expect(
      // @ts-expect-error 'unknown' is not assignable to PerpsProviderType.
      estimateCloseReceive({ ...isolatedLong, providerId }),
    ).toStrictEqual(estimate(undefined, 100, 1.05, undefined));
    expect(
      // @ts-expect-error 'unknown' is not assignable to PerpsProviderType.
      estimateCloseReceive({ ...crossLong, providerId }),
    ).toStrictEqual(estimate(1000, 100, 1.05, 1098.95));
  });

  it('closes the whole position for a close size above it', () => {
    const position = { ...crossLong.position, size: '-0.007' };
    const whole = estimateCloseReceive({
      ...crossLong,
      position,
      closeSize: 0.007,
    });

    expect(
      estimateCloseReceive({ ...crossLong, position, closeSize: 1 }),
    ).toStrictEqual(whole);
    // 100% of 0.007, as 0.007 * 100 / 100, is 0.007000000000000001.
    expect(
      estimateCloseReceive({
        ...crossLong,
        position,
        closeSize: (0.007 * 100) / 100,
      }),
    ).toStrictEqual(whole);
    expect(whole.marginReturned).toBe(1000);
  });

  it('charges the fee at the supplied rate on the closed notional', () => {
    const taker = estimateCloseReceive({ ...isolatedLong, feeRate: 0.00145 });
    const maker = estimateCloseReceive({ ...isolatedLong, feeRate: 0.00115 });
    const rebate = estimateCloseReceive({ ...isolatedLong, feeRate: -0.0001 });

    expect(taker.fee).toBe(3.045);
    expect(taker.receive).toBe(1096.95);
    expect(maker.fee).toBe(2.415);
    expect(maker.receive).toBe(1097.58);
    expect(rebate.fee).toBe(-0.21);
    expect(rebate.receive).toBe(1100.21);
  });

  it.each([
    [
      'no fee rate',
      { feeRate: undefined },
      estimate(1000, 100, undefined, undefined),
    ],
    [
      'a non-finite fee rate',
      { feeRate: Number.NaN },
      estimate(1000, 100, undefined, undefined),
    ],
    [
      'no price',
      { price: undefined },
      estimate(1000, undefined, undefined, undefined),
    ],
    [
      'a zero price',
      { price: 0 },
      estimate(1000, undefined, undefined, undefined),
    ],
    [
      'an unreadable price',
      { price: 'abc' },
      estimate(1000, undefined, undefined, undefined),
    ],
    [
      'a zero close size',
      { closeSize: 0 },
      estimate(undefined, undefined, undefined, undefined),
    ],
    [
      'a negative close size',
      { closeSize: -1 },
      estimate(undefined, undefined, undefined, undefined),
    ],
    [
      'an empty close size',
      { closeSize: '' },
      estimate(undefined, undefined, undefined, undefined),
    ],
  ] as const)(
    'leaves what needs it undefined for %s',
    (_input, override, expected) => {
      expect(
        estimateCloseReceive({ ...isolatedLong, ...override }),
      ).toStrictEqual(expected);
    },
  );

  it.each([
    [
      'an empty margin',
      { marginUsed: '' },
      estimate(undefined, 100, 1.05, undefined),
    ],
    [
      'an empty unrealized PnL held in isolated margin',
      { unrealizedPnl: '' },
      estimate(undefined, 100, 1.05, undefined),
    ],
    [
      'an empty entry price',
      { entryPrice: '' },
      estimate(1000, undefined, 1.05, undefined),
    ],
    [
      'a zero entry price',
      { entryPrice: '0' },
      estimate(1000, undefined, 1.05, undefined),
    ],
    [
      'a zero position size',
      { size: '0' },
      estimate(undefined, undefined, 1.05, undefined),
    ],
    [
      'an unreadable position size',
      { size: 'abc' },
      estimate(undefined, undefined, 1.05, undefined),
    ],
  ] as const)(
    'leaves what needs it undefined for a position with %s',
    (_input, override, expected) => {
      expect(
        estimateCloseReceive({
          ...isolatedLong,
          position: { ...isolatedLong.position, ...override },
        }),
      ).toStrictEqual(expected);
    },
  );

  it('gives a short closed at its entry a PnL of 0, not -0', () => {
    const { realizedPnl } = estimateCloseReceive({
      ...isolatedLong,
      position: {
        ...isolatedLong.position,
        size: '-1',
        unrealizedPnl: '0',
      },
      price: 2000,
    });

    expect(Object.is(realizedPnl, 0)).toBe(true);
  });

  it('does not need unrealized PnL for margin that does not hold it', () => {
    expect(
      estimateCloseReceive({
        ...crossLong,
        position: { ...crossLong.position, unrealizedPnl: '' },
      }),
    ).toStrictEqual(estimate(1000, 100, 1.05, 1098.95));
  });
});

describe('calculateNetClosedPnl', () => {
  it.each(NET_CLOSED_PNL_ROWS)(
    'nets the fee from $fill',
    ({ params, expected }) => {
      expect(calculateNetClosedPnl(params)).toBe(expected);
    },
  );

  it('takes an OrderFill as-is', () => {
    const fill: OrderFill = {
      orderId: '1',
      symbol: 'ETH',
      side: 'sell',
      size: '0.5',
      price: '2100',
      pnl: '50',
      direction: 'Close Long',
      fee: '0.4725',
      feeToken: 'USDC',
      timestamp: 0,
    };

    expect(calculateNetClosedPnl(fill)).toBe(49.5275);
  });

  it.each([
    ['no PnL', { fee: '0.1' }],
    ['an empty PnL', { pnl: '', fee: '0.1' }],
    ['an unreadable PnL', { pnl: 'abc', fee: '0.1' }],
    ['no fee', { pnl: '10' }],
    ['an empty fee', { pnl: '10', fee: '' }],
    ['a non-finite fee', { pnl: '10', fee: Number.POSITIVE_INFINITY }],
  ] as const)('is undefined for %s, never 0', (_input, params) => {
    expect(calculateNetClosedPnl(params)).toBeUndefined();
  });
});
