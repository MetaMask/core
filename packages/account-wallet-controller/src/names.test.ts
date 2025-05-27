import { KeyringTypes } from '@metamask/keyring-controller';

import { getWalletNameFromKeyringType } from './names';

describe('names', () => {
  describe('getWalletNameFromKeyringType', () => {
    it.each(Object.values(KeyringTypes))(
      'computes wallet name from: %s',
      (type) => {
        const name = getWalletNameFromKeyringType(type as KeyringTypes);

        expect(name).toBeDefined();
        expect(name.length).toBeGreaterThan(0);
      },
    );

    it('defaults to "Unknown" if keyring type is not known', () => {
      const name = getWalletNameFromKeyringType(
        'Not A Keyring Type' as KeyringTypes,
      );

      expect(name).toBe('Unknown');
      expect(name.length).toBeGreaterThan(0);
    });
  });
});
