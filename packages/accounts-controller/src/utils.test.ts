import { toChecksumAddress } from '@ethereumjs/util';
import type { KeyringObject } from '@metamask/keyring-controller';
import { KeyringTypes } from '@metamask/keyring-controller';

import { getEvmGroupIndexFromAddressIndex, isNormalKeyringType } from './utils';

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
      accounts: ['0x123abc', '0x456def', '0x7a8b9c'],
      metadata: {
        id: 'mock-id',
        name: '',
      },
    };
    const toLowerCase = (address: string) => address.toLowerCase();
    const toUpperCase = (address: string) => address.toUpperCase();
    const toSameValue = (address: string) => address;

    it('returns the group index for a valid address', () => {
      expect(
        getEvmGroupIndexFromAddressIndex(keyring, keyring.accounts[0]),
      ).toBe(0);
      expect(
        getEvmGroupIndexFromAddressIndex(keyring, keyring.accounts[1]),
      ).toBe(1);
      expect(
        getEvmGroupIndexFromAddressIndex(keyring, keyring.accounts[2]),
      ).toBe(2);
    });

    it.each([
      {
        tc: 'toLowerCase (keyring)',
        modifiers: { keyring: toLowerCase, address: toSameValue },
      },
      {
        tc: 'toUppercase (keyring)',
        modifiers: { keyring: toUpperCase, address: toSameValue },
      },
      {
        tc: 'toChecksumAddress (keyring)',
        modifiers: { keyring: toChecksumAddress, address: toSameValue },
      },
      {
        tc: 'toLowerCase (address)',
        modifiers: { keyring: toSameValue, address: toLowerCase },
      },
      {
        tc: 'toUppercase (address)',
        modifiers: { keyring: toSameValue, address: toUpperCase },
      },
      {
        tc: 'toChecksumAddress (address)',
        modifiers: { keyring: toSameValue, address: toChecksumAddress },
      },
    ])(
      'returns the group index for a address that are not lower-cased with: $tc',
      ({ modifiers }) => {
        const address = keyring.accounts[2];

        expect(
          getEvmGroupIndexFromAddressIndex(
            {
              ...keyring,
              accounts: keyring.accounts.map(modifiers.keyring),
            },
            modifiers.address(address),
          ),
        ).toBe(2);
      },
    );

    it('returns undefined for non-HD keyrings', () => {
      const { hd, ...badKeyringTypes } = KeyringTypes;

      for (const badKeyringType of Object.values(badKeyringTypes)) {
        const badKeyring = {
          ...keyring,
          type: badKeyringType,
        };

        expect(
          getEvmGroupIndexFromAddressIndex(badKeyring, keyring.accounts[0]),
        ).toBeUndefined();
      }
    });

    it('returns undefined and log a warning if address cannot be found', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const badAddress = '0xbad';
      expect(
        getEvmGroupIndexFromAddressIndex(keyring, badAddress),
      ).toBeUndefined();
      expect(consoleSpy).toHaveBeenCalledWith(
        `! Unable to get group index for HD account: "${badAddress}"`,
      );
    });
  });
});
