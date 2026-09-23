import { KeyringTypes } from '@metamask/keyring-controller';
import { EthKeyring } from '@metamask/keyring-utils';

import { isMpcKeyring, isMoneyKeyring, MPC_KEYRING_TYPE } from './utils.js';

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

describe('isMpcKeyring', () => {
  it('returns true for an MPC Keyring', () => {
    expect(
      isMpcKeyring({ type: MPC_KEYRING_TYPE } as unknown as EthKeyring),
    ).toBe(true);
  });

  it('returns false for a non-MPC Keyring', () => {
    expect(
      isMpcKeyring({ type: KeyringTypes.money } as unknown as EthKeyring),
    ).toBe(false);
  });
});
