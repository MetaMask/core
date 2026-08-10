import {
  ACCOUNT_TREE_PAYLOAD_CURRENT_VERSION,
  assertValidAccountTreePayload,
  migrate,
  parsePayloadGroupId,
  toWalletPayloadId,
} from './payload.js';
import { AccountTreeSnapshot } from './snapshot.js';

const VALID_MNEMONIC_PAYLOAD = {
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
  it('throws if raw is not an object', async () => {
    await expect(migrate('not an object')).rejects.toThrow(
      'Invalid AccountTreePayload',
    );
    await expect(migrate(null)).rejects.toThrow('Invalid AccountTreePayload');
    await expect(migrate(42)).rejects.toThrow('Invalid AccountTreePayload');
  });

  it('throws if the wallets field is missing', async () => {
    await expect(migrate({})).rejects.toThrow('Invalid AccountTreePayload');
    await expect(migrate({ version: '1' })).rejects.toThrow(
      'Invalid AccountTreePayload',
    );
    await expect(migrate({ version: 1.5 })).rejects.toThrow(
      'Invalid AccountTreePayload',
    );
  });

  it('throws if version in the versioned envelope exceeds the current migration version', async () => {
    const futureVersion = ACCOUNT_TREE_PAYLOAD_CURRENT_VERSION + 1;
    await expect(
      migrate({ version: futureVersion, data: { wallets: [] } }),
    ).rejects.toThrow(
      `State version ${futureVersion} is newer than the latest migration version ${ACCOUNT_TREE_PAYLOAD_CURRENT_VERSION}`,
    );
  });

  it('returns the inner payload for a valid v1 payload', async () => {
    const raw = { wallets: [] };
    const result = await migrate(raw);
    expect(result.wallets).toStrictEqual([]);
  });

  it('accepts a valid mnemonic payload', async () => {
    const result = await migrate(VALID_MNEMONIC_PAYLOAD);
    expect(result.wallets).toHaveLength(1);
    expect(result.wallets[0]?.type).toBe('mnemonic');
  });

  it('accepts a valid private-key payload', async () => {
    const result = await migrate(VALID_PRIVATE_KEY_PAYLOAD);
    expect(result.wallets).toHaveLength(1);
    expect(result.wallets[0]?.type).toBe('private-key');
  });

  it('throws for an unsupported wallet type', async () => {
    await expect(
      migrate({
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

  it('throws when required wallet fields are missing', async () => {
    await expect(
      migrate({
        wallets: [{ type: 'mnemonic' }],
      }),
    ).rejects.toThrow('Invalid AccountTreePayload');
  });

  it('redacts mnemonic secrets in validation error messages', async () => {
    const secretMnemonic =
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

    let expectedError: unknown;
    try {
      await migrate({
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
      expectedError = error;
    }
    expect(String(expectedError)).toContain('***');

    const validWithSecret = await migrate({
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

  it('redacts private keys in validation error messages', async () => {
    const secretKey =
      '4c0883a69102937d6231471b5dbb6e538eba0ef8b09f0bf4e8b8e1e4e3e3b3c2';

    let expectedError: unknown;
    try {
      await migrate({
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
      expectedError = error;
    }
    expect(String(expectedError)).not.toContain(secretKey);
  });
});

describe('assertValidAccountTreePayload', () => {
  it('does not throw for a valid payload', () => {
    expect(() => assertValidAccountTreePayload({ wallets: [] })).not.toThrow();
  });

  it('throws with "Invalid AccountTreePayload:" prefix for an invalid payload', () => {
    expect(() =>
      assertValidAccountTreePayload({ wallets: 'not-an-array' }),
    ).toThrow('Invalid AccountTreePayload:');
  });

  it('throws when a group ID does not match the expected format', () => {
    expect(() =>
      assertValidAccountTreePayload({
        wallets: [
          {
            id: 'wallet:entropy',
            type: 'mnemonic',
            metadata: { name: 'Wallet' },
            groups: [
              {
                id: 'no-slash-here',
                groupIndex: 0,
                metadata: { name: 'Account', pinned: false, hidden: false },
              },
            ],
          },
        ],
      }),
    ).toThrow('Invalid AccountTreePayload:');
  });
});

describe('AccountTreeSnapshot.deserialize validation', () => {
  it('rejects payloads with unsupported wallet types', async () => {
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
