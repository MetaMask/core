import {
  canonicalizeAddress,
  ProofUnsupportedNamespaceError,
} from './canonicalize.js';

describe('canonicalizeAddress', () => {
  describe('eip155', () => {
    const checksummed = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed';

    it('returns the EIP-55 checksum of an all-lowercase address', () => {
      expect(canonicalizeAddress(checksummed.toLowerCase(), 'eip155')).toBe(
        checksummed,
      );
    });

    it('returns the EIP-55 checksum of an all-uppercase address', () => {
      expect(
        canonicalizeAddress(
          `0x${checksummed.slice(2).toUpperCase()}`,
          'eip155',
        ),
      ).toBe(checksummed);
    });

    it('returns an already-checksummed address unchanged', () => {
      expect(canonicalizeAddress(checksummed, 'eip155')).toBe(checksummed);
    });

    it('falls back to controller-utils behaviour for non-hex input (0x-prefixed verbatim, server then rejects)', () => {
      // `toChecksumHexAddress` 0x-prefixes its input before validating, and
      // returns the prefixed form unchanged when the result is not a valid
      // hex string. We rely on the server to reject these with 400 rather
      // than throwing client-side.
      expect(canonicalizeAddress('not-a-hex-address', 'eip155')).toBe(
        '0xnot-a-hex-address',
      );
    });
  });

  describe('solana', () => {
    it('returns base58 addresses unchanged', () => {
      const solanaAddress = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
      expect(canonicalizeAddress(solanaAddress, 'solana')).toBe(solanaAddress);
    });
  });

  describe('tron', () => {
    it('returns base58check addresses unchanged', () => {
      const tronAddress = 'TRX9Yg4yFqyKBcXBSc1nKMpHsfYVgKvN3p';
      expect(canonicalizeAddress(tronAddress, 'tron')).toBe(tronAddress);
    });
  });

  describe('bip122', () => {
    it('returns legacy P2PKH addresses (starting with 1) unchanged', () => {
      const legacy = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
      expect(canonicalizeAddress(legacy, 'bip122')).toBe(legacy);
    });

    it('lowercases bech32 P2WPKH addresses (bc1q…) given in uppercase', () => {
      const upper = 'BC1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4';
      expect(canonicalizeAddress(upper, 'bip122')).toBe(upper.toLowerCase());
    });

    it('returns lowercase bech32m P2TR addresses (bc1p…) unchanged', () => {
      const taproot =
        'bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0';
      expect(canonicalizeAddress(taproot, 'bip122')).toBe(taproot);
    });

    it('lowercases mixed-case bech32 addresses', () => {
      const mixed = 'Bc1Qw508D6Qejxtdg4Y5R3Zarvary0C5Xw7Kv8F3T4';
      expect(canonicalizeAddress(mixed, 'bip122')).toBe(mixed.toLowerCase());
    });

    it('lowercases testnet bech32 P2WPKH addresses (tb1q…)', () => {
      const testnet = 'TB1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KXPJZSX';
      expect(canonicalizeAddress(testnet, 'bip122')).toBe(
        testnet.toLowerCase(),
      );
    });

    it('lowercases testnet bech32m P2TR addresses (tb1p…)', () => {
      const testnetTaproot =
        'TB1P0XLXVLHEMJA6C4DQV22UAPCTQUPFHLXM9H8Z3K2E72Q4K9HCZ7VQ4QPSGD';
      expect(canonicalizeAddress(testnetTaproot, 'bip122')).toBe(
        testnetTaproot.toLowerCase(),
      );
    });

    it('lowercases regtest bech32 addresses (bcrt1…)', () => {
      const regtest = 'BCRT1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KYGT080';
      expect(canonicalizeAddress(regtest, 'bip122')).toBe(
        regtest.toLowerCase(),
      );
    });

    it('returns legacy testnet P2PKH addresses (starting with m/n) unchanged', () => {
      const testnetLegacy = 'mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn';
      expect(canonicalizeAddress(testnetLegacy, 'bip122')).toBe(testnetLegacy);
    });
  });

  describe('unsupported namespaces', () => {
    it.each([
      'cosmos',
      'polkadot',
      'eip155:1', // a full CAIP-2 id is not a namespace
      '',
    ])("throws ProofUnsupportedNamespaceError for '%s'", (namespace) => {
      expect(() => canonicalizeAddress('whatever', namespace)).toThrow(
        ProofUnsupportedNamespaceError,
      );
    });

    it('attaches the offending namespace to the error message', () => {
      expect(() => canonicalizeAddress('whatever', 'cosmos')).toThrow(
        "Proof of ownership is not supported for namespace 'cosmos'.",
      );
    });
  });
});
