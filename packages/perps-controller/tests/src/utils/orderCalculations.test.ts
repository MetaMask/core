import { PERPS_ERROR_CODES } from '../../../src/perpsErrorCodes.js';
import {
  calculateFinalPositionSize,
  floorToSizeDecimals,
} from '../../../src/utils/orderCalculations.js';

describe('floorToSizeDecimals', () => {
  it('never returns a size larger than its input', () => {
    // The invariant the helper exists to enforce: a reduce-only size may be
    // reduced, never increased. Covers grid-aligned values, values just below
    // and just above a grid point, dust, and magnitudes where the tolerance
    // exceeds half a grid increment.
    const cases: [number, number][] = [
      [0.1229999995, 3],
      [3000000000.000006, 5],
      [0.123, 3],
      [0.12356, 3],
      [1048580.0694, 5],
      [0.0004, 3],
      [0.1, 3],
      [1.5, 4],
      [0.099999999999, 3],
      [123456789.123456, 5],
      [1e-8, 5],
      [0, 3],
    ];

    for (const [size, szDecimals] of cases) {
      expect(floorToSizeDecimals(size, szDecimals)).toBeLessThanOrEqual(size);
    }
  });

  it('truncates a value that sits just below a grid point instead of snapping up', () => {
    // 0.1229999995 * 1000 = 122.9999995, within the old tolerance of 123, so the
    // previous implementation returned 0.123 — larger than the input
    expect(floorToSizeDecimals(0.1229999995, 3)).toBe(0.122);
  });

  it('truncates at magnitudes where the tolerance exceeds half a grid increment', () => {
    // 3000000000.000006 * 1e5 scales past 1e14, where a magnitude-scaled
    // tolerance is wider than one increment and would round to nearest
    expect(floorToSizeDecimals(3000000000.000006, 5)).toBeLessThanOrEqual(
      3000000000.000006,
    );
    expect(floorToSizeDecimals(3000000000.000006, 5)).toBe(3000000000);
  });

  it('still recovers a grid-aligned value whose scaled form lands just below the grid point', () => {
    // 0.123 * 1000 === 122.99999999999999 and 1048580.0694 * 1e5 is 1.5e-5 off
    // its grid point: both are exactly representable, so neither may be shaved
    expect(floorToSizeDecimals(0.123, 3)).toBe(0.123);
    expect(floorToSizeDecimals(1048580.0694, 5)).toBe(1048580.0694);
  });

  it('holds the invariant for inputs a fraction of an ulp below a grid point', () => {
    // size * multiplier rounds to exactly the grid integer for these, so
    // flooring the scaled value returns the grid point the input sits below
    expect(floorToSizeDecimals(0.8999999999999999, 1)).toBeLessThanOrEqual(
      0.8999999999999999,
    );
    expect(floorToSizeDecimals(0.11699999999999999, 3)).toBeLessThanOrEqual(
      0.11699999999999999,
    );
  });

  it('holds the invariant across a sweep of one-ulp-below-grid inputs', () => {
    // The case the earlier boundary/property tests never sampled: grid points
    // approached from below by 1-3 ulp, across every supported precision
    for (let szDecimals = 0; szDecimals <= 6; szDecimals += 1) {
      const multiplier = Math.pow(10, szDecimals);
      for (let gridPoint = 1; gridPoint <= 500; gridPoint += 1) {
        let size = gridPoint / multiplier;
        for (let ulp = 0; ulp < 3; ulp += 1) {
          size -= Math.abs(size) * Number.EPSILON;
          expect(floorToSizeDecimals(size, szDecimals)).toBeLessThanOrEqual(
            size,
          );
        }
      }
    }
  });

  it('terminates and holds the invariant where the scaled size reaches 2^53', () => {
    // Past 2^53 `units -= 1` is a no-op, so a step-down loop cannot converge.
    // Each case must return (the test timing out is the failure mode) and must
    // still not exceed its input.
    const cases: [number, number][] = [
      [998999999.9999998, 8],
      [902999999999.9995, 4],
      [8390000000000000, 6],
      [1e18, 7],
      [Number.MAX_SAFE_INTEGER, 0],
      [Number.MAX_VALUE, 2],
      [Infinity, 3],
    ];

    for (const [size, szDecimals] of cases) {
      const result = floorToSizeDecimals(size, szDecimals);

      expect(Number.isNaN(result)).toBe(false);
      expect(result).toBeLessThanOrEqual(size);
    }
  });

  it('holds the invariant for negative sizes', () => {
    // For a negative input the tolerance snap rounds towards zero, i.e. upward,
    // so the step-down has to run for negatives too
    expect(floorToSizeDecimals(-1.0000000001, 0)).toBeLessThanOrEqual(
      -1.0000000001,
    );
    expect(floorToSizeDecimals(-0.1220000001, 3)).toBeLessThanOrEqual(
      -0.1220000001,
    );
    expect(floorToSizeDecimals(-1.5, 4)).toBe(-1.5);
    expect(floorToSizeDecimals(-0.123, 3)).toBe(-0.123);
  });

  it('holds the invariant across a sweep of negative one-tick-below-grid inputs', () => {
    for (let szDecimals = 0; szDecimals <= 5; szDecimals += 1) {
      const multiplier = Math.pow(10, szDecimals);
      for (let gridPoint = 1; gridPoint <= 400; gridPoint += 1) {
        let size = -(gridPoint / multiplier);
        for (let tick = 0; tick < 3; tick += 1) {
          size -= Math.abs(size) * Number.EPSILON;
          expect(floorToSizeDecimals(size, szDecimals)).toBeLessThanOrEqual(
            size,
          );
        }
      }
    }
  });

  it('holds the invariant for negative sizes below one grid increment', () => {
    // Below the tolerance the snap produces -0, which `units !== 0` alone cannot
    // step down because -0 === 0. This region sits under one grid increment, so
    // the grid-point sweeps never reach it.
    expect(floorToSizeDecimals(-1e-9, 0)).toBeLessThanOrEqual(-1e-9);
    expect(floorToSizeDecimals(-5e-7, 0)).toBeLessThanOrEqual(-5e-7);
    expect(floorToSizeDecimals(-1e-12, 5)).toBeLessThanOrEqual(-1e-12);
    expect(floorToSizeDecimals(-1e-8, 2)).toBeLessThanOrEqual(-1e-8);
    // A negative zero is already its own floor and must not be stepped down
    expect(floorToSizeDecimals(-0, 3)).toBe(-0);
    // A positive sub-tolerance size still floors to zero
    expect(floorToSizeDecimals(1e-9, 3)).toBe(0);
  });

  it('holds the invariant across a sweep of sub-increment negative magnitudes', () => {
    // Magnitudes from 1e-14 up to 1e-3 across every supported precision: spans
    // sub-tolerance (snap-to--0), sub-increment, and above-increment regions
    for (let szDecimals = 0; szDecimals <= 5; szDecimals += 1) {
      for (const magnitude of [
        1e-14, 1e-12, 1e-10, 1e-9, 5e-7, 1e-6, 1e-5, 1e-3,
      ]) {
        for (let step = 1; step <= 40; step += 1) {
          const size = -(magnitude * step);
          expect(floorToSizeDecimals(size, szDecimals)).toBeLessThanOrEqual(
            size,
          );
        }
      }
    }
  });

  it('terminates and holds the invariant for negative sizes past 2^53', () => {
    const cases: [number, number][] = [
      [-998999999.9999998, 8],
      [-8390000000000000, 6],
      [-Number.MAX_VALUE, 2],
      [-Infinity, 3],
    ];

    for (const [size, szDecimals] of cases) {
      const result = floorToSizeDecimals(size, szDecimals);

      expect(Number.isNaN(result)).toBe(false);
      expect(result).toBeLessThanOrEqual(size);
    }
  });

  it('holds the invariant across a swept range of sizes and precisions', () => {
    // Property sweep: every result must be <= its input and on the size grid
    for (const szDecimals of [0, 1, 3, 5]) {
      const multiplier = Math.pow(10, szDecimals);
      for (let step = 0; step < 400; step += 1) {
        const size = step * 0.00731 + step / 997;
        const result = floorToSizeDecimals(size, szDecimals);

        expect(result).toBeLessThanOrEqual(size);
        expect(
          Math.abs(result * multiplier - Math.round(result * multiplier)),
        ).toBeLessThan(1e-6);
      }
    }
  });
});

describe('calculateFinalPositionSize', () => {
  describe('USD amount as source of truth', () => {
    it('rounds to the size grid and tops up to meet the requested USD', () => {
      // 5000.5 / 50000 = 0.10001 → rounds to 0.1, whose notional (5000) falls
      // short of the request, so one increment is added
      const { finalPositionSize } = calculateFinalPositionSize({
        usdAmount: '5000.5',
        currentPrice: 50000,
        szDecimals: 3,
      });

      expect(finalPositionSize).toBeCloseTo(0.101, 10);
    });

    it('rounds down and skips the top-up for reduce-only orders', () => {
      // The top-up would submit more than the position holds, which HyperLiquid
      // rejects with "Reduce only order would increase position"
      const { finalPositionSize } = calculateFinalPositionSize({
        usdAmount: '5000.5',
        currentPrice: 50000,
        szDecimals: 3,
        reduceOnly: true,
      });

      expect(finalPositionSize).toBeCloseTo(0.1, 10);
    });

    it('rounds a reduce-only size down rather than to the nearest increment', () => {
      // 4599 / 50000 = 0.09198, which would round up to 0.092
      const { finalPositionSize } = calculateFinalPositionSize({
        usdAmount: '4599',
        currentPrice: 50000,
        szDecimals: 3,
        reduceOnly: true,
      });

      expect(finalPositionSize).toBeCloseTo(0.091, 10);
    });

    it('throws when a reduce-only size floors to zero', () => {
      // One increment (0.001 BTC) is worth $50, so $15 cannot be expressed
      expect(() =>
        calculateFinalPositionSize({
          usdAmount: '15',
          currentPrice: 50000,
          szDecimals: 3,
          reduceOnly: true,
        }),
      ).toThrow(PERPS_ERROR_CODES.ORDER_SIZE_POSITIVE);
    });

    it('throws instead of capping a reduce-only size at a non-positive size', () => {
      // The cap would make this a zero-size order, which the exchange rejects
      expect(() =>
        calculateFinalPositionSize({
          size: '0',
          usdAmount: '100',
          currentPrice: 50000,
          szDecimals: 3,
          reduceOnly: true,
        }),
      ).toThrow(PERPS_ERROR_CODES.ORDER_SIZE_POSITIVE);
    });

    it('throws instead of capping a reduce-only size at a negative size', () => {
      expect(() =>
        calculateFinalPositionSize({
          size: '-1',
          usdAmount: '100',
          currentPrice: 50000,
          szDecimals: 3,
          reduceOnly: true,
        }),
      ).toThrow(PERPS_ERROR_CODES.ORDER_SIZE_POSITIVE);
    });

    it('throws instead of capping a reduce-only size at a non-numeric size', () => {
      expect(() =>
        calculateFinalPositionSize({
          size: 'abc',
          usdAmount: '100',
          currentPrice: 50000,
          szDecimals: 3,
          reduceOnly: true,
        }),
      ).toThrow(PERPS_ERROR_CODES.ORDER_SIZE_POSITIVE);
    });

    it('leaves a non-positive size alone for orders that are not reduce-only', () => {
      // Opens still treat usdAmount as the only source of truth
      const { finalPositionSize } = calculateFinalPositionSize({
        size: '0',
        usdAmount: '100',
        currentPrice: 50000,
        szDecimals: 3,
      });

      expect(finalPositionSize).toBeCloseTo(0.002, 10);
    });

    it('ignores the provided size when a USD amount is given', () => {
      const { finalPositionSize } = calculateFinalPositionSize({
        size: '0.04',
        usdAmount: '2500',
        currentPrice: 50000,
        szDecimals: 5,
      });

      // For an opening order the USD amount wins outright
      expect(finalPositionSize).toBeCloseTo(0.05, 10);
    });

    it('caps a reduce-only size at the provided size', () => {
      // The caller already clamped 0.04 to the live position, so the USD amount
      // (worth 0.05 at this price) must not resurrect the larger size
      const { finalPositionSize } = calculateFinalPositionSize({
        size: '0.04',
        usdAmount: '2500',
        currentPrice: 50000,
        szDecimals: 5,
        reduceOnly: true,
      });

      expect(finalPositionSize).toBeCloseTo(0.04, 10);
    });

    it('keeps the USD-derived reduce-only size when it is below the provided size', () => {
      // An adverse price move shrinks the USD-derived size; the cap must not
      // raise it back up to the requested size
      const { finalPositionSize } = calculateFinalPositionSize({
        size: '0.05',
        usdAmount: '2000',
        currentPrice: 50000,
        szDecimals: 5,
        reduceOnly: true,
      });

      expect(finalPositionSize).toBeCloseTo(0.04, 10);
    });

    it('throws when the price moved beyond the allowed slippage', () => {
      expect(() =>
        calculateFinalPositionSize({
          usdAmount: '5000',
          currentPrice: 45000,
          priceAtCalculation: 50000,
          maxSlippageBps: 300,
          szDecimals: 3,
        }),
      ).toThrow('Price moved too much');
    });
  });

  describe('legacy size path', () => {
    it('uses the provided size verbatim', () => {
      const { finalPositionSize } = calculateFinalPositionSize({
        size: '0.12345',
        currentPrice: 50000,
        szDecimals: 3,
      });

      expect(finalPositionSize).toBeCloseTo(0.12345, 10);
    });

    it('floors a reduce-only size onto the size grid', () => {
      // formatHyperLiquidSize would otherwise toFixed(3) this up to 0.124
      const { finalPositionSize } = calculateFinalPositionSize({
        size: '0.12356',
        currentPrice: 50000,
        szDecimals: 3,
        reduceOnly: true,
      });

      expect(finalPositionSize).toBeCloseTo(0.123, 10);
    });

    it('keeps a grid-aligned reduce-only size intact despite float error', () => {
      // 0.123 * 1000 === 122.99999999999999, so a plain truncation would drop a
      // whole increment and leave dust in the position
      const { finalPositionSize } = calculateFinalPositionSize({
        size: '0.123',
        currentPrice: 50000,
        szDecimals: 3,
        reduceOnly: true,
      });

      expect(finalPositionSize).toBeCloseTo(0.123, 10);
    });

    it('keeps a grid-aligned reduce-only size intact at magnitudes where a fixed tolerance fails', () => {
      // 1048580.0694 * 1e5 lands 1.5e-5 off its grid point — past a fixed 1e-6
      // tolerance, which would floor it to 1048580.06939 and lose an increment
      const { finalPositionSize } = calculateFinalPositionSize({
        size: '1048580.0694',
        currentPrice: 1,
        szDecimals: 5,
        reduceOnly: true,
      });

      expect(finalPositionSize).toBe(1048580.0694);
    });

    it('throws when a reduce-only size floors to zero', () => {
      expect(() =>
        calculateFinalPositionSize({
          size: '0.0004',
          currentPrice: 50000,
          szDecimals: 3,
          reduceOnly: true,
        }),
      ).toThrow(PERPS_ERROR_CODES.ORDER_SIZE_POSITIVE);
    });

    it('throws for a non-positive reduce-only size, matching the USD branch', () => {
      // formatHyperLiquidSize would otherwise render '0.000' / '-1.000'
      expect(() =>
        calculateFinalPositionSize({
          size: '0',
          currentPrice: 50000,
          szDecimals: 3,
          reduceOnly: true,
        }),
      ).toThrow(PERPS_ERROR_CODES.ORDER_SIZE_POSITIVE);

      expect(() =>
        calculateFinalPositionSize({
          size: '-1',
          currentPrice: 50000,
          szDecimals: 3,
          reduceOnly: true,
        }),
      ).toThrow(PERPS_ERROR_CODES.ORDER_SIZE_POSITIVE);
    });

    it('leaves a zero size alone when the order is not reduce-only', () => {
      const { finalPositionSize } = calculateFinalPositionSize({
        size: '0',
        currentPrice: 50000,
        szDecimals: 3,
      });

      expect(finalPositionSize).toBe(0);
    });
  });
});
