import {
  ACCOUNT_TREE_PAYLOAD_CURRENT_VERSION,
  assertAccountTreePayload,
  parsePayloadGroupId,
  toWalletPayloadId,
} from './payload.js';
import { AccountTreeSnapshot } from './snapshot.js';

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

  it('throws when a group ID does not match the expected format', () => {
    expect(() =>
      assertAccountTreePayload({
        version: ACCOUNT_TREE_PAYLOAD_CURRENT_VERSION,
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
