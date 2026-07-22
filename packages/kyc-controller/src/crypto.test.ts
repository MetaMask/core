import { gcm } from '@noble/ciphers/aes';
import { x25519 } from '@noble/curves/ed25519';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import { base64 } from '@scure/base';

import type { EncryptedCredentialsEnvelope } from './crypto';
import { decryptCredentials, generateKeyPair } from './crypto';

/**
 * Builds an encrypted-credentials envelope that `decryptCredentials` can
 * reverse with `ourPublicKey`'s matching private key.
 *
 * @param ourPublicKey - The recipient's X25519 public key.
 * @param credentials - The plaintext credentials to encrypt.
 * @param options - Encoding options.
 * @param options.encoding - `'hex'` (default) or `'base64'`.
 * @param options.ivLength - IV length in bytes (default 12).
 * @param options.useNonceField - Emit `nonce` instead of `iv`.
 * @returns The encrypted envelope.
 */
function makeEnvelope(
  ourPublicKey: Uint8Array,
  credentials: Record<string, unknown>,
  {
    encoding = 'hex' as 'hex' | 'base64',
    ivLength = 12,
    useNonceField = false,
  } = {},
): EncryptedCredentialsEnvelope {
  const ephemeralPrivate = x25519.utils.randomSecretKey();
  const ephemeralPublic = x25519.getPublicKey(ephemeralPrivate);
  const shared = x25519.getSharedSecret(ephemeralPrivate, ourPublicKey);
  const key = hkdf(sha256, shared, undefined, undefined, 32);
  const iv = new Uint8Array(ivLength).fill(7);
  const ciphertext = gcm(key, iv).encrypt(
    utf8ToBytes(JSON.stringify(credentials)),
  );
  const encode = (bytes: Uint8Array): string =>
    encoding === 'hex' ? bytesToHex(bytes) : base64.encode(bytes);
  const envelope: EncryptedCredentialsEnvelope = {
    ephemeralPublicKey: encode(ephemeralPublic),
    ciphertext: encode(ciphertext),
  };
  if (useNonceField) {
    envelope.nonce = encode(iv);
  } else {
    envelope.iv = encode(iv);
  }
  return envelope;
}

describe('crypto', () => {
  describe('generateKeyPair', () => {
    it('produces a 32-byte keypair with a hex public key', () => {
      const keypair = generateKeyPair();
      expect(keypair.privateKey).toHaveLength(32);
      expect(keypair.publicKey).toHaveLength(32);
      expect(keypair.publicKeyHex).toMatch(/^[0-9a-f]{64}$/u);
    });
  });

  describe('decryptCredentials', () => {
    it('decrypts a hex-encoded envelope object', () => {
      const keypair = generateKeyPair();
      const envelope = makeEnvelope(keypair.publicKey, {
        accessToken: 'access-1',
      });

      const { credentials, method } = decryptCredentials(
        envelope,
        keypair.privateKey,
      );

      expect(credentials.accessToken).toBe('access-1');
      expect(method).toBe('aes-256-gcm/hkdf-sha256');
    });

    it('decrypts a base64-encoded envelope', () => {
      const keypair = generateKeyPair();
      const envelope = makeEnvelope(
        keypair.publicKey,
        { clientToken: 'client-1' },
        { encoding: 'base64' },
      );

      const { credentials } = decryptCredentials(envelope, keypair.privateKey);

      expect(credentials.clientToken).toBe('client-1');
    });

    it('honors an explicit base64 encoding hint', () => {
      const keypair = generateKeyPair();
      const envelope = makeEnvelope(
        keypair.publicKey,
        { accessToken: 'access-2' },
        { encoding: 'base64' },
      );
      envelope.encoding = 'base64';

      const { credentials } = decryptCredentials(envelope, keypair.privateKey);

      expect(credentials.accessToken).toBe('access-2');
    });

    it('accepts a `nonce` field as an alias for `iv`', () => {
      const keypair = generateKeyPair();
      const envelope = makeEnvelope(
        keypair.publicKey,
        { accessToken: 'access-3' },
        { useNonceField: true },
      );

      const { credentials } = decryptCredentials(envelope, keypair.privateKey);

      expect(credentials.accessToken).toBe('access-3');
    });

    it('decrypts an envelope delivered as a JSON string', () => {
      const keypair = generateKeyPair();
      const envelope = makeEnvelope(keypair.publicKey, {
        accessToken: 'access-4',
      });

      const { credentials } = decryptCredentials(
        JSON.stringify(envelope),
        keypair.privateKey,
      );

      expect(credentials.accessToken).toBe('access-4');
    });

    it('decrypts an envelope delivered as base64(JSON)', () => {
      const keypair = generateKeyPair();
      const envelope = makeEnvelope(keypair.publicKey, {
        accessToken: 'access-5',
      });
      const base64Json = base64.encode(utf8ToBytes(JSON.stringify(envelope)));

      const { credentials } = decryptCredentials(
        base64Json,
        keypair.privateKey,
      );

      expect(credentials.accessToken).toBe('access-5');
    });

    it('throws for a JSON string that fails to parse', () => {
      const keypair = generateKeyPair();
      expect(() =>
        decryptCredentials('{ not valid json', keypair.privateKey),
      ).toThrow(/looked like JSON but failed to parse/u);
    });

    it('throws for base64 that decodes to non-JSON starting with a brace', () => {
      const keypair = generateKeyPair();
      const bad = base64.encode(utf8ToBytes('{ still not json'));
      expect(() => decryptCredentials(bad, keypair.privateKey)).toThrow(
        /base64-decoded to non-JSON/u,
      );
    });

    it('throws for an opaque string that is neither JSON nor base64(JSON)', () => {
      const keypair = generateKeyPair();
      const bad = base64.encode(utf8ToBytes('hello world'));
      expect(() => decryptCredentials(bad, keypair.privateKey)).toThrow(
        /opaque string/u,
      );
    });

    it('throws for an object missing required fields', () => {
      const keypair = generateKeyPair();
      expect(() =>
        decryptCredentials(
          { ephemeralPublicKey: 'aa' } as EncryptedCredentialsEnvelope,
          keypair.privateKey,
        ),
      ).toThrow(/missing required fields/u);
    });

    it('reports the value type for a non-object input', () => {
      const keypair = generateKeyPair();
      expect(() =>
        decryptCredentials(
          123 as unknown as EncryptedCredentialsEnvelope,
          keypair.privateKey,
        ),
      ).toThrow(/Got: number/u);
    });

    it('throws when the IV length is not 12 bytes', () => {
      const keypair = generateKeyPair();
      const envelope = makeEnvelope(
        keypair.publicKey,
        { accessToken: 'x' },
        { ivLength: 16 },
      );
      expect(() => decryptCredentials(envelope, keypair.privateKey)).toThrow(
        /Unexpected IV length 16/u,
      );
    });
  });
});
