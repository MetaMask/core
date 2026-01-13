import { Slip44Service } from './Slip44Service';

describe('Slip44Service', () => {
  beforeEach(() => {
    // Clear cache before each test to ensure clean state
    Slip44Service.clearCache();
  });

  describe('getSlip44BySymbol', () => {
    it('returns 60 for ETH symbol', () => {
      const result = Slip44Service.getSlip44BySymbol('ETH');
      expect(result).toBe(60);
    });

    it('returns 0 for BTC symbol', () => {
      const result = Slip44Service.getSlip44BySymbol('BTC');
      expect(result).toBe(0);
    });

    it('returns 501 for SOL symbol', () => {
      const result = Slip44Service.getSlip44BySymbol('SOL');
      expect(result).toBe(501);
    });

    it('returns 195 for TRX symbol', () => {
      const result = Slip44Service.getSlip44BySymbol('TRX');
      expect(result).toBe(195);
    });

    it('returns 2 for LTC symbol', () => {
      const result = Slip44Service.getSlip44BySymbol('LTC');
      expect(result).toBe(2);
    });

    it('returns 3 for DOGE symbol', () => {
      const result = Slip44Service.getSlip44BySymbol('DOGE');
      expect(result).toBe(3);
    });

    it('returns undefined for unknown symbol', () => {
      const result = Slip44Service.getSlip44BySymbol('UNKNOWNCOIN');
      expect(result).toBeUndefined();
    });

    it('is case-insensitive for symbols', () => {
      const lowerResult = Slip44Service.getSlip44BySymbol('eth');
      const upperResult = Slip44Service.getSlip44BySymbol('ETH');
      const mixedResult = Slip44Service.getSlip44BySymbol('Eth');

      expect(lowerResult).toBe(60);
      expect(upperResult).toBe(60);
      expect(mixedResult).toBe(60);
    });

    it('caches the result for repeated lookups', () => {
      // First lookup
      const firstResult = Slip44Service.getSlip44BySymbol('ETH');
      // Second lookup (should come from cache)
      const secondResult = Slip44Service.getSlip44BySymbol('ETH');

      expect(firstResult).toBe(60);
      expect(secondResult).toBe(60);
    });

    it('caches undefined for unknown symbols', () => {
      // First lookup
      const firstResult = Slip44Service.getSlip44BySymbol('UNKNOWNCOIN');
      // Second lookup (should come from cache)
      const secondResult = Slip44Service.getSlip44BySymbol('UNKNOWNCOIN');

      expect(firstResult).toBeUndefined();
      expect(secondResult).toBeUndefined();
    });

    it('returns coin type 1 for empty string (Testnet)', () => {
      // The SLIP-44 data has an entry with empty symbol for "Testnet (all coins)" at index 1
      const result = Slip44Service.getSlip44BySymbol('');
      expect(result).toBe(1);
    });
  });

  describe('getSlip44Entry', () => {
    it('returns entry for ETH coin type 60', () => {
      const result = Slip44Service.getSlip44Entry(60);

      expect(result).toBeDefined();
      expect(result?.symbol).toBe('ETH');
      expect(result?.name).toBe('Ethereum');
      expect(result?.index).toBe('60');
    });

    it('returns entry for BTC coin type 0', () => {
      const result = Slip44Service.getSlip44Entry(0);

      expect(result).toBeDefined();
      expect(result?.symbol).toBe('BTC');
      expect(result?.name).toBe('Bitcoin');
      expect(result?.index).toBe('0');
    });

    it('returns entry for SOL coin type 501', () => {
      const result = Slip44Service.getSlip44Entry(501);

      expect(result).toBeDefined();
      expect(result?.symbol).toBe('SOL');
      expect(result?.name).toBe('Solana');
      expect(result?.index).toBe('501');
    });

    it('returns undefined for non-existent coin type', () => {
      const result = Slip44Service.getSlip44Entry(999999999);
      expect(result).toBeUndefined();
    });

    it('returns undefined for negative coin type', () => {
      const result = Slip44Service.getSlip44Entry(-1);
      expect(result).toBeUndefined();
    });
  });

  describe('clearCache', () => {
    it('clears the cache so lookups are performed again', () => {
      // Perform initial lookup to populate cache
      Slip44Service.getSlip44BySymbol('ETH');

      // Clear the cache
      Slip44Service.clearCache();

      // Perform another lookup - should work correctly
      const result = Slip44Service.getSlip44BySymbol('ETH');
      expect(result).toBe(60);
    });

    it('clears cached undefined values', () => {
      // Perform initial lookup for unknown symbol
      Slip44Service.getSlip44BySymbol('UNKNOWNCOIN');

      // Clear the cache
      Slip44Service.clearCache();

      // Verify cache is cleared (no error thrown)
      const result = Slip44Service.getSlip44BySymbol('UNKNOWNCOIN');
      expect(result).toBeUndefined();
    });
  });

  describe('real-world network symbols', () => {
    it('correctly maps common EVM network native currencies', () => {
      // All EVM networks use ETH or similar tokens with coin type 60
      expect(Slip44Service.getSlip44BySymbol('ETH')).toBe(60);
    });

    it('correctly maps Polygon MATIC symbol', () => {
      const result = Slip44Service.getSlip44BySymbol('MATIC');
      // MATIC has coin type 966
      expect(result).toBe(966);
    });

    it('correctly maps BNB symbol', () => {
      const result = Slip44Service.getSlip44BySymbol('BNB');
      // BNB has coin type 714
      expect(result).toBe(714);
    });
  });
});
