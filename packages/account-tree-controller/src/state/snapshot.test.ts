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
  describe('filter', () => {
    it('returns a snapshot containing only matching entries', () => {
      const snapshot = new AccountTreeSnapshot(
        [MOCK_MNEMONIC_WALLET, MOCK_PRIVATE_KEY_WALLET],
        null,
      );
      const filtered = snapshot.filter((e) => e.type === 'mnemonic');
      expect(filtered.serialize().wallets).toHaveLength(1);
      expect(filtered.serialize().wallets[0]?.id).toBe(
        'wallet:entropy-source-1',
      );
    });

    it('preserves null idMap when filtering', () => {
      const snapshot = new AccountTreeSnapshot(
        [MOCK_MNEMONIC_WALLET, MOCK_PRIVATE_KEY_WALLET],
        null,
      );
      const filtered = snapshot.filter(() => true);
      expect(filtered.toLocalId('wallet:entropy-source-1')).toBeUndefined();
    });

    it('prunes the idMap to only include entries for kept wallets', () => {
      const map = buildIdMap();
      const snapshot = new AccountTreeSnapshot(
        [MOCK_MNEMONIC_WALLET, MOCK_PRIVATE_KEY_WALLET],
        map,
      );

      const filtered = snapshot.filter((e) => e.type === 'mnemonic');

      expect(filtered.toLocalId('wallet:entropy-source-1')).toBe(
        'entropy:wallet-1',
      );
      expect(filtered.toLocalId('wallet:entropy-source-1/0')).toBe(
        'entropy:wallet-1/0',
      );
      // Private key wallet entries should not be in the filtered map.
      expect(filtered.toLocalId('wallet:private-key')).toBeUndefined();
      expect(
        filtered.toLocalId('wallet:private-key/0xdeadbeef'),
      ).toBeUndefined();
    });

    it('handles wallet entries whose IDs are not in the idMap', () => {
      const map = new IdMap();
      // Only add one of the two wallets to the map.
      map.add('entropy:wallet-1', 'wallet:entropy-source-1');

      const snapshot = new AccountTreeSnapshot(
        [MOCK_MNEMONIC_WALLET, MOCK_PRIVATE_KEY_WALLET],
        map,
      );

      const filtered = snapshot.filter(() => true);
      expect(filtered.toLocalId('wallet:entropy-source-1')).toBe(
        'entropy:wallet-1',
      );
      // Private key wallet was not in the map — it should still be absent.
      expect(filtered.toLocalId('wallet:private-key')).toBeUndefined();
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
      const snapshot = new AccountTreeSnapshot([MOCK_MNEMONIC_WALLET], null);
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
      const snapshot = new AccountTreeSnapshot([MOCK_MNEMONIC_WALLET], null);
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
        null,
      );
      const payload = snapshot.serialize();
      expect(payload.version).toBe(ACCOUNT_TREE_PAYLOAD_CURRENT_VERSION);
      expect(payload.wallets).toHaveLength(2);
      expect(payload.wallets[0]).toBe(MOCK_MNEMONIC_WALLET);
      expect(payload.wallets[1]).toBe(MOCK_PRIVATE_KEY_WALLET);
    });

    it('serializes an empty snapshot', () => {
      const snapshot = new AccountTreeSnapshot([], null);
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
  });
});
