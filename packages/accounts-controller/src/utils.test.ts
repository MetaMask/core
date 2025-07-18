import type { KeyringObject } from '@metamask/keyring-controller';
import { KeyringTypes } from '@metamask/keyring-controller';

import { getGroupIndexFromAddress } from './utils';

describe('utils', () => {
  describe('getGroupIndexFromAddress', () => {
    const keyring: KeyringObject = {
      type: KeyringTypes.hd,
      accounts: ['0x123', '0x456', '0x789'],
      metadata: {
        id: 'mock-id',
        name: '',
      },
    };

    it('returns the group index for a valid address', () => {
      expect(getGroupIndexFromAddress(keyring, keyring.accounts[0])).toBe(0);
      expect(getGroupIndexFromAddress(keyring, keyring.accounts[1])).toBe(1);
      expect(getGroupIndexFromAddress(keyring, keyring.accounts[2])).toBe(2);
    });

    it('returns undefined for non-HD keyrings', () => {
      const badKeyring = {
        ...keyring,
        type: KeyringTypes.snap,
      };

      expect(
        getGroupIndexFromAddress(badKeyring, keyring.accounts[0]),
      ).toBeUndefined();
    });

    it('returns undefined and log a warning if address cannot be found', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const badAddress = '0xbad';
      expect(getGroupIndexFromAddress(keyring, badAddress)).toBeUndefined();
      expect(consoleSpy).toHaveBeenCalledWith(
        `! Unable to get group index for HD account: "${badAddress}"`,
      );
    });
  });
});
