import {
  ACCOUNT_TREE_PAYLOAD_CURRENT_VERSION,
  migrate,
  parsePayloadGroupId,
  toWalletPayloadId,
} from './payload.js';
import { AccountTreeSnapshot } from './snapshot.js';

const VALID_MNEMONIC_PAYLOAD = {
  version: ACCOUNT_TREE_PAYLOAD_CURRENT_VERSION,
  wallets: [
    {
      id: 'wallet:entropy:mnemonic:abc123',
      type: 'mnemonic',
      metadata: { name: 'Wallet 1' },
      groups: [
        {
          id: 'wallet:entropy:mnemonic:abc123/0',
          groupIndex: 0,
          metadata: { name: 'Account 1', pinned: false, hidden: false },
        },
      ],
    },
  ],
};

const VALID_PRIVATE_KEY_PAYLOAD = {
  version: ACCOUNT_TREE_PAYLOAD_CURRENT_VERSION,
  wallets: [
    {
      id: 'wallet:private-key',
      type: 'private-key',
      metadata: { name: 'Imported' },
      groups: [
        {
          id: 'wallet:private-key/0xdeadbeef',
          metadata: { name: 'Imported 1', pinned: false, hidden: true },
        },
      ],
    },
  ],
};

describe('parsePayloadGroupId', () => {
  it('parses a mnemonic group ID (wallet-id/groupIndex)', () => {
    const result = parsePayloadGroupId('wallet:entropy:mnemonic:abc123/0');
    expect(result.walletId).toBe('wallet:entropy:mnemonic:abc123');
    expect(result.subId).toBe('0');
  });

  it('parses a private-key group ID (wallet:private-key/address)', () => {
    const result = parsePayloadGroupId('wallet:private-key/0xdeadbeef');
    expect(result.walletId).toBe('wallet:private-key');
    expect(result.subId).toBe('0xdeadbeef');
  });

  it('handles subId values that contain colons', () => {
    const result = parsePayloadGroupId('wallet:entropy:mnemonic:uuid/0');
    expect(result.walletId).toBe('wallet:entropy:mnemonic:uuid');
    expect(result.subId).toBe('0');
  });

  it('throws for a group ID with no slash separator', () => {
    expect(() =>
      parsePayloadGroupId('wallet:private-key' as `wallet:${string}/${string}`),
    ).toThrow('Invalid payload group ID');
  });
});

describe('toWalletPayloadId', () => {
  it('returns a wallet payload ID from the entropy source ID', () => {
    expect(toWalletPayloadId('entropy:mnemonic:abc')).toBe(
      'wallet:entropy:mnemonic:abc',
    );
  });

  it('returns the private-key singleton ID from the literal string', () => {
    expect(toWalletPayloadId('private-key')).toBe('wallet:private-key');
  });
});

describe('migrate', () => {
  it('throws if raw is not an object', () => {
    expect(() => migrate('not an object')).toThrow(
      'Invalid AccountTreePayload: expected an object',
    );
    expect(() => migrate(null)).toThrow(
      'Invalid AccountTreePayload: expected an object',
    );
    expect(() => migrate(42)).toThrow(
      'Invalid AccountTreePayload: expected an object',
    );
  });

  it('throws if version field is missing or not a number', () => {
    expect(() => migrate({})).toThrow(
      'Invalid AccountTreePayload: missing numeric version field',
    );
    expect(() => migrate({ version: '1' })).toThrow(
      'Invalid AccountTreePayload: missing numeric version field',
    );
    expect(() => migrate({ version: 1.5 })).toThrow(
      'Invalid AccountTreePayload: missing numeric version field',
    );
  });

  it('throws if version exceeds CURRENT_VERSION', () => {
    expect(() =>
      migrate({ version: ACCOUNT_TREE_PAYLOAD_CURRENT_VERSION + 1 }),
    ).toThrow(
      `Unsupported AccountTreePayload version: ${ACCOUNT_TREE_PAYLOAD_CURRENT_VERSION + 1}`,
    );
  });

  it('throws if version is below CURRENT_VERSION', () => {
    expect(() => migrate({ version: 0, wallets: [] })).toThrow(
      'Unsupported AccountTreePayload version: 0',
    );
  });

  it('returns the payload unchanged for a valid current-version payload', () => {
    const raw = {
      version: ACCOUNT_TREE_PAYLOAD_CURRENT_VERSION,
      wallets: [],
    };
    const result = migrate(raw);
    expect(result).toBe(raw);
    expect(result.version).toBe(ACCOUNT_TREE_PAYLOAD_CURRENT_VERSION);
    expect(result.wallets).toStrictEqual([]);
  });

  it('accepts a valid mnemonic payload', () => {
    const result = migrate(VALID_MNEMONIC_PAYLOAD);
    expect(result.wallets).toHaveLength(1);
    expect(result.wallets[0]?.type).toBe('mnemonic');
  });

  it('accepts a valid private-key payload', () => {
    const result = migrate(VALID_PRIVATE_KEY_PAYLOAD);
    expect(result.wallets).toHaveLength(1);
    expect(result.wallets[0]?.type).toBe('private-key');
  });

  it('throws for an unsupported wallet type', () => {
    expect(() =>
      migrate({
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

  it('throws when required wallet fields are missing', () => {
    expect(() =>
      migrate({
        version: ACCOUNT_TREE_PAYLOAD_CURRENT_VERSION,
        wallets: [{ type: 'mnemonic' }],
      }),
    ).toThrow('Invalid AccountTreePayload');
  });

  it('redacts mnemonic secrets in validation error messages', () => {
    const secretMnemonic =
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

    try {
      migrate({
        version: ACCOUNT_TREE_PAYLOAD_CURRENT_VERSION,
        wallets: [
          {
            id: 'wallet:entropy:mnemonic:abc123',
            type: 'mnemonic',
            value: 123,
            metadata: { name: 'Wallet 1' },
            groups: [],
          },
        ],
      });
      throw new Error('Expected migrate to throw');
    } catch (error) {
      expect(String(error)).toContain('***');
    }

    const validWithSecret = migrate({
      version: ACCOUNT_TREE_PAYLOAD_CURRENT_VERSION,
      wallets: [
        {
          id: 'wallet:entropy:mnemonic:abc123',
          type: 'mnemonic',
          value: secretMnemonic,
          metadata: { name: 'Wallet 1' },
          groups: [],
        },
      ],
    });
    expect(validWithSecret.wallets[0]?.type).toBe('mnemonic');
  });

  it('redacts private keys in validation error messages', () => {
    const secretKey =
      '4c0883a69102937d6231471b5dbb6e538eba0ef8b09f0bf4e8b8e1e4e3e3b3c2';

    try {
      migrate({
        version: ACCOUNT_TREE_PAYLOAD_CURRENT_VERSION,
        wallets: [
          {
            id: 'wallet:private-key',
            type: 'private-key',
            metadata: { name: '' },
            groups: [
              {
                id: 'wallet:private-key/0xabc',
                value: {
                  privateKey: secretKey,
                  encoding: 'invalid-encoding',
                },
                metadata: { name: 'Imported', pinned: false, hidden: false },
              },
            ],
          },
        ],
      });
      throw new Error('Expected migrate to throw');
    } catch (error) {
      expect(String(error)).not.toContain(secretKey);
    }
  });
});

describe('AccountTreeSnapshot.deserialize validation', () => {
  it('rejects payloads with unsupported wallet types', () => {
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
