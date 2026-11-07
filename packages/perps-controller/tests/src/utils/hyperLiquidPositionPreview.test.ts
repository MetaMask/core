import { describe, expect, it } from 'vitest';

import type {
  PositionModifyPreviewSource,
  PositionPreviewValue,
} from '../../../src/types/index.js';
import type {
  IsolatedLeverageChange,
  IsolatedLeverageChangeParams,
} from '../../../src/utils/hyperLiquidPositionPreview.js';
import {
  buildMaintenanceSchedule,
  estimateIsolatedLeverageChange,
  estimateIsolatedLiquidationPrice,
  estimateIsolatedLiquidationPriceAtTier,
  previewHyperLiquidIsolatedPositionModify,
  resolveHyperLiquidMarginTiers,
} from '../../../src/utils/hyperLiquidPositionPreview.js';

const isolatedPosition = (
  overrides: Partial<PositionModifyPreviewSource> = {},
): PositionModifyPreviewSource => ({
  symbol: 'ETH',
  size: '1',
  entryPrice: '2000',
  positionValue: '2000',
  marginUsed: '400',
  leverage: { type: 'isolated', value: 5 },
  liquidationPrice: '1640',
  maxLeverage: 25,
  ...overrides,
});

const singleTier25x = [{ lowerBound: 0, maxLeverage: 25 }];

const availablePreviewValue = (preview: PositionPreviewValue): number => {
  expect(preview.available).toBe(true);
  if (!preview.available) {
    throw new Error('Expected an available preview value');
  }
  return preview.value;
};

/** Testnet ETH maintenance tiers. */
const testnetEthTiers = [
  { lowerBound: 0, maxLeverage: 25 },
  { lowerBound: 20_000, maxLeverage: 10 },
  { lowerBound: 50_000, maxLeverage: 5 },
  { lowerBound: 200_000, maxLeverage: 3 },
];

describe('resolveHyperLiquidMarginTiers', () => {
  it('treats table ids below 50 as a single tier', () => {
    expect(
      resolveHyperLiquidMarginTiers({
        marginTableId: 25,
        maxLeverage: 25,
        marginTables: [],
      }),
    ).toStrictEqual([{ lowerBound: 0, maxLeverage: 25 }]);
  });

  it('returns the matching multi-tier table', () => {
    expect(
      resolveHyperLiquidMarginTiers({
        marginTableId: 50,
        maxLeverage: 25,
        marginTables: [
          [
            50,
            {
              marginTiers: [
                { lowerBound: '0', maxLeverage: 25 },
                { lowerBound: '20000', maxLeverage: 10 },
              ],
            },
          ],
        ],
      }),
    ).toStrictEqual([
      { lowerBound: 0, maxLeverage: 25 },
      { lowerBound: 20_000, maxLeverage: 10 },
    ]);
  });

  it('returns null when the margin-table id is unknown', () => {
    expect(
      resolveHyperLiquidMarginTiers({
        maxLeverage: 25,
        marginTables: [],
      }),
    ).toBeNull();
  });

  it('returns null when a multi-tier table is required but missing', () => {
    expect(
      resolveHyperLiquidMarginTiers({
        marginTableId: 50,
        maxLeverage: 25,
        marginTables: [],
      }),
    ).toBeNull();
  });
});

describe('buildMaintenanceSchedule', () => {
  it('applies the HyperLiquid maintenance deduction at each tier', () => {
    const schedule = buildMaintenanceSchedule(testnetEthTiers);

    expect(schedule[0]).toMatchObject({
      lowerBound: 0,
      upperBound: 20_000,
      maintenanceMarginRate: 1 / 50,
      maintenanceDeduction: 0,
    });
    expect(schedule[1].maintenanceMarginRate).toBeCloseTo(1 / 20);
    expect(schedule[1].maintenanceDeduction).toBeCloseTo(
      20_000 * (1 / 20 - 1 / 50),
    );
  });
});

describe('estimateIsolatedLiquidationPrice', () => {
  it('matches the single-tier closed form for a long', () => {
    const liq = estimateIsolatedLiquidationPrice({
      isLong: true,
      markPrice: 2000,
      margin: 400,
      positionSize: 1,
      maintenanceMarginRate: 1 / 50,
    });

    expect(liq).toBeCloseTo((2000 - 400) / (1 - 1 / 50));
  });

  it('matches the single-tier closed form for a short', () => {
    const liq = estimateIsolatedLiquidationPrice({
      isLong: false,
      markPrice: 2000,
      margin: 400,
      positionSize: 1,
      maintenanceMarginRate: 1 / 50,
    });

    expect(liq).toBeCloseTo((2000 + 400) / (1 + 1 / 50));
  });
});

describe('previewHyperLiquidIsolatedPositionModify', () => {
  it('returns unsupported for cross-margin positions', () => {
    const result = previewHyperLiquidIsolatedPositionModify({
      position: isolatedPosition({
        leverage: { type: 'cross', value: 5 },
      }),
      direction: 'long',
      size: '0.5',
      price: '2000',
      leverage: 5,
      marginTiers: singleTier25x,
    });

    expect(result).toStrictEqual({
      status: 'unsupported',
      reason: 'cross_margin',
    });
  });

  it('returns none when there is no order size', () => {
    const result = previewHyperLiquidIsolatedPositionModify({
      position: isolatedPosition(),
      direction: 'long',
      size: '0',
      price: '2000',
      leverage: 5,
      marginTiers: singleTier25x,
    });

    expect(result.status).toBe('none');
  });

  it('projects an isolated increase at the current leverage', () => {
    const result = previewHyperLiquidIsolatedPositionModify({
      position: isolatedPosition(),
      direction: 'long',
      size: '0.5',
      price: '2000',
      leverage: 5,
      marginTiers: singleTier25x,
    });

    expect(result.status).toBe('open');
    if (result.status !== 'open') {
      return;
    }
    expect(result.kind).toBe('increase');
    expect(result.resulting.direction).toBe('long');
    expect(result.resulting.size).toBeCloseTo(1.5);
    expect(result.resulting.entryPrice).toBeCloseTo(2000);
    expect(result.resulting.margin).toStrictEqual({
      available: true,
      value: 600,
    });
    expect(result.resulting.leverage).toBeCloseTo(5);
  });

  it('deducts fees from isolated margin on an increase', () => {
    const result = previewHyperLiquidIsolatedPositionModify({
      position: isolatedPosition(),
      direction: 'long',
      size: '0.5',
      price: '2000',
      leverage: 5,
      feeAmountUsd: 2,
      marginTiers: singleTier25x,
    });

    expect(result.status).toBe('open');
    if (result.status !== 'open') {
      return;
    }
    expect(result.resulting.margin).toStrictEqual({
      available: true,
      value: 598,
    });
  });

  it('keeps the existing isolated margin when order leverage is higher', () => {
    const result = previewHyperLiquidIsolatedPositionModify({
      position: isolatedPosition(),
      direction: 'long',
      size: '0.5',
      price: '2000',
      leverage: 10,
      marginTiers: singleTier25x,
    });

    expect(result.status).toBe('open');
    if (result.status !== 'open') {
      return;
    }
    expect(result.kind).toBe('increase');
    // The venue keeps the existing $400 when leverage rises; the order adds
    // only its own $100 at 10x.
    expect(result.resulting.margin).toStrictEqual({
      available: true,
      value: 500,
    });
    // 3,000 of notional on 500 of margin.
    expect(result.resulting.leverage).toBeCloseTo(6);
    // (2000 - 500/1.5) / (1 - 1/50)
    expect(
      availablePreviewValue(result.resulting.liquidationPrice),
    ).toBeCloseTo(1700.6802721088);
  });

  it('matches the venue margin after a leverage rise and a second order', () => {
    // Hyperliquid testnet: a 0.00014 BTC isolated short at 2x, raised to 3x,
    // then a second 0.00014 short filled at 76,148 with a 0.015265 fee. The
    // venue then held 8.869557 of margin with liquidation at 106,493.8166:
    // the kept 5.331249 (marked at 76,148), plus 10.66072 / 3, less the fee.
    // Re-margining the whole position would give 21.32144 / 3 - fee = 7.09.
    const result = previewHyperLiquidIsolatedPositionModify({
      position: isolatedPosition({
        size: '-0.00014',
        entryPrice: '76225',
        positionValue: '10.66072',
        marginUsed: '5.331249',
        leverage: { type: 'isolated', value: 2 },
        liquidationPrice: '112818.1234567901',
        maxLeverage: 40,
      }),
      direction: 'short',
      size: '0.00014',
      price: '76148',
      leverage: 3,
      feeAmountUsd: 0.015265,
      marginTiers: [{ lowerBound: 0, maxLeverage: 40 }],
    });

    expect(result).toMatchObject({
      status: 'open',
      resulting: {
        size: expect.closeTo(0.00028, 10),
        entryPrice: expect.closeTo(76186.5, 6),
        margin: { available: true, value: expect.closeTo(8.869557, 6) },
        liquidationPrice: {
          available: true,
          value: expect.closeTo(106493.8166, 2),
        },
      },
    });
  });

  it('keeps margin above the initial margin at a lower order leverage', () => {
    const result = previewHyperLiquidIsolatedPositionModify({
      position: isolatedPosition({ marginUsed: '1200' }),
      direction: 'long',
      size: '0.5',
      price: '2000',
      leverage: 4,
      marginTiers: singleTier25x,
    });

    // $1,200 covers $2,000 at 4x and stays; the order adds $250.
    expect(result).toMatchObject({
      status: 'open',
      resulting: {
        margin: { available: true, value: 1450 },
        leverage: expect.closeTo(3000 / 1450),
      },
    });
  });

  it('keeps the existing margin at a lower order leverage it exactly covers', () => {
    const result = previewHyperLiquidIsolatedPositionModify({
      position: isolatedPosition({
        leverage: { type: 'isolated', value: 10 },
        marginUsed: '400',
      }),
      direction: 'long',
      size: '0.5',
      price: '2000',
      leverage: 5,
      marginTiers: singleTier25x,
    });

    // $400 is exactly $2,000 at 5x; the order adds $200.
    expect(result).toMatchObject({
      status: 'open',
      resulting: {
        margin: { available: true, value: 600 },
        leverage: expect.closeTo(5),
      },
    });
  });

  it('reports mark-based leverage when entry differs from mark after a leverage change', () => {
    const result = previewHyperLiquidIsolatedPositionModify({
      position: isolatedPosition({
        entryPrice: '2000',
        positionValue: '2500',
        marginUsed: '500',
      }),
      direction: 'long',
      size: '0.5',
      price: '2500',
      leverage: 10,
      marginTiers: singleTier25x,
    });

    expect(result.status).toBe('open');
    if (result.status !== 'open') {
      return;
    }
    // The $500 is kept and the order adds $125 at 10x.
    expect(result.resulting.margin).toStrictEqual({
      available: true,
      value: 625,
    });
    // 3,750 of notional at mark on 625 of margin.
    expect(result.resulting.leverage).toBeCloseTo(6);
    expect(result.resulting.entryPrice).toBeCloseTo(2166.6666667);
    // Mark-based liq: (2500 - 625/1.5) / (1 - 1/50) = 2125.850...
    // Entry-based liq would be ~1785.71 and is wrong for TP/SL.
    expect(
      availablePreviewValue(result.resulting.liquidationPrice),
    ).toBeCloseTo(2125.8503401361);
  });

  it('projects a partial decrease using the remaining position direction', () => {
    const result = previewHyperLiquidIsolatedPositionModify({
      position: isolatedPosition(),
      direction: 'short',
      size: '0.4',
      price: '2000',
      leverage: 5,
      reduceOnly: true,
      marginTiers: singleTier25x,
    });

    expect(result.status).toBe('open');
    if (result.status !== 'open') {
      return;
    }
    expect(result.kind).toBe('decrease');
    expect(result.resulting.direction).toBe('long');
    expect(result.resulting.size).toBeCloseTo(0.6);
    expect(result.resulting.entryPrice).toBeCloseTo(2000);
    expect(result.resulting.margin).toStrictEqual({
      available: true,
      value: 240,
    });
  });

  it('marks a partial decrease at the expected fill, not live mark', () => {
    const result = previewHyperLiquidIsolatedPositionModify({
      position: isolatedPosition(),
      direction: 'short',
      size: '0.4',
      price: '1800',
      leverage: 5,
      reduceOnly: true,
      marginTiers: singleTier25x,
    });

    expect(result.status).toBe('open');
    if (result.status !== 'open') {
      return;
    }
    expect(result.kind).toBe('decrease');
    expect(result.resulting.size).toBeCloseTo(0.6);
    expect(result.resulting.margin).toStrictEqual({
      available: true,
      value: 240,
    });
    // Remaining 0.6 marked at 1800 → notional 1080 / margin 240 = 4.5x.
    expect(result.resulting.leverage).toBeCloseTo(4.5);
    // (1800 - 240/0.6) / (1 - 1/50) = 1428.571...
    expect(
      availablePreviewValue(result.resulting.liquidationPrice),
    ).toBeCloseTo(1428.5714285714);
  });

  it('keeps the margin share before a partial decrease at higher leverage', () => {
    const result = previewHyperLiquidIsolatedPositionModify({
      position: isolatedPosition(),
      direction: 'short',
      size: '0.4',
      price: '2000',
      leverage: 10,
      marginTiers: singleTier25x,
    });

    expect(result.status).toBe('open');
    if (result.status !== 'open') {
      return;
    }
    // 60% of the kept $400.
    expect(result.resulting.margin).toStrictEqual({
      available: true,
      value: 240,
    });
    expect(result.resulting.direction).toBe('long');
  });

  it('projects a flip leftover at the selected leverage and order direction', () => {
    const result = previewHyperLiquidIsolatedPositionModify({
      position: isolatedPosition(),
      direction: 'short',
      size: '1.5',
      price: '2000',
      leverage: 10,
      marginTiers: singleTier25x,
    });

    expect(result.status).toBe('open');
    if (result.status !== 'open') {
      return;
    }
    expect(result.kind).toBe('flip');
    expect(result.resulting.direction).toBe('short');
    expect(result.resulting.size).toBeCloseTo(0.5);
    expect(result.resulting.entryPrice).toBeCloseTo(2000);
    expect(result.resulting.margin).toStrictEqual({
      available: true,
      value: 100,
    });
  });

  it('returns full_close without a remaining size', () => {
    const result = previewHyperLiquidIsolatedPositionModify({
      position: isolatedPosition(),
      direction: 'short',
      size: '1',
      price: '2000',
      leverage: 5,
      reduceOnly: true,
      marginTiers: singleTier25x,
    });

    expect(result).toStrictEqual({
      status: 'full_close',
      current: {
        margin: { available: true, value: 400 },
        liquidationPrice: { available: true, value: 1640 },
      },
      resultingDirection: 'long',
    });
  });

  it('treats a reduce-only overshoot as a full close rather than a flip', () => {
    const result = previewHyperLiquidIsolatedPositionModify({
      position: isolatedPosition(),
      direction: 'short',
      size: '2',
      price: '2000',
      leverage: 5,
      reduceOnly: true,
      marginTiers: singleTier25x,
    });

    expect(result.status).toBe('full_close');
  });

  it('keeps margin available when the live liquidation price is missing', () => {
    const result = previewHyperLiquidIsolatedPositionModify({
      position: isolatedPosition({ liquidationPrice: null }),
      direction: 'long',
      size: '0.5',
      price: '2000',
      leverage: 5,
      marginTiers: singleTier25x,
    });

    expect(result.status).toBe('open');
    if (result.status !== 'open') {
      return;
    }
    expect(result.current.liquidationPrice).toStrictEqual({
      available: false,
    });
    expect(result.current.margin).toStrictEqual({
      available: true,
      value: 400,
    });
    expect(result.resulting.margin.available).toBe(true);
    expect(result.resulting.liquidationPrice.available).toBe(true);
  });

  it('withholds liquidation and keeps margin when tier data is missing', () => {
    const result = previewHyperLiquidIsolatedPositionModify({
      position: isolatedPosition(),
      direction: 'long',
      size: '0.5',
      price: '2000',
      leverage: 5,
      marginTiers: null,
    });

    expect(result.status).toBe('open');
    if (result.status !== 'open') {
      return;
    }
    expect(result.resulting.margin).toStrictEqual({
      available: true,
      value: 600,
    });
    expect(result.resulting.liquidationPrice).toStrictEqual({
      available: false,
    });
  });

  it('uses the maintenance tier at liquidation notional, including the deduction', () => {
    const result = previewHyperLiquidIsolatedPositionModify({
      position: isolatedPosition({
        size: '20',
        entryPrice: '2500',
        positionValue: '50000',
        marginUsed: '5000',
        leverage: { type: 'isolated', value: 10 },
        liquidationPrice: '2200',
      }),
      direction: 'long',
      size: '0.0001',
      price: '2500',
      leverage: 10,
      marginTiers: testnetEthTiers,
    });

    expect(result.status).toBe('open');
    if (result.status !== 'open') {
      return;
    }

    const expected = estimateIsolatedLiquidationPriceAtTier({
      isLong: true,
      markPrice: 2500,
      margin: result.resulting.margin.available
        ? result.resulting.margin.value
        : 0,
      positionSize: result.resulting.size,
      marginTiers: testnetEthTiers,
    });
    const singleTier = estimateIsolatedLiquidationPrice({
      isLong: true,
      markPrice: 2500,
      margin: result.resulting.margin.available
        ? result.resulting.margin.value
        : 0,
      positionSize: result.resulting.size,
      maintenanceMarginRate: 1 / 50,
    });

    expect(result.resulting.liquidationPrice.available).toBe(true);
    const liquidationPrice = availablePreviewValue(
      result.resulting.liquidationPrice,
    );
    expect(expected).not.toBeNull();
    expect(singleTier).not.toBeNull();
    expect(liquidationPrice).toBeCloseTo(expected ?? 0);
    expect(liquidationPrice).toBeGreaterThan(singleTier ?? 0);
  });

  it('averages entry and posts order margin at a limit price away from entry', () => {
    const result = previewHyperLiquidIsolatedPositionModify({
      position: isolatedPosition(),
      direction: 'long',
      size: '1',
      price: '1800',
      leverage: 5,
      marginTiers: singleTier25x,
    });

    expect(result.status).toBe('open');
    if (result.status !== 'open') {
      return;
    }
    expect(result.kind).toBe('increase');
    expect(result.resulting.size).toBeCloseTo(2);
    expect(result.resulting.entryPrice).toBeCloseTo(1900);
    // Existing $400 at 5x plus 1 * 1800 / 5 = $360.
    expect(result.resulting.margin).toStrictEqual({
      available: true,
      value: 760,
    });
    // After fill the whole position is marked at 1800, not live mark plus fill.
    expect(result.resulting.leverage).toBeCloseTo(3600 / 760);
  });

  it('does not project an increase or flip when the fill price is missing', () => {
    const increase = previewHyperLiquidIsolatedPositionModify({
      position: isolatedPosition(),
      direction: 'long',
      size: '0.5',
      price: '0',
      leverage: 5,
      marginTiers: singleTier25x,
    });
    const flip = previewHyperLiquidIsolatedPositionModify({
      position: isolatedPosition(),
      direction: 'short',
      size: '1.5',
      price: '',
      leverage: 5,
      marginTiers: singleTier25x,
    });

    expect(increase.status).toBe('none');
    expect(flip.status).toBe('none');
  });

  it('still projects a reduce when the fill price is missing', () => {
    const result = previewHyperLiquidIsolatedPositionModify({
      position: isolatedPosition(),
      direction: 'short',
      size: '0.4',
      price: '0',
      leverage: 5,
      marginTiers: singleTier25x,
    });

    expect(result.status).toBe('open');
    if (result.status !== 'open') {
      return;
    }
    expect(result.kind).toBe('decrease');
    expect(result.resulting.direction).toBe('long');
  });

  it('does not treat a same-direction reduce-only order as a decrease', () => {
    const result = previewHyperLiquidIsolatedPositionModify({
      position: isolatedPosition(),
      direction: 'long',
      size: '0.4',
      price: '2000',
      leverage: 5,
      reduceOnly: true,
      marginTiers: singleTier25x,
    });

    expect(result.status).toBe('none');
  });

  it('keeps extra isolated margin when leverage is unchanged', () => {
    const result = previewHyperLiquidIsolatedPositionModify({
      position: isolatedPosition({ marginUsed: '800' }),
      direction: 'long',
      size: '0.5',
      price: '2000',
      leverage: 5,
      marginTiers: singleTier25x,
    });

    expect(result.status).toBe('open');
    if (result.status !== 'open') {
      return;
    }
    expect(result.resulting.margin).toStrictEqual({
      available: true,
      value: 1000,
    });
  });

  it('keeps extra isolated margin when leverage increases', () => {
    const result = previewHyperLiquidIsolatedPositionModify({
      position: isolatedPosition({ marginUsed: '800' }),
      direction: 'long',
      size: '0.5',
      price: '2000',
      leverage: 10,
      marginTiers: singleTier25x,
    });

    expect(result.status).toBe('open');
    if (result.status !== 'open') {
      return;
    }
    // The venue keeps all $800; the order adds $100 at 10x.
    expect(result.resulting.margin).toStrictEqual({
      available: true,
      value: 900,
    });
  });

  it.each([
    ['an increase', 'long', '0.5'],
    ['a decrease', 'short', '0.4'],
    ['a flip', 'short', '1.5'],
  ] as const)(
    'withholds margin and liquidation for %s at a lower leverage the margin cannot cover',
    (_kind, direction, size) => {
      // $2,000 at 5x needs $400 and the position holds $200, so Hyperliquid
      // rejects the leverage decrease the provider sends before the order.
      const result = previewHyperLiquidIsolatedPositionModify({
        position: isolatedPosition({
          leverage: { type: 'isolated', value: 10 },
          marginUsed: '200',
        }),
        direction,
        size,
        price: '2000',
        leverage: 5,
        marginTiers: singleTier25x,
      });

      expect(result).toMatchObject({
        status: 'open',
        resulting: {
          leverage: 5,
          margin: { available: false },
          liquidationPrice: { available: false },
        },
      });
    },
  );

  it('projects a short increase, keeping liquidation above entry', () => {
    const result = previewHyperLiquidIsolatedPositionModify({
      position: isolatedPosition({
        size: '-1',
        liquidationPrice: '2360',
      }),
      direction: 'short',
      size: '0.5',
      price: '2000',
      leverage: 5,
      marginTiers: singleTier25x,
    });

    expect(result.status).toBe('open');
    if (result.status !== 'open') {
      return;
    }
    expect(result.kind).toBe('increase');
    expect(result.resulting.direction).toBe('short');
    expect(result.resulting.size).toBeCloseTo(1.5);
    expect(result.resulting.margin).toStrictEqual({
      available: true,
      value: 600,
    });
    expect(
      availablePreviewValue(result.resulting.liquidationPrice),
    ).toBeGreaterThan(2000);
  });

  it("keeps a short's margin when increasing at higher leverage", () => {
    const result = previewHyperLiquidIsolatedPositionModify({
      position: isolatedPosition({
        size: '-1',
        liquidationPrice: '2360',
      }),
      direction: 'short',
      size: '0.5',
      price: '2000',
      leverage: 10,
      marginTiers: singleTier25x,
    });

    expect(result.status).toBe('open');
    if (result.status !== 'open') {
      return;
    }
    // $400 kept plus $100 for the order at 10x.
    expect(result.resulting.margin).toStrictEqual({
      available: true,
      value: 500,
    });
    expect(result.resulting.direction).toBe('short');
  });

  it('averages a short increase at a limit above entry', () => {
    const result = previewHyperLiquidIsolatedPositionModify({
      position: isolatedPosition({
        size: '-1',
        liquidationPrice: '2360',
      }),
      direction: 'short',
      size: '1',
      price: '2200',
      leverage: 5,
      marginTiers: singleTier25x,
    });

    expect(result.status).toBe('open');
    if (result.status !== 'open') {
      return;
    }
    expect(result.resulting.entryPrice).toBeCloseTo(2100);
    expect(result.resulting.margin).toStrictEqual({
      available: true,
      value: 840,
    });
  });

  it('projects a partial cover of a short using the remaining short direction', () => {
    const result = previewHyperLiquidIsolatedPositionModify({
      position: isolatedPosition({
        size: '-1',
        liquidationPrice: '2360',
      }),
      direction: 'long',
      size: '0.4',
      price: '2000',
      leverage: 5,
      reduceOnly: true,
      marginTiers: singleTier25x,
    });

    expect(result.status).toBe('open');
    if (result.status !== 'open') {
      return;
    }
    expect(result.kind).toBe('decrease');
    expect(result.resulting.direction).toBe('short');
    expect(result.resulting.size).toBeCloseTo(0.6);
    expect(result.resulting.margin).toStrictEqual({
      available: true,
      value: 240,
    });
  });

  it('flips a short leftover into a long at the fill price', () => {
    const result = previewHyperLiquidIsolatedPositionModify({
      position: isolatedPosition({
        size: '-1',
        liquidationPrice: '2360',
      }),
      direction: 'long',
      size: '1.5',
      price: '1900',
      leverage: 10,
      marginTiers: singleTier25x,
    });

    expect(result.status).toBe('open');
    if (result.status !== 'open') {
      return;
    }
    expect(result.kind).toBe('flip');
    expect(result.resulting.direction).toBe('long');
    expect(result.resulting.size).toBeCloseTo(0.5);
    expect(result.resulting.entryPrice).toBeCloseTo(1900);
    expect(result.resulting.margin).toStrictEqual({
      available: true,
      value: 95,
    });
    expect(
      availablePreviewValue(result.resulting.liquidationPrice),
    ).toBeLessThan(1900);
  });

  it('fully closes a short without a remaining size', () => {
    const result = previewHyperLiquidIsolatedPositionModify({
      position: isolatedPosition({
        size: '-1',
        liquidationPrice: '2360',
      }),
      direction: 'long',
      size: '1',
      price: '2000',
      leverage: 5,
      reduceOnly: true,
      marginTiers: singleTier25x,
    });

    expect(result).toMatchObject({
      status: 'full_close',
      resultingDirection: 'short',
    });
  });

  it('flips a long leftover into a short at a limit away from entry', () => {
    const result = previewHyperLiquidIsolatedPositionModify({
      position: isolatedPosition(),
      direction: 'short',
      size: '1.5',
      price: '1800',
      leverage: 10,
      marginTiers: singleTier25x,
    });

    expect(result.status).toBe('open');
    if (result.status !== 'open') {
      return;
    }
    expect(result.kind).toBe('flip');
    expect(result.resulting.direction).toBe('short');
    expect(result.resulting.size).toBeCloseTo(0.5);
    expect(result.resulting.entryPrice).toBeCloseTo(1800);
    expect(result.resulting.margin).toStrictEqual({
      available: true,
      value: 90,
    });
    expect(
      availablePreviewValue(result.resulting.liquidationPrice),
    ).toBeGreaterThan(1800);
  });

  it('returns none for a negative order size', () => {
    const result = previewHyperLiquidIsolatedPositionModify({
      position: isolatedPosition(),
      direction: 'long',
      size: '-0.5',
      price: '2000',
      leverage: 5,
      marginTiers: singleTier25x,
    });

    expect(result.status).toBe('none');
  });
});

const leveragePosition = (
  overrides: Partial<IsolatedLeverageChangeParams['position']> = {},
): IsolatedLeverageChangeParams['position'] => ({
  size: '1',
  positionValue: '2000',
  marginUsed: '400',
  leverage: { type: 'isolated', value: 5 },
  ...overrides,
});

/**
 * Expected leverage change, each known figure matched to 8 decimals.
 *
 * @param removableMargin - Expected removable margin.
 * @param margin - Expected margin afterwards.
 * @param liquidationPrice - Expected liquidation price.
 * @returns The expected change for `toStrictEqual`.
 */
const change = (
  removableMargin: number | undefined,
  margin: number | undefined,
  liquidationPrice: number | undefined,
): IsolatedLeverageChange => {
  const near = (value: number | undefined): number | undefined =>
    value === undefined ? undefined : (expect.closeTo(value, 8) as number);
  return {
    removableMargin: near(removableMargin),
    margin: near(margin),
    liquidationPrice: near(liquidationPrice),
  };
};

const unknownChange = change(undefined, undefined, undefined);

// Reference rows. Clients assert the same rows against
// `estimateIsolatedLeverageChange`. A long of 1 marked at 2,000 holds 400 of
// isolated margin at 5x unless a row says otherwise; ETH's single 25x tier
// sets the maintenance rate at 2%. A rise frees at most the drop in initial
// margin, and only down to max(notional / leverage, 10% of notional) plus 1%
// of notional.
const LEVERAGE_CHANGE_ROWS: {
  change: string;
  params: IsolatedLeverageChangeParams;
  expected: IsolatedLeverageChange;
}[] = [
  {
    // Frees 400 - 200 = 200 of initial margin; 400 - 200 - 20 = 180 may leave.
    change: 'raised from 5x to 10x',
    params: {
      position: leveragePosition(),
      providerId: 'hyperliquid',
      leverage: 10,
      marginTiers: singleTier25x,
    },
    expected: change(180, 220, 1780 / 0.98),
  },
  {
    // 10% of notional (200) binds above the 100 that 20x would need.
    change: 'raised from 5x to 20x',
    params: {
      position: leveragePosition(),
      providerId: 'hyperliquid',
      leverage: 20,
      marginTiers: singleTier25x,
    },
    expected: change(180, 220, 1780 / 0.98),
  },
  {
    change: 'raised from 5x to the 25x maximum',
    params: {
      position: leveragePosition(),
      providerId: 'hyperliquid',
      leverage: 25,
      marginTiers: singleTier25x,
    },
    expected: change(180, 220, 1780 / 0.98),
  },
  {
    // Marked at 2,500 with 400 of margin added and 500 of unrealized profit:
    // only the 500 - 250 drop in initial margin is freed.
    change: 'raised from 5x to 10x with margin added and unrealized profit',
    params: {
      position: leveragePosition({ positionValue: '2500', marginUsed: '900' }),
      providerId: 'hyperliquid',
      leverage: 10,
      marginTiers: singleTier25x,
    },
    expected: change(250, 650, 1850 / 0.98),
  },
  {
    // A small rise frees only 2,500 / 5 - 2,500 / 6, not the added margin.
    change: 'raised from 5x to 6x with margin added',
    params: {
      position: leveragePosition({ positionValue: '2500', marginUsed: '900' }),
      providerId: 'hyperliquid',
      leverage: 6,
      marginTiers: singleTier25x,
    },
    expected: change(
      2500 / 5 - 2500 / 6,
      900 - (2500 / 5 - 2500 / 6),
      (2500 - 900 + (2500 / 5 - 2500 / 6)) / 0.98,
    ),
  },
  {
    // 190 is below 180 + 18 of buffer, so nothing can leave.
    change: 'raised while the margin is below the new requirement',
    params: {
      position: leveragePosition({ positionValue: '1800', marginUsed: '190' }),
      providerId: 'hyperliquid',
      leverage: 10,
      marginTiers: singleTier25x,
    },
    expected: change(0, 190, 1610 / 0.98),
  },
  {
    // The Hyperliquid testnet short behind the preview test above, marked at
    // 76,148 on BTC's 40x tier (maintenance 1.25%).
    change: 'a 2x BTC short raised to 3x',
    params: {
      position: leveragePosition({
        size: '-0.00014',
        positionValue: '10.66072',
        marginUsed: '5.331249',
        leverage: { type: 'isolated', value: 2 },
      }),
      providerId: 'hyperliquid',
      leverage: 3,
      marginTiers: [{ lowerBound: 0, maxLeverage: 40 }],
    },
    expected: change(
      5.331249 - 10.66072 / 3 - 0.1066072,
      10.66072 / 3 + 0.1066072,
      (76148 + (10.66072 / 3 + 0.1066072) / 0.00014) / 1.0125,
    ),
  },
  // Testnet ETH tiers: 25x from $0, 10x from $20,000, 5x from $50,000, 3x from
  // $200,000. The limit is the tier the position's notional is in. Liquidation lands in the
  // 10x tier (maintenance 5%, deduction 600): (notional - margin - 600) /
  // (size * 0.95).
  {
    // $60,000 is in the 5x tier: frees 15,000 - 12,000 = 3,000; 15,000 -
    // 12,000 - 600 = 2,400 may leave.
    change: 'a $60,000 long in the 5x tier raised from 4x to 5x',
    params: {
      position: leveragePosition({
        size: '30',
        positionValue: '60000',
        marginUsed: '15000',
        leverage: { type: 'isolated', value: 4 },
      }),
      providerId: 'hyperliquid',
      leverage: 5,
      marginTiers: testnetEthTiers,
    },
    expected: change(2400, 12600, (60000 - 12600 - 600) / (30 * 0.95)),
  },
  {
    // $10,000 is in the 25x tier, and liquidation stays in it (maintenance
    // 2%): frees 2,000 - 500 = 1,500; 2,000 - 1,000 - 100 = 900 may leave.
    change: 'a $10,000 long in the 25x tier raised from 5x to 20x',
    params: {
      position: leveragePosition({
        size: '5',
        positionValue: '10000',
        marginUsed: '2000',
      }),
      providerId: 'hyperliquid',
      leverage: 20,
      marginTiers: testnetEthTiers,
    },
    expected: change(900, 1100, (10000 - 1100) / (5 * 0.98)),
  },
  {
    change: 'a $60,000 long in the 5x tier raised from 5x to 10x',
    params: {
      position: leveragePosition({
        size: '30',
        positionValue: '60000',
        marginUsed: '12000',
      }),
      providerId: 'hyperliquid',
      leverage: 10,
      marginTiers: testnetEthTiers,
    },
    expected: unknownChange,
  },
  {
    // $40,000 is in the 10x tier: frees 8,000 - 4,000 = 4,000; 8,000 - 4,000
    // - 400 = 3,600 may leave.
    change: 'a $40,000 long in the 10x tier raised from 5x to 10x',
    params: {
      position: leveragePosition({
        size: '20',
        positionValue: '40000',
        marginUsed: '8000',
      }),
      providerId: 'hyperliquid',
      leverage: 10,
      marginTiers: testnetEthTiers,
    },
    expected: change(3600, 4400, (40000 - 4400 - 600) / (20 * 0.95)),
  },
  {
    change: 'a $40,000 long raised from 5x to 10x with the tiers unsorted',
    params: {
      position: leveragePosition({
        size: '20',
        positionValue: '40000',
        marginUsed: '8000',
      }),
      providerId: 'hyperliquid',
      leverage: 10,
      marginTiers: [...testnetEthTiers].reverse(),
    },
    expected: change(3600, 4400, (40000 - 4400 - 600) / (20 * 0.95)),
  },
  {
    change: 'a $40,000 long in the 10x tier raised from 5x to 11x',
    params: {
      position: leveragePosition({
        size: '20',
        positionValue: '40000',
        marginUsed: '8000',
      }),
      providerId: 'hyperliquid',
      leverage: 11,
      marginTiers: testnetEthTiers,
    },
    expected: unknownChange,
  },
  {
    // A tier's lower bound is inclusive: $50,000 is in the 5x tier.
    change: 'a $50,000 long at the 5x tier bound raised from 4x to 5x',
    params: {
      position: leveragePosition({
        size: '25',
        positionValue: '50000',
        marginUsed: '12500',
        leverage: { type: 'isolated', value: 4 },
      }),
      providerId: 'hyperliquid',
      leverage: 5,
      marginTiers: testnetEthTiers,
    },
    expected: change(2000, 10500, (50000 - 10500 - 600) / (25 * 0.95)),
  },
  {
    change: 'a $50,000 long at the 5x tier bound raised from 5x to 6x',
    params: {
      position: leveragePosition({
        size: '25',
        positionValue: '50000',
        marginUsed: '10000',
      }),
      providerId: 'hyperliquid',
      leverage: 6,
      marginTiers: testnetEthTiers,
    },
    expected: unknownChange,
  },
  {
    change: 'lowered from 5x to 4x when the margin already covers it',
    params: {
      position: leveragePosition({ marginUsed: '600' }),
      providerId: 'hyperliquid',
      leverage: 4,
      marginTiers: singleTier25x,
    },
    expected: change(0, 600, 1400 / 0.98),
  },
  {
    change: 'lowered from 5x to 4x when the margin exactly covers it',
    params: {
      position: leveragePosition({ marginUsed: '500' }),
      providerId: 'hyperliquid',
      leverage: 4,
      marginTiers: singleTier25x,
    },
    expected: change(0, 500, 1500 / 0.98),
  },
  {
    // $2,000 at 2x needs $1,000; Hyperliquid rejects the decrease.
    change: 'lowered from 5x to 2x without the margin it needs',
    params: {
      position: leveragePosition(),
      providerId: 'hyperliquid',
      leverage: 2,
      marginTiers: singleTier25x,
    },
    expected: unknownChange,
  },
  {
    change: 'at the same leverage',
    params: {
      position: leveragePosition(),
      providerId: 'hyperliquid',
      leverage: 5,
      marginTiers: singleTier25x,
    },
    expected: change(0, 400, 1600 / 0.98),
  },
];

describe('estimateIsolatedLeverageChange', () => {
  it.each(LEVERAGE_CHANGE_ROWS)(
    'matches the reference row $change',
    ({ params, expected }) => {
      expect(estimateIsolatedLeverageChange(params)).toStrictEqual(expected);
    },
  );

  it('returns undefined for cross margin', () => {
    expect(
      estimateIsolatedLeverageChange({
        position: leveragePosition({ leverage: { type: 'cross', value: 5 } }),
        providerId: 'hyperliquid',
        leverage: 10,
        marginTiers: singleTier25x,
      }),
    ).toStrictEqual(unknownChange);
  });

  it.each(['lighter', 'unknown', 'toString'])(
    'returns undefined for the %s provider',
    (providerId) => {
      expect(
        estimateIsolatedLeverageChange({
          position: leveragePosition(),
          providerId: providerId as IsolatedLeverageChangeParams['providerId'],
          leverage: 10,
          marginTiers: singleTier25x,
        }),
      ).toStrictEqual(unknownChange);
    },
  );

  it.each([
    ['no leverage', { leverage: undefined }],
    ['leverage below 1', { leverage: 0.5 }],
    [
      'leverage below 1 that the margin would cover',
      { leverage: 0.5, position: leveragePosition({ marginUsed: '5000' }) },
    ],
    ['zero leverage', { leverage: 0 }],
    ['non-finite leverage', { leverage: Number.POSITIVE_INFINITY }],
    ['NaN leverage', { leverage: Number.NaN }],
    ['a leverage above the asset maximum', { leverage: 26 }],
    [
      'margin tiers that are all invalid',
      { marginTiers: [{ lowerBound: 0, maxLeverage: 0 }] },
    ],
    [
      'margin tiers that start above the notional',
      { marginTiers: [{ lowerBound: 100_000, maxLeverage: 40 }] },
    ],
    ['a zero size', { position: leveragePosition({ size: '0' }) }],
    ['an empty size', { position: leveragePosition({ size: '' }) }],
    ['no margin', { position: leveragePosition({ marginUsed: '' }) }],
    ['zero margin', { position: leveragePosition({ marginUsed: '0' }) }],
    [
      'no position value',
      { position: leveragePosition({ positionValue: '' }) },
    ],
    [
      'no current leverage',
      {
        position: leveragePosition({
          leverage: { type: 'isolated', value: Number.NaN },
        }),
      },
    ],
    [
      'a current leverage below 1',
      {
        position: leveragePosition({
          leverage: { type: 'isolated', value: 0 },
        }),
      },
    ],
  ] as [string, Partial<IsolatedLeverageChangeParams>][])(
    'returns undefined with %s',
    (_label, override) => {
      expect(
        estimateIsolatedLeverageChange({
          position: leveragePosition(),
          providerId: 'hyperliquid',
          leverage: 10,
          marginTiers: singleTier25x,
          ...override,
        }),
      ).toStrictEqual(unknownChange);
    },
  );

  it.each([undefined, null, []])(
    'keeps margin but withholds liquidation without margin tiers (%s)',
    (marginTiers) => {
      expect(
        estimateIsolatedLeverageChange({
          position: leveragePosition(),
          providerId: 'hyperliquid',
          leverage: 10,
          marginTiers,
        }),
      ).toStrictEqual(change(180, 220, undefined));
    },
  );
});
