import { isBip44MnemonicEntropy } from './types';

describe('isBip44MnemonicEntropy', () => {
  it('returns true for a bip44:mnemonic entropy', () => {
    expect(
      isBip44MnemonicEntropy({ type: 'bip44:mnemonic', id: 'entropy:bip44:mnemonic:some-uuid' }),
    ).toBe(true);
  });

  it('returns false for other bip44 implementations', () => {
    expect(
      isBip44MnemonicEntropy({ type: 'bip44:ledger', id: 'entropy:bip44:ledger:_' }),
    ).toBe(false);
  });

  it('returns false for raw category types', () => {
    expect(
      isBip44MnemonicEntropy({ type: 'raw:private-key', id: 'entropy:raw:private-key:some-uuid' }),
    ).toBe(false);
  });
});
