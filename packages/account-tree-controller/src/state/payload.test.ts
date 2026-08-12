import { assert } from '@metamask/superstruct';

import {
  ACCOUNT_TREE_PAYLOAD_CURRENT_VERSION,
  AccountTreePayloadStruct,
  AccountWalletPayloadType,
  assertAccountTreePayload,
  parsePayloadGroupId,
  toGroupPayloadId,
  toWalletPayloadId,
} from './payload.js';
import { AccountTreeSnapshot } from './snapshot.js';

const MOCK_BAD_SECRET = 8675309;

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

describe('assertAccountTreePayload', () => {
  it('does not throw for a valid payload', () => {
    expect(() =>
      assertAccountTreePayload({
        version: ACCOUNT_TREE_PAYLOAD_CURRENT_VERSION,
        wallets: [],
      }),
    ).not.toThrow();
  });

  it('throws with "Invalid AccountTreePayload:" prefix for an invalid payload', () => {
    expect(() =>
      assertAccountTreePayload({
        version: ACCOUNT_TREE_PAYLOAD_CURRENT_VERSION,
        wallets: 'not-an-array',
      }),
    ).toThrow('Invalid AccountTreePayload:');
  });

  it('throws when the version field is missing', () => {
    expect(() => assertAccountTreePayload({ wallets: [] })).toThrow(
      'Invalid AccountTreePayload:',
    );
  });

  it('throws when the version is not the current version', () => {
    expect(() =>
      assertAccountTreePayload({
        version: ACCOUNT_TREE_PAYLOAD_CURRENT_VERSION + 1,
        wallets: [],
      }),
    ).toThrow('Invalid AccountTreePayload:');
  });

  it('throws when mnemonic wallet groups do not start at index 0', () => {
    const walletId = toWalletPayloadId('entropy-source-1');
    expect(() =>
      assertAccountTreePayload({
        version: ACCOUNT_TREE_PAYLOAD_CURRENT_VERSION,
        wallets: [
          {
            id: walletId,
            type: AccountWalletPayloadType.Mnemonic,
            metadata: { name: 'Wallet' },
            groups: [
              {
                id: toGroupPayloadId(walletId, 1),
                groupIndex: 1,
                metadata: { name: 'Account 1', pinned: false, hidden: false },
              },
            ],
          },
        ],
      }),
    ).toThrow('Invalid AccountTreePayload:');
  });

  it('throws when mnemonic wallet groups are non-contiguous', () => {
    expect(() =>
      assertAccountTreePayload({
        version: ACCOUNT_TREE_PAYLOAD_CURRENT_VERSION,
        wallets: [
          {
            id: toWalletPayloadId('entropy-source-1'),
            type: AccountWalletPayloadType.Mnemonic,
            metadata: { name: 'Wallet' },
            groups: [
              {
                id: toGroupPayloadId(toWalletPayloadId('entropy-source-1'), 0),
                groupIndex: 0,
                metadata: { name: 'Account 0', pinned: false, hidden: false },
              },
              // Group 1 is intentionally missing — non-contiguous.
              {
                id: toGroupPayloadId(toWalletPayloadId('entropy-source-1'), 2),
                groupIndex: 2,
                metadata: { name: 'Account 2', pinned: false, hidden: false },
              },
            ],
          },
        ],
      }),
    ).toThrow('Invalid AccountTreePayload:');
  });

  describe('mnemonic value field redaction', () => {
    const walletId = toWalletPayloadId('entropy-source-1');
    const payload = {
      version: ACCOUNT_TREE_PAYLOAD_CURRENT_VERSION,
      wallets: [
        {
          id: walletId,
          type: AccountWalletPayloadType.Mnemonic,
          value: MOCK_BAD_SECRET,
          metadata: { name: 'Wallet' },
          groups: [
            {
              id: toGroupPayloadId(walletId, 0),
              groupIndex: 0,
              metadata: { name: 'Account 0', pinned: false, hidden: false },
            },
          ],
        },
      ],
    };

    it('does not leak the value via assertAccountTreePayload', () => {
      expect(() => assertAccountTreePayload(payload)).toThrow(
        expect.not.stringContaining(String(MOCK_BAD_SECRET)),
      );
    });

    it('does not leak the value via superstruct assert', () => {
      expect(() => assert(payload, AccountTreePayloadStruct)).toThrow(
        expect.not.stringContaining(String(MOCK_BAD_SECRET)),
      );
    });
  });

  describe('private key field redaction', () => {
    const walletId = toWalletPayloadId('private-key');
    const payload = {
      version: ACCOUNT_TREE_PAYLOAD_CURRENT_VERSION,
      wallets: [
        {
          id: walletId,
          type: AccountWalletPayloadType.PrivateKey,
          metadata: { name: 'Wallet' },
          groups: [
            {
              id: toGroupPayloadId(walletId, '0xdeadbeef'),
              value: { privateKey: MOCK_BAD_SECRET, encoding: 'hex' },
              metadata: { name: 'Account', pinned: false, hidden: false },
            },
          ],
        },
      ],
    };

    it('does not leak the value via assertAccountTreePayload', () => {
      expect(() => assertAccountTreePayload(payload)).toThrow(
        expect.not.stringContaining(String(MOCK_BAD_SECRET)),
      );
    });

    it('does not leak the value via superstruct assert', () => {
      expect(() => assert(payload, AccountTreePayloadStruct)).toThrow(
        expect.not.stringContaining(String(MOCK_BAD_SECRET)),
      );
    });
  });

  it('throws when a group ID does not match the expected format', () => {
    expect(() =>
      assertAccountTreePayload({
        version: ACCOUNT_TREE_PAYLOAD_CURRENT_VERSION,
        wallets: [
          {
            id: 'wallet:entropy',
            type: AccountWalletPayloadType.Mnemonic,
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
    ).rejects.toThrow('Invalid AccountTreePayload');
  });
});
