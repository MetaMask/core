import { IdMap } from './id-map.js';
import type {
  AccountTreePayload,
  AccountWalletMnemonicPayload,
  AccountWalletPrivateKeyPayload,
} from './payload.js';
import { ACCOUNT_TREE_PAYLOAD_CURRENT_VERSION } from './payload.js';
import { AccountTreeSnapshot } from './snapshot.js';

const MOCK_MNEMONIC_WALLET: AccountWalletMnemonicPayload = {
  id: 'wallet:entropy-source-1',
  type: 'mnemonic',
  metadata: { name: 'Wallet 1' },
  groups: [
    {
      id: 'wallet:entropy-source-1/0',
      groupIndex: 0,
      metadata: { name: 'Account 1', pinned: false, hidden: false },
    },
    {
      id: 'wallet:entropy-source-1/1',
      groupIndex: 1,
      metadata: { name: 'Account 2', pinned: true, hidden: false },
    },
  ],
};

const MOCK_PRIVATE_KEY_WALLET: AccountWalletPrivateKeyPayload = {
  id: 'wallet:private-key',
  type: 'private-key',
  metadata: { name: 'Imported Accounts' },
  groups: [
    {
      id: 'wallet:private-key/0xdeadbeef',
      metadata: { name: 'Imported 1', pinned: false, hidden: true },
    },
  ],
};

function buildIdMap(): IdMap {
  const map = new IdMap();
  map.add('entropy:wallet-1', 'wallet:entropy-source-1');
  map.add('entropy:wallet-1/0', 'wallet:entropy-source-1/0');
  map.add('entropy:wallet-1/1', 'wallet:entropy-source-1/1');
  map.add('keyring:simple', 'wallet:private-key');
  map.add('keyring:simple/0xdeadbeef', 'wallet:private-key/0xdeadbeef');
  return map;
}

describe('AccountTreeSnapshot', () => {
  describe('immutability', () => {
    it('deep-freezes entries at construction so predicates cannot mutate them', () => {
      const snapshot = new AccountTreeSnapshot([MOCK_MNEMONIC_WALLET]);

      expect(() =>
        snapshot.filterWallets((wallet) => {
          (wallet.metadata as { name: string }).name = 'hacked';
          return true;
        }),
      ).toThrow(TypeError);

      expect(snapshot.serialize().wallets[0]?.metadata.name).toBe('Wallet 1');
    });
  });

  describe('filterWallets', () => {
    it('returns a snapshot containing only matching entries', () => {
      const snapshot = new AccountTreeSnapshot(
        [MOCK_MNEMONIC_WALLET, MOCK_PRIVATE_KEY_WALLET],
      );
      const filtered = snapshot.filterWallets(
        (wallet) => wallet.type === 'mnemonic',
      );
      expect(filtered.serialize().wallets).toHaveLength(1);
      expect(filtered.serialize().wallets[0]?.id).toBe(
        'wallet:entropy-source-1',
      );
    });

    it('preserves absent idMap when filtering', () => {
      const snapshot = new AccountTreeSnapshot(
        [MOCK_MNEMONIC_WALLET, MOCK_PRIVATE_KEY_WALLET],
      );
      const filtered = snapshot.filterWallets(() => true);
      expect(filtered.toLocalId('wallet:entropy-source-1')).toBeUndefined();
    });

    it('preserves the original idMap through wallet filtering', () => {
      const map = buildIdMap();
      const snapshot = new AccountTreeSnapshot(
        [MOCK_MNEMONIC_WALLET, MOCK_PRIVATE_KEY_WALLET],
        map,
      );

      const filtered = snapshot.filterWallets(
        (wallet) => wallet.type === 'mnemonic',
      );

      expect(filtered.toLocalId('wallet:entropy-source-1')).toBe(
        'entropy:wallet-1',
      );
      expect(filtered.toLocalId('wallet:entropy-source-1/0')).toBe(
        'entropy:wallet-1/0',
      );
      expect(filtered.toLocalId('wallet:private-key')).toBe('keyring:simple');
      expect(filtered.toLocalId('wallet:private-key/0xdeadbeef')).toBe(
        'keyring:simple/0xdeadbeef',
      );
    });

    it('handles wallet entries whose IDs are not in the idMap', () => {
      const map = new IdMap();
      map.add('entropy:wallet-1', 'wallet:entropy-source-1');

      const snapshot = new AccountTreeSnapshot(
        [MOCK_MNEMONIC_WALLET, MOCK_PRIVATE_KEY_WALLET],
        map,
      );

      const filtered = snapshot.filterWallets(() => true);
      expect(filtered.toLocalId('wallet:entropy-source-1')).toBe(
        'entropy:wallet-1',
      );
      expect(filtered.toLocalId('wallet:private-key')).toBeUndefined();
    });
  });

  describe('filterGroups', () => {
    it('filters groups within a single wallet and leaves others unchanged', () => {
      const snapshot = new AccountTreeSnapshot(
        [MOCK_MNEMONIC_WALLET, MOCK_PRIVATE_KEY_WALLET],
      );

      const filtered = snapshot.filterGroups(
        'wallet:entropy-source-1',
        (group) => group.id.endsWith('/0'),
      );

      const wallets = filtered.serialize().wallets;
      expect(wallets).toHaveLength(2);
      expect(wallets[0]?.groups).toHaveLength(1);
      expect(wallets[0]?.groups[0]?.id).toBe('wallet:entropy-source-1/0');
      expect(wallets[1]?.groups).toHaveLength(1);
    });

    it('removes the wallet when all groups are filtered out', () => {
      const snapshot = new AccountTreeSnapshot(
        [MOCK_MNEMONIC_WALLET, MOCK_PRIVATE_KEY_WALLET],
      );

      const filtered = snapshot.filterGroups(
        'wallet:entropy-source-1',
        () => false,
      );

      expect(filtered.serialize().wallets).toHaveLength(1);
      expect(filtered.serialize().wallets[0]?.type).toBe('private-key');
    });

    it('filters private-key wallet groups and preserves the idMap', () => {
      const map = buildIdMap();
      const snapshot = new AccountTreeSnapshot(
        [MOCK_MNEMONIC_WALLET, MOCK_PRIVATE_KEY_WALLET],
        map,
      );

      const filtered = snapshot.filterGroups(
        'wallet:private-key',
        () => true,
      );

      expect(filtered.serialize().wallets).toHaveLength(2);
      expect(filtered.toLocalId('wallet:private-key/0xdeadbeef')).toBe(
        'keyring:simple/0xdeadbeef',
      );
    });

    it('preserves the idMap when filtering mnemonic wallet groups', () => {
      const map = buildIdMap();
      const snapshot = new AccountTreeSnapshot(
        [MOCK_MNEMONIC_WALLET, MOCK_PRIVATE_KEY_WALLET],
        map,
      );

      const filtered = snapshot.filterGroups(
        'wallet:entropy-source-1',
        (group) => group.id.endsWith('/0'),
      );

      expect(filtered.toLocalId('wallet:entropy-source-1/0')).toBe(
        'entropy:wallet-1/0',
      );
      expect(filtered.toLocalId('wallet:entropy-source-1/1')).toBe(
        'entropy:wallet-1/1',
      );
    });

    it('throws when the wallet ID is not in the snapshot', () => {
      const snapshot = new AccountTreeSnapshot([MOCK_MNEMONIC_WALLET]);

      expect(() =>
        snapshot.filterGroups('wallet:missing', () => true),
      ).toThrow('wallet "wallet:missing" not found in snapshot');
    });
  });

  describe('filterAllGroups', () => {
    it('filters groups across all wallets and removes empty wallets', () => {
      const snapshot = new AccountTreeSnapshot(
        [MOCK_MNEMONIC_WALLET, MOCK_PRIVATE_KEY_WALLET],
      );

      const filtered = snapshot.filterAllGroups((group) =>
        group.id.endsWith('/0'),
      );

      const wallets = filtered.serialize().wallets;
      expect(wallets).toHaveLength(1);
      expect(wallets[0]?.type).toBe('mnemonic');
      expect(wallets[0]?.groups).toHaveLength(1);
    });

    it('provides the parent wallet to the predicate', () => {
      const snapshot = new AccountTreeSnapshot(
        [MOCK_MNEMONIC_WALLET, MOCK_PRIVATE_KEY_WALLET],
      );

      const filtered = snapshot.filterAllGroups(
        (_group, wallet) => wallet.type === 'private-key',
      );

      expect(filtered.serialize().wallets).toHaveLength(1);
      expect(filtered.serialize().wallets[0]?.type).toBe('private-key');
    });

    it('preserves the idMap when filtering all groups', () => {
      const map = buildIdMap();
      const snapshot = new AccountTreeSnapshot(
        [MOCK_MNEMONIC_WALLET, MOCK_PRIVATE_KEY_WALLET],
        map,
      );

      const filtered = snapshot.filterAllGroups(
        (_group, wallet) => wallet.type === 'mnemonic',
      );

      expect(filtered.toLocalId('wallet:entropy-source-1/0')).toBe(
        'entropy:wallet-1/0',
      );
      expect(filtered.toLocalId('wallet:private-key')).toBe('keyring:simple');
    });
  });

  describe('toLocalId', () => {
    it('returns the local ID for a known payload wallet ID', () => {
      const map = buildIdMap();
      const snapshot = new AccountTreeSnapshot([MOCK_MNEMONIC_WALLET], map);
      expect(snapshot.toLocalId('wallet:entropy-source-1')).toBe(
        'entropy:wallet-1',
      );
    });

    it('returns the local ID for a known payload group ID', () => {
      const map = buildIdMap();
      const snapshot = new AccountTreeSnapshot([MOCK_MNEMONIC_WALLET], map);
      expect(snapshot.toLocalId('wallet:entropy-source-1/0')).toBe(
        'entropy:wallet-1/0',
      );
    });

    it('returns undefined when no idMap is present', () => {
      const snapshot = new AccountTreeSnapshot([MOCK_MNEMONIC_WALLET]);
      expect(snapshot.toLocalId('wallet:entropy-source-1')).toBeUndefined();
    });

    it('returns undefined for an unknown payload ID', () => {
      const snapshot = new AccountTreeSnapshot(
        [MOCK_MNEMONIC_WALLET],
        new IdMap(),
      );
      expect(snapshot.toLocalId('wallet:unknown')).toBeUndefined();
    });
  });

  describe('toPayloadId', () => {
    it('returns the payload ID for a known local wallet ID', () => {
      const map = buildIdMap();
      const snapshot = new AccountTreeSnapshot([MOCK_MNEMONIC_WALLET], map);
      expect(snapshot.toPayloadId('entropy:wallet-1')).toBe(
        'wallet:entropy-source-1',
      );
    });

    it('returns the payload ID for a known local group ID', () => {
      const map = buildIdMap();
      const snapshot = new AccountTreeSnapshot([MOCK_MNEMONIC_WALLET], map);
      expect(snapshot.toPayloadId('entropy:wallet-1/0')).toBe(
        'wallet:entropy-source-1/0',
      );
    });

    it('returns undefined when no idMap is present', () => {
      const snapshot = new AccountTreeSnapshot([MOCK_MNEMONIC_WALLET]);
      expect(snapshot.toPayloadId('entropy:wallet-1')).toBeUndefined();
    });

    it('returns undefined for an unknown local ID', () => {
      const snapshot = new AccountTreeSnapshot(
        [MOCK_MNEMONIC_WALLET],
        new IdMap(),
      );
      expect(snapshot.toPayloadId('entropy:wallet-unknown')).toBeUndefined();
    });
  });

  describe('serialize', () => {
    it('serializes to a versioned AccountTreePayload', () => {
      const snapshot = new AccountTreeSnapshot(
        [MOCK_MNEMONIC_WALLET, MOCK_PRIVATE_KEY_WALLET],
      );
      const payload = snapshot.serialize();
      expect(payload.version).toBe(ACCOUNT_TREE_PAYLOAD_CURRENT_VERSION);
      expect(payload.wallets).toHaveLength(2);
      expect(payload.wallets[0]).toStrictEqual(MOCK_MNEMONIC_WALLET);
      expect(payload.wallets[1]).toStrictEqual(MOCK_PRIVATE_KEY_WALLET);
      expect(Object.isFrozen(payload.wallets)).toBe(true);
    });

    it('serializes an empty snapshot', () => {
      const snapshot = new AccountTreeSnapshot([]);
      const payload = snapshot.serialize();
      expect(payload.version).toBe(ACCOUNT_TREE_PAYLOAD_CURRENT_VERSION);
      expect(payload.wallets).toHaveLength(0);
    });
  });

  describe('deserialize', () => {
    it('deserializes a valid v1 payload into a snapshot', () => {
      const raw: AccountTreePayload = {
        version: ACCOUNT_TREE_PAYLOAD_CURRENT_VERSION,
        wallets: [MOCK_MNEMONIC_WALLET],
      };
      const snapshot = AccountTreeSnapshot.deserialize(raw);
      expect(snapshot.serialize().wallets).toHaveLength(1);
      expect(snapshot.serialize().wallets[0]?.id).toBe(
        'wallet:entropy-source-1',
      );
    });

    it('returns a snapshot with no idMap (toLocalId returns undefined)', () => {
      const raw: AccountTreePayload = {
        version: ACCOUNT_TREE_PAYLOAD_CURRENT_VERSION,
        wallets: [MOCK_MNEMONIC_WALLET],
      };
      const snapshot = AccountTreeSnapshot.deserialize(raw);
      expect(snapshot.toLocalId('wallet:entropy-source-1')).toBeUndefined();
      expect(snapshot.toPayloadId('entropy:wallet-1')).toBeUndefined();
    });

    it('throws for an invalid payload (no version)', () => {
      expect(() => AccountTreeSnapshot.deserialize({ wallets: [] })).toThrow(
        'Invalid AccountTreePayload',
      );
    });

    it('throws for a future version', () => {
      expect(() =>
        AccountTreeSnapshot.deserialize({
          version: ACCOUNT_TREE_PAYLOAD_CURRENT_VERSION + 1,
          wallets: [],
        }),
      ).toThrow('Unsupported AccountTreePayload version');
    });

    it('throws for an unsupported wallet type', () => {
      expect(() =>
        AccountTreeSnapshot.deserialize({
          version: ACCOUNT_TREE_PAYLOAD_CURRENT_VERSION,
          wallets: [
            {
              id: 'wallet:ledger',
              type: 'ledger',
              metadata: { name: '' },
              groups: [],
            },
          ],
        }),
      ).toThrow('Invalid AccountTreePayload');
    });
  });
});
