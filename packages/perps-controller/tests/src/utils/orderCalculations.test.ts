import { PERPS_ERROR_CODES } from '../../../src/perpsErrorCodes.js';
import { calculateFinalPositionSize } from '../../../src/utils/orderCalculations.js';

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
      // 2500.4 / 50000 = 0.050008: nearest is 0.05 either way, but 4599 / 50000
      // = 0.09198 would round up to 0.092
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

    it('ignores the provided size when a USD amount is given', () => {
      const { finalPositionSize } = calculateFinalPositionSize({
        size: '0.04',
        usdAmount: '2500',
        currentPrice: 50000,
        szDecimals: 5,
        reduceOnly: true,
      });

      // Documents why closePosition must withhold usdAmount once its size clamp
      // bites: the USD amount wins here.
      expect(finalPositionSize).toBeCloseTo(0.05, 10);
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

    it('leaves a zero size alone', () => {
      const { finalPositionSize } = calculateFinalPositionSize({
        size: '0',
        currentPrice: 50000,
        szDecimals: 3,
        reduceOnly: true,
      });

      expect(finalPositionSize).toBe(0);
    });
  });
});
