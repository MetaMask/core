import { IdMap } from './id-map.js';
import type {
  AccountWalletMnemonicPayload,
  AccountWalletPrivateKeyPayload,
} from './payload.js';
import {
  ACCOUNT_TREE_PAYLOAD_CURRENT_VERSION,
  AccountWalletPayloadType,
  toGroupPayloadId,
  toWalletPayloadId,
} from './payload.js';
import { AccountTreeSnapshot } from './snapshot.js';

const MOCK_MNEMONIC_PAYLOAD_ID = toWalletPayloadId('entropy-source-1');
const MOCK_PK_PAYLOAD_ID = toWalletPayloadId(
  AccountWalletPayloadType.PrivateKey,
);

const MOCK_MNEMONIC_WALLET: AccountWalletMnemonicPayload = {
  id: MOCK_MNEMONIC_PAYLOAD_ID,
  type: AccountWalletPayloadType.Mnemonic,
  metadata: { name: 'Wallet 1' },
  groups: [
    {
      id: toGroupPayloadId(MOCK_MNEMONIC_PAYLOAD_ID, 0),
      groupIndex: 0,
      metadata: { name: 'Account 1', pinned: false, hidden: false },
    },
    {
      id: toGroupPayloadId(MOCK_MNEMONIC_PAYLOAD_ID, 1),
      groupIndex: 1,
      metadata: { name: 'Account 2', pinned: true, hidden: false },
    },
  ],
};

const MOCK_PRIVATE_KEY_WALLET: AccountWalletPrivateKeyPayload = {
  id: MOCK_PK_PAYLOAD_ID,
  type: AccountWalletPayloadType.PrivateKey,
  metadata: { name: 'Imported Accounts' },
  groups: [
    {
      id: toGroupPayloadId(MOCK_PK_PAYLOAD_ID, '0xdeadbeef'),
      metadata: { name: 'Imported 1', pinned: false, hidden: true },
    },
  ],
};

function buildIdMap(): IdMap {
  const map = new IdMap();
  map.add('entropy:wallet-1', MOCK_MNEMONIC_PAYLOAD_ID);
  map.add('entropy:wallet-1/0', toGroupPayloadId(MOCK_MNEMONIC_PAYLOAD_ID, 0));
  map.add('entropy:wallet-1/1', toGroupPayloadId(MOCK_MNEMONIC_PAYLOAD_ID, 1));
  map.add('keyring:simple', MOCK_PK_PAYLOAD_ID);
  map.add(
    'keyring:simple/0xdeadbeef',
    toGroupPayloadId(MOCK_PK_PAYLOAD_ID, '0xdeadbeef'),
  );
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
      const snapshot = new AccountTreeSnapshot([
        MOCK_MNEMONIC_WALLET,
        MOCK_PRIVATE_KEY_WALLET,
      ]);
      const filtered = snapshot.filterWallets(
        (wallet) => wallet.type === AccountWalletPayloadType.Mnemonic,
      );
      expect(filtered.serialize().wallets).toHaveLength(1);
      expect(filtered.serialize().wallets[0]?.id).toBe(
        MOCK_MNEMONIC_PAYLOAD_ID,
      );
    });

    it('preserves absent idMap when filtering', () => {
      const snapshot = new AccountTreeSnapshot([
        MOCK_MNEMONIC_WALLET,
        MOCK_PRIVATE_KEY_WALLET,
      ]);
      const filtered = snapshot.filterWallets(() => true);
      expect(filtered.toLocalId(MOCK_MNEMONIC_PAYLOAD_ID)).toBeUndefined();
    });

    it('preserves the original idMap through wallet filtering', () => {
      const map = buildIdMap();
      const snapshot = new AccountTreeSnapshot(
        [MOCK_MNEMONIC_WALLET, MOCK_PRIVATE_KEY_WALLET],
        map,
      );

      const filtered = snapshot.filterWallets(
        (wallet) => wallet.type === AccountWalletPayloadType.Mnemonic,
      );

      expect(filtered.toLocalId(MOCK_MNEMONIC_PAYLOAD_ID)).toBe(
        'entropy:wallet-1',
      );
      expect(
        filtered.toLocalId(toGroupPayloadId(MOCK_MNEMONIC_PAYLOAD_ID, 0)),
      ).toBe('entropy:wallet-1/0');
      expect(filtered.toLocalId(MOCK_PK_PAYLOAD_ID)).toBe('keyring:simple');
      expect(
        filtered.toLocalId(toGroupPayloadId(MOCK_PK_PAYLOAD_ID, '0xdeadbeef')),
      ).toBe('keyring:simple/0xdeadbeef');
    });

    it('handles wallet entries whose IDs are not in the idMap', () => {
      const map = new IdMap();
      map.add('entropy:wallet-1', MOCK_MNEMONIC_PAYLOAD_ID);

      const snapshot = new AccountTreeSnapshot(
        [MOCK_MNEMONIC_WALLET, MOCK_PRIVATE_KEY_WALLET],
        map,
      );

      const filtered = snapshot.filterWallets(() => true);
      expect(filtered.toLocalId(MOCK_MNEMONIC_PAYLOAD_ID)).toBe(
        'entropy:wallet-1',
      );
      expect(filtered.toLocalId(MOCK_PK_PAYLOAD_ID)).toBeUndefined();
    });
  });

  describe('filterGroups', () => {
    it('filters groups within a single wallet and leaves others unchanged', () => {
      const snapshot = new AccountTreeSnapshot([
        MOCK_MNEMONIC_WALLET,
        MOCK_PRIVATE_KEY_WALLET,
      ]);

      const filtered = snapshot.filterGroups(
        MOCK_MNEMONIC_PAYLOAD_ID,
        (group) => group.id.endsWith('/0'),
      );

      const { wallets } = filtered.serialize();
      expect(wallets).toHaveLength(2);
      expect(wallets[0]?.groups).toHaveLength(1);
      expect(wallets[0]?.groups[0]?.id).toBe(
        toGroupPayloadId(MOCK_MNEMONIC_PAYLOAD_ID, 0),
      );
      expect(wallets[1]?.groups).toHaveLength(1);
    });

    it('removes the wallet when all groups are filtered out', () => {
      const snapshot = new AccountTreeSnapshot([
        MOCK_MNEMONIC_WALLET,
        MOCK_PRIVATE_KEY_WALLET,
      ]);

      const filtered = snapshot.filterGroups(
        MOCK_MNEMONIC_PAYLOAD_ID,
        () => false,
      );

      expect(filtered.serialize().wallets).toHaveLength(1);
      expect(filtered.serialize().wallets[0]?.type).toBe(
        AccountWalletPayloadType.PrivateKey,
      );
    });

    it('filters private-key wallet groups and preserves the idMap', () => {
      const map = buildIdMap();
      const snapshot = new AccountTreeSnapshot(
        [MOCK_MNEMONIC_WALLET, MOCK_PRIVATE_KEY_WALLET],
        map,
      );

      const filtered = snapshot.filterGroups(MOCK_PK_PAYLOAD_ID, () => true);

      expect(filtered.serialize().wallets).toHaveLength(2);
      expect(
        filtered.toLocalId(toGroupPayloadId(MOCK_PK_PAYLOAD_ID, '0xdeadbeef')),
      ).toBe('keyring:simple/0xdeadbeef');
    });

    it('preserves the idMap when filtering mnemonic wallet groups', () => {
      const map = buildIdMap();
      const snapshot = new AccountTreeSnapshot(
        [MOCK_MNEMONIC_WALLET, MOCK_PRIVATE_KEY_WALLET],
        map,
      );

      const filtered = snapshot.filterGroups(
        MOCK_MNEMONIC_PAYLOAD_ID,
        (group) => group.id.endsWith('/0'),
      );

      expect(
        filtered.toLocalId(toGroupPayloadId(MOCK_MNEMONIC_PAYLOAD_ID, 0)),
      ).toBe('entropy:wallet-1/0');
      expect(
        filtered.toLocalId(toGroupPayloadId(MOCK_MNEMONIC_PAYLOAD_ID, 1)),
      ).toBe('entropy:wallet-1/1');
    });

    it('throws when the wallet ID is not in the snapshot', () => {
      const snapshot = new AccountTreeSnapshot([MOCK_MNEMONIC_WALLET]);

      expect(() => snapshot.filterGroups('wallet:missing', () => true)).toThrow(
        'wallet "wallet:missing" not found in snapshot',
      );
    });
  });

  describe('filterAllGroups', () => {
    it('filters groups across all wallets and removes empty wallets', () => {
      const snapshot = new AccountTreeSnapshot([
        MOCK_MNEMONIC_WALLET,
        MOCK_PRIVATE_KEY_WALLET,
      ]);

      const filtered = snapshot.filterAllGroups((group) =>
        group.id.endsWith('/0'),
      );

      const { wallets } = filtered.serialize();
      expect(wallets).toHaveLength(1);
      expect(wallets[0]?.type).toBe(AccountWalletPayloadType.Mnemonic);
      expect(wallets[0]?.groups).toHaveLength(1);
    });

    it('provides the parent wallet to the predicate', () => {
      const snapshot = new AccountTreeSnapshot([
        MOCK_MNEMONIC_WALLET,
        MOCK_PRIVATE_KEY_WALLET,
      ]);

      const filtered = snapshot.filterAllGroups(
        (_group, wallet) => wallet.type === AccountWalletPayloadType.PrivateKey,
      );

      expect(filtered.serialize().wallets).toHaveLength(1);
      expect(filtered.serialize().wallets[0]?.type).toBe(
        AccountWalletPayloadType.PrivateKey,
      );
    });

    it('preserves the idMap when filtering all groups', () => {
      const map = buildIdMap();
      const snapshot = new AccountTreeSnapshot(
        [MOCK_MNEMONIC_WALLET, MOCK_PRIVATE_KEY_WALLET],
        map,
      );

      const filtered = snapshot.filterAllGroups(
        (_group, wallet) => wallet.type === AccountWalletPayloadType.Mnemonic,
      );

      expect(
        filtered.toLocalId(toGroupPayloadId(MOCK_MNEMONIC_PAYLOAD_ID, 0)),
      ).toBe('entropy:wallet-1/0');
      expect(filtered.toLocalId(MOCK_PK_PAYLOAD_ID)).toBe('keyring:simple');
    });
  });

  describe('toLocalId', () => {
    it('returns the local ID for a known payload wallet ID', () => {
      const map = buildIdMap();
      const snapshot = new AccountTreeSnapshot([MOCK_MNEMONIC_WALLET], map);
      expect(snapshot.toLocalId(MOCK_MNEMONIC_PAYLOAD_ID)).toBe(
        'entropy:wallet-1',
      );
    });

    it('returns the local ID for a known payload group ID', () => {
      const map = buildIdMap();
      const snapshot = new AccountTreeSnapshot([MOCK_MNEMONIC_WALLET], map);
      expect(
        snapshot.toLocalId(toGroupPayloadId(MOCK_MNEMONIC_PAYLOAD_ID, 0)),
      ).toBe('entropy:wallet-1/0');
    });

    it('returns undefined when no idMap is present', () => {
      const snapshot = new AccountTreeSnapshot([MOCK_MNEMONIC_WALLET]);
      expect(snapshot.toLocalId(MOCK_MNEMONIC_PAYLOAD_ID)).toBeUndefined();
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
        MOCK_MNEMONIC_PAYLOAD_ID,
      );
    });

    it('returns the payload ID for a known local group ID', () => {
      const map = buildIdMap();
      const snapshot = new AccountTreeSnapshot([MOCK_MNEMONIC_WALLET], map);
      expect(snapshot.toPayloadId('entropy:wallet-1/0')).toBe(
        toGroupPayloadId(MOCK_MNEMONIC_PAYLOAD_ID, 0),
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
    it('serializes to a flat versioned state with version inlined alongside wallet entries', () => {
      const snapshot = new AccountTreeSnapshot([
        MOCK_MNEMONIC_WALLET,
        MOCK_PRIVATE_KEY_WALLET,
      ]);
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
    it('deserializes a valid v1 payload into a snapshot', async () => {
      const raw = {
        version: ACCOUNT_TREE_PAYLOAD_CURRENT_VERSION,
        wallets: [MOCK_MNEMONIC_WALLET],
      };
      const snapshot = await AccountTreeSnapshot.deserialize(raw);
      expect(snapshot.serialize().wallets).toHaveLength(1);
      expect(snapshot.serialize().wallets[0]?.id).toBe(
        MOCK_MNEMONIC_PAYLOAD_ID,
      );
    });

    it('returns a snapshot with no idMap (toLocalId returns undefined)', async () => {
      const raw = {
        version: ACCOUNT_TREE_PAYLOAD_CURRENT_VERSION,
        wallets: [MOCK_MNEMONIC_WALLET],
      };
      const snapshot = await AccountTreeSnapshot.deserialize(raw);
      expect(snapshot.toLocalId(MOCK_MNEMONIC_PAYLOAD_ID)).toBeUndefined();
      expect(snapshot.toPayloadId('entropy:wallet-1')).toBeUndefined();
    });

    it('throws for an invalid payload (missing wallets field)', async () => {
      await expect(AccountTreeSnapshot.deserialize({})).rejects.toThrow(
        'Invalid AccountTreePayload',
      );
    });

    it('throws for an unsupported wallet type', async () => {
      await expect(
        AccountTreeSnapshot.deserialize({
          wallets: [
            {
              id: 'wallet:ledger',
              type: 'ledger',
              metadata: { name: '' },
              groups: [],
            },
          ],
        }),
      ).rejects.toThrow('Invalid AccountTreePayload');
    });
  });
});
