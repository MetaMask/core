import { KeyringTypes } from '@metamask/keyring-controller';
import { EthKeyring } from '@metamask/keyring-utils';

import { isMoneyKeyring } from './utils';

describe('isMoneyKeyring', () => {
  it('returns true for a Money Keyring', () => {
    expect(
      // Partial implementation, we only need the type for this test.
      isMoneyKeyring({ type: KeyringTypes.money } as unknown as EthKeyring),
    ).toBe(true);
  });

  it('returns false for a non-Money Keyring', () => {
    expect(
      // Partial implementation, we only need the type for this test.
      isMoneyKeyring({ type: KeyringTypes.hd } as unknown as EthKeyring),
    ).toBe(false);
  });
});
