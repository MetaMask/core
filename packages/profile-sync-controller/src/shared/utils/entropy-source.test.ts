import { KeyringTypes } from '@metamask/keyring-controller';
import type { KeyringObject } from '@metamask/keyring-controller';

import { getPrimaryHdKeyringEntropySourceId } from './entropy-source.js';

const hd = (id: string): KeyringObject => ({
  type: KeyringTypes.hd,
  accounts: [],
  metadata: { id, name: '' },
});

describe('entropy-source utils', () => {
  describe('getPrimaryHdKeyringEntropySourceId', () => {
    it('returns the first HD keyring metadata ID', () => {
      expect(
        getPrimaryHdKeyringEntropySourceId({
          isUnlocked: true,
          keyrings: [hd('primary'), hd('secondary')],
        }),
      ).toBe('primary');
    });

    it('throws when no HD keyring is available', () => {
      expect(() =>
        getPrimaryHdKeyringEntropySourceId({ isUnlocked: false, keyrings: [] }),
      ).toThrow('no HD keyring available');
    });
  });
});
