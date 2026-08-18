import { KeyringTypes } from '@metamask/keyring-controller';
import type { KeyringObject } from '@metamask/keyring-controller';

import {
  getHdKeyringEntropySourceIds,
  getPrimaryHdKeyringEntropySourceId,
} from './entropy-source.js';

const hd = (id: string): KeyringObject => ({
  type: KeyringTypes.hd,
  accounts: [],
  metadata: { id, name: '' },
});

describe('entropy-source utils', () => {
  describe('getHdKeyringEntropySourceIds', () => {
    it('returns HD keyring metadata IDs, primary first', () => {
      const keyrings: KeyringObject[] = [
        hd('primary'),
        {
          type: 'Simple Key Pair',
          accounts: [],
          metadata: { id: 'simple', name: '' },
        },
        hd('secondary'),
      ];

      expect(getHdKeyringEntropySourceIds(keyrings)).toStrictEqual([
        'primary',
        'secondary',
      ]);
    });

    it('returns an empty array when keyrings are missing or empty', () => {
      expect(getHdKeyringEntropySourceIds(undefined)).toStrictEqual([]);
      expect(getHdKeyringEntropySourceIds(null)).toStrictEqual([]);
      expect(getHdKeyringEntropySourceIds([])).toStrictEqual([]);
    });
  });

  describe('getPrimaryHdKeyringEntropySourceId', () => {
    it('returns the first HD keyring metadata ID', () => {
      expect(
        getPrimaryHdKeyringEntropySourceId([hd('primary'), hd('secondary')]),
      ).toBe('primary');
    });

    it('throws when no HD keyring is available', () => {
      expect(() => getPrimaryHdKeyringEntropySourceId([])).toThrow(
        'no HD keyring available',
      );
    });
  });
});
