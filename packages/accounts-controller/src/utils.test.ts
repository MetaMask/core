import type { KeyringObject } from '@metamask/keyring-controller';
import { KeyringTypes } from '@metamask/keyring-controller';

import { getGroupIndexFromAddressIndex, isNormalKeyringType } from './utils';

describe('utils', () => {
  describe('isNormalKeyringType', () => {
    const { snap: snapKeyringType, ...keyringTypes } = KeyringTypes;

    it('returns true for normal keyring types', () => {
      for (const keyringType of Object.values(keyringTypes)) {
        expect(isNormalKeyringType(keyringType)).toBe(true);
      }
    });

    it('returns false for snap keyring type', () => {
      expect(isNormalKeyringType(snapKeyringType)).toBe(false);
    });
  });

  describe('getGroupIndexFromAddressIndex', () => {
    const keyring: KeyringObject = {
      type: KeyringTypes.hd,
      accounts: ['0x123', '0x456', '0x789'],
      metadata: {
        id: 'mock-id',
        name: '',
      },
    };

    it('returns the group index for a valid address', () => {
      expect(getGroupIndexFromAddressIndex(keyring, keyring.accounts[0])).toBe(
        0,
      );
      expect(getGroupIndexFromAddressIndex(keyring, keyring.accounts[1])).toBe(
        1,
      );
      expect(getGroupIndexFromAddressIndex(keyring, keyring.accounts[2])).toBe(
        2,
      );
    });

    it('returns undefined for non-HD keyrings', () => {
      const { hd, ...badKeyringTypes } = KeyringTypes;

      for (const badKeyringType of Object.values(badKeyringTypes)) {
        const badKeyring = {
          ...keyring,
          type: badKeyringType,
        };

        expect(
          getGroupIndexFromAddressIndex(badKeyring, keyring.accounts[0]),
        ).toBeUndefined();
      }
    });

    it('returns undefined and log a warning if address cannot be found', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const badAddress = '0xbad';
      expect(
        getGroupIndexFromAddressIndex(keyring, badAddress),
      ).toBeUndefined();
      expect(consoleSpy).toHaveBeenCalledWith(
        `! Unable to get group index for HD account: "${badAddress}"`,
      );
    });
  });
});
