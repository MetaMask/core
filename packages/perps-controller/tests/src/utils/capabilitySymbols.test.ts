import { isValidCapabilitySymbol } from '../../../src/utils/capabilitySymbols.js';

describe('isValidCapabilitySymbol', () => {
  it.each([
    ['ETH', false],
    ['ETH', true],
    ['xyz:TSLA', true],
  ] as const)(
    'accepts %p when provider routes are %p',
    (symbol, allowRoute) => {
      expect(
        isValidCapabilitySymbol(symbol, { allowProviderRoute: allowRoute }),
      ).toBe(true);
    },
  );

  it.each([
    ['', false],
    ['', true],
    [' ETH', false],
    ['ETH ', true],
    ['ETH USD', false],
    ['xyz:TSLA', false],
    [':TSLA', true],
    ['xyz:', true],
    ['xyz:desk:TSLA', true],
  ] as const)(
    'rejects %p when provider routes are %p',
    (symbol, allowRoute) => {
      expect(
        isValidCapabilitySymbol(symbol, { allowProviderRoute: allowRoute }),
      ).toBe(false);
    },
  );
});
