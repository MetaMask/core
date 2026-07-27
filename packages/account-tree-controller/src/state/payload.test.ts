import {
  ACCOUNT_TREE_PAYLOAD_CURRENT_VERSION,
  migrate,
  parsePayloadGroupId,
  toWalletPayloadId,
} from './payload.js';

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

  it('returns the payload unchanged for the current version', () => {
    const raw = {
      version: ACCOUNT_TREE_PAYLOAD_CURRENT_VERSION,
      wallets: [],
    };
    const result = migrate(raw);
    expect(result).toBe(raw);
    expect(result.version).toBe(ACCOUNT_TREE_PAYLOAD_CURRENT_VERSION);
    expect(result.wallets).toStrictEqual([]);
  });

  it('skips migration steps that have no registered migrator', () => {
    // Version 0 has no migrator entry; the loop still runs but skips it.
    const raw = { version: 0, wallets: [] };
    // Should not throw, even though there is no v0 migrator.
    expect(() => migrate(raw)).not.toThrow();
  });
});
