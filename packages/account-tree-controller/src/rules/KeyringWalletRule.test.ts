import { KeyringTypes } from '@metamask/keyring-controller';

import { getAccountWalletNameFromKeyringType } from './KeyringWalletRule';

describe('KeyringWalletRule', () => {
  describe('getWalletNameFromKeyringType', () => {
    it.each(Object.values(KeyringTypes))(
      'computes wallet name from: %s',
      (type) => {
        const name = getAccountWalletNameFromKeyringType(type as KeyringTypes);

        expect(name).toBeDefined();
        expect(name.length).toBeGreaterThan(0);
      },
    );

    it('defaults to "Unknown" if keyring type is not known', () => {
      const name = getAccountWalletNameFromKeyringType(
        'Not A Keyring Type' as KeyringTypes,
      );

      expect(name).toBe('Unknown');
      expect(name.length).toBeGreaterThan(0);
    });
  });
});
