import { KeyringTypes } from './KeyringController.js';
import {
  selectHdKeyringEntropySourceIds,
  selectPrimaryHdKeyringEntropySourceId,
} from './selectors.js';

describe('KeyringController selectors', () => {
  describe('selectHdKeyringEntropySourceIds', () => {
    it('selects all HD keyring IDs', () => {
      const sourceIds = selectHdKeyringEntropySourceIds({
        isUnlocked: true,
        keyrings: [
          {
            accounts: [],
            type: KeyringTypes.hd.toString(),
            metadata: {
              id: '1',
              name: '1',
            },
          },
          {
            accounts: [],
            type: 'NOT HD',
            metadata: {
              id: '2',
              name: '2',
            },
          },
          {
            accounts: [],
            type: KeyringTypes.hd.toString(),
            metadata: {
              id: '3',
              name: '3',
            },
          },
        ],
      });

      expect(sourceIds).toStrictEqual(['1', '3']);
    });

    it('returns empty array when there are no keyrings', () => {
      const sourceIds = selectHdKeyringEntropySourceIds({
        isUnlocked: true,
        keyrings: [],
      });

      expect(sourceIds).toStrictEqual([]);
    });

    it('returns empty array when there are only non-HD keyrings', () => {
      const sourceIds = selectHdKeyringEntropySourceIds({
        isUnlocked: true,
        keyrings: [
          {
            accounts: [],
            type: 'NOT HD',
            metadata: {
              id: '1',
              name: '1',
            },
          },
          {
            accounts: [],
            type: 'NOT HD',
            metadata: {
              id: '2',
              name: '2',
            },
          },
        ],
      });

      expect(sourceIds).toStrictEqual([]);
    });
  });

  describe('selectPrimaryHdKeyringEntropySourceId', () => {
    it('selects the first HD keyring ID', () => {
      const primaryId = selectPrimaryHdKeyringEntropySourceId({
        isUnlocked: true,
        keyrings: [
          {
            accounts: [],
            type: 'NOT HD',
            metadata: {
              id: '1',
              name: '1',
            },
          },
          {
            accounts: [],
            type: KeyringTypes.hd.toString(),
            metadata: {
              id: '2',
              name: '2',
            },
          },
          {
            accounts: [],
            type: KeyringTypes.hd.toString(),
            metadata: {
              id: '3',
              name: '3',
            },
          },
        ],
      });

      expect(primaryId).toBe('2');
    });

    it('returns undefined when there are no keyrings', () => {
      const primaryId = selectPrimaryHdKeyringEntropySourceId({
        isUnlocked: true,
        keyrings: [],
      });

      expect(primaryId).toBeUndefined();
    });

    it('returns undefined when there are only non-HD keyrings', () => {
      const primaryId = selectPrimaryHdKeyringEntropySourceId({
        isUnlocked: true,
        keyrings: [
          {
            accounts: [],
            type: 'NOT HD',
            metadata: {
              id: '1',
              name: '1',
            },
          },
          {
            accounts: [],
            type: 'NOT HD',
            metadata: {
              id: '2',
              name: '2',
            },
          },
        ],
      });

      expect(primaryId).toBeUndefined();
    });
  });
});
