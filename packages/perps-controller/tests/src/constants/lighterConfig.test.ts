import {
  buildLighterKeyDerivationMessage,
  computeLighterMinOrderSize,
  fromLighterInteger,
  getLighterChainId,
  getLighterHttpEndpoint,
  LIGHTER_DEFAULT_API_KEY_INDEX,
  LIGHTER_ENDPOINTS,
  LIGHTER_MAINNET_CHAIN_ID,
  LIGHTER_TESTNET_CHAIN_ID,
  LIGHTER_TX_TYPE_CANCEL_ORDER,
  LIGHTER_TX_TYPE_CHANGE_PUB_KEY,
  LIGHTER_TX_TYPE_CREATE_ORDER,
  toLighterInteger,
} from '../../../src/constants/lighterConfig.js';

describe('lighterConfig', () => {
  describe('chain ids', () => {
    it('returns testnet chain id 300', () => {
      expect(getLighterChainId('testnet')).toBe(300);
      expect(LIGHTER_TESTNET_CHAIN_ID).toBe(300);
    });

    it('returns mainnet chain id 304', () => {
      expect(getLighterChainId('mainnet')).toBe(304);
      expect(LIGHTER_MAINNET_CHAIN_ID).toBe(304);
    });
  });

  describe('endpoints', () => {
    it('returns the testnet HTTP endpoint', () => {
      expect(getLighterHttpEndpoint('testnet')).toBe(
        'https://testnet.zklighter.elliot.ai',
      );
    });

    it('returns the mainnet HTTP endpoint', () => {
      expect(getLighterHttpEndpoint('mainnet')).toBe(
        'https://mainnet.zklighter.elliot.ai',
      );
    });

    it('defines websocket endpoints per network', () => {
      expect(LIGHTER_ENDPOINTS.testnet.ws).toBe(
        'wss://testnet.zklighter.elliot.ai/stream',
      );
      expect(LIGHTER_ENDPOINTS.mainnet.ws).toBe(
        'wss://mainnet.zklighter.elliot.ai/stream',
      );
    });
  });

  describe('transaction types', () => {
    it('matches the lighter-go txtypes constants', () => {
      expect(LIGHTER_TX_TYPE_CHANGE_PUB_KEY).toBe(8);
      expect(LIGHTER_TX_TYPE_CREATE_ORDER).toBe(14);
      expect(LIGHTER_TX_TYPE_CANCEL_ORDER).toBe(15);
    });
  });

  describe('buildLighterKeyDerivationMessage', () => {
    it('substitutes address, chain id and api key index', () => {
      const message = buildLighterKeyDerivationMessage({
        address: '0xABCDEF0000000000000000000000000000000001',
        chainId: 300,
        apiKeyIndex: LIGHTER_DEFAULT_API_KEY_INDEX,
      });
      expect(message).toContain(
        'Address: 0xabcdef0000000000000000000000000000000001',
      );
      expect(message).toContain('Chain ID: 300');
      expect(message).toContain(
        `API key index: ${LIGHTER_DEFAULT_API_KEY_INDEX}`,
      );
      expect(message).toContain('Only sign this message for a trusted client!');
    });

    it('is deterministic for identical inputs', () => {
      const params = { address: '0xabc', chainId: 300, apiKeyIndex: 7 };
      expect(buildLighterKeyDerivationMessage(params)).toBe(
        buildLighterKeyDerivationMessage(params),
      );
    });
  });

  describe('integerization', () => {
    it('converts human values to wire integers', () => {
      expect(toLighterInteger(0.05, 5)).toBe(5000);
      expect(toLighterInteger(187.25, 1)).toBe(1873);
      expect(toLighterInteger(100000, 1)).toBe(1000000);
    });

    it('throws on values that overflow the safe-integer wire format', () => {
      // 1e300 * 10^5 = 1e305: finite, but stringifies as '1e+305' in
      // signer params instead of an integer.
      expect(() => toLighterInteger(1e300, 5)).toThrow(
        "outside Lighter's integer range",
      );
      expect(() => toLighterInteger(Infinity, 1)).toThrow(
        "outside Lighter's integer range",
      );
      expect(() => toLighterInteger(NaN, 1)).toThrow(
        "outside Lighter's integer range",
      );
      // The largest representable value (MAX_SAFE_INTEGER) still passes.
      expect(toLighterInteger(90071992547409.9, 2)).toBe(
        Number.MAX_SAFE_INTEGER,
      );
    });

    it('returns zero/negative results as-is (positivity policy lives in the signer wrapper)', () => {
      // Generic converter contract: range-checked but sign-agnostic. The
      // provider's internal signer-wire wrapper enforces positive intent.
      expect(toLighterInteger(0.04, 1)).toBe(0);
      expect(toLighterInteger(1e-9, 5)).toBe(0);
      // Math.round rounds -.5 toward +Infinity.
      expect(toLighterInteger(-187.25, 1)).toBe(-1872);
    });

    it('round-trips wire integers back to human values', () => {
      expect(fromLighterInteger(5000, 5)).toBe(0.05);
      expect(fromLighterInteger(1873, 1)).toBe(187.3);
    });
  });

  describe('computeLighterMinOrderSize', () => {
    const market = {
      minBaseAmount: '0.00020',
      minQuoteAmount: '10.000000',
      supportedSizeDecimals: 5,
    };

    it('uses the quote minimum when it dominates', () => {
      // At $100/base, 10 USDC requires 0.1 base > 0.0002 base minimum.
      expect(computeLighterMinOrderSize(market, 100)).toBeCloseTo(0.1, 5);
    });

    it('uses the base minimum when the price is high', () => {
      // At $100k/base, 10 USDC requires 0.0001 base < 0.0002 base minimum.
      expect(computeLighterMinOrderSize(market, 100_000)).toBeCloseTo(
        0.0002,
        5,
      );
    });

    it('rounds up to the market size step', () => {
      const size = computeLighterMinOrderSize(market, 30_000);
      // 10/30000 = 0.000333... → rounded up to 0.00034 at 5 decimals.
      expect(size).toBeCloseTo(0.00034, 6);
    });
  });
});
