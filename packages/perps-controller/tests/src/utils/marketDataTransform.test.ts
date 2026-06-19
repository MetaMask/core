import { HYPERLIQUID_CONFIG } from '../../../src/constants/hyperLiquidConfig';
import { isMarketTradable } from '../../../src/utils/marketDataTransform';

describe('marketDataTransform', () => {
  describe('isMarketTradable', () => {
    it('is tradable when mid and oracle prices are equal', () => {
      expect(
        isMarketTradable({ midPrice: 50000, oraclePrice: 50000 }),
      ).toBe(true);
    });

    it('is tradable for small deviations well within the limit', () => {
      // 0.2% deviation
      expect(
        isMarketTradable({ midPrice: 50100, oraclePrice: 50000 }),
      ).toBe(true);
    });

    it('is tradable exactly at the deviation limit (inclusive boundary)', () => {
      // 95% above the oracle price -> deviation === limit
      expect(
        isMarketTradable({ midPrice: 50000 * 1.95, oraclePrice: 50000 }),
      ).toBe(true);
    });

    it('is untradable when the mid price is more than 95% above the oracle price', () => {
      // 96% above the oracle price -> deviation > limit
      expect(
        isMarketTradable({ midPrice: 50000 * 1.96, oraclePrice: 50000 }),
      ).toBe(false);
    });

    it('is untradable when the mid price is more than 95% below the oracle price', () => {
      // Mid price near zero relative to oracle -> ~100% deviation
      expect(isMarketTradable({ midPrice: 1, oraclePrice: 50000 })).toBe(false);
    });

    it('respects a custom deviation limit', () => {
      // 20% deviation with a 10% limit -> untradable
      expect(
        isMarketTradable({
          midPrice: 120,
          oraclePrice: 100,
          deviationLimit: 0.1,
        }),
      ).toBe(false);
      // Same deviation with a 50% limit -> tradable
      expect(
        isMarketTradable({
          midPrice: 120,
          oraclePrice: 100,
          deviationLimit: 0.5,
        }),
      ).toBe(true);
    });

    it('uses the HyperLiquid 0.95 default when no limit is provided', () => {
      expect(HYPERLIQUID_CONFIG.OraclePriceDeviationLimit).toBe(0.95);
      // Just over 95% -> untradable with the default limit
      expect(
        isMarketTradable({ midPrice: 1.96, oraclePrice: 1 }),
      ).toBe(false);
    });

    it.each([
      ['mid price undefined', { midPrice: undefined, oraclePrice: 50000 }],
      ['oracle price undefined', { midPrice: 50000, oraclePrice: undefined }],
      ['mid price NaN', { midPrice: NaN, oraclePrice: 50000 }],
      ['oracle price NaN', { midPrice: 50000, oraclePrice: NaN }],
      ['mid price zero', { midPrice: 0, oraclePrice: 50000 }],
      ['oracle price zero', { midPrice: 50000, oraclePrice: 0 }],
      ['oracle price negative', { midPrice: 50000, oraclePrice: -1 }],
    ])('defaults to tradable when %s', (_label, params) => {
      expect(isMarketTradable(params)).toBe(true);
    });
  });
});
