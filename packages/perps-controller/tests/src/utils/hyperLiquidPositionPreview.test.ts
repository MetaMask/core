import type {
  PositionModifyPreviewSource,
  PositionPreviewValue,
} from '../../../src/types/index.js';
import {
  buildMaintenanceSchedule,
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
      entryPrice: 2000,
      margin: 400,
      positionSize: 1,
      maintenanceMarginRate: 1 / 50,
    });

    expect(liq).toBeCloseTo((2000 - 400) / (1 - 1 / 50));
  });

  it('matches the single-tier closed form for a short', () => {
    const liq = estimateIsolatedLiquidationPrice({
      isLong: false,
      entryPrice: 2000,
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

  it('reallocates the existing isolated position when order leverage differs', () => {
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
    // Existing 5x $400 is reset to $200 at 10x, then $100 is added for the order.
    expect(result.resulting.margin).toStrictEqual({
      available: true,
      value: 300,
    });
    expect(result.resulting.leverage).toBeCloseTo(10);
    const liquidationPrice = availablePreviewValue(
      result.resulting.liquidationPrice,
    );
    const overstatedMarginLiq = estimateIsolatedLiquidationPrice({
      isLong: true,
      entryPrice: 2000,
      margin: 500,
      positionSize: 1.5,
      maintenanceMarginRate: 1 / 50,
    });
    expect(overstatedMarginLiq).not.toBeNull();
    expect(liquidationPrice).toBeGreaterThan(overstatedMarginLiq ?? 0);
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
    expect(result.resulting.margin).toStrictEqual({
      available: true,
      value: 375,
    });
    // Mark notional $3750 / $375 = 10x. Entry notional would report ~8.67x.
    expect(result.resulting.leverage).toBeCloseTo(10);
    expect(result.resulting.entryPrice).toBeCloseTo(2166.666, 1);
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

  it('reallocates before a partial decrease when leverage changes', () => {
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
    expect(result.resulting.margin).toStrictEqual({
      available: true,
      value: 120,
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
      entryPrice: result.resulting.entryPrice,
      margin: result.resulting.margin.available
        ? result.resulting.margin.value
        : 0,
      positionSize: result.resulting.size,
      marginTiers: testnetEthTiers,
    });
    const singleTier = estimateIsolatedLiquidationPrice({
      isLong: true,
      entryPrice: result.resulting.entryPrice,
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

  it('strips extra isolated margin when leverage increases', () => {
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
    expect(result.resulting.margin).toStrictEqual({
      available: true,
      value: 300,
    });
  });

  it('adds isolated margin when selected leverage is lower than the position', () => {
    const result = previewHyperLiquidIsolatedPositionModify({
      position: isolatedPosition({
        leverage: { type: 'isolated', value: 10 },
        marginUsed: '200',
      }),
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
    // Existing $2000 / 5 = $400, plus 0.5 * 2000 / 5 = $200.
    expect(result.resulting.margin).toStrictEqual({
      available: true,
      value: 600,
    });
    expect(result.resulting.leverage).toBeCloseTo(5);
  });

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

  it('reallocates a short when increasing at higher leverage', () => {
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
    expect(result.resulting.margin).toStrictEqual({
      available: true,
      value: 300,
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
