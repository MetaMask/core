import { areUint8ArraysEqual, stringToBytes } from '@metamask/utils';
import { ed25519 } from '@noble/curves/ed25519';
import { box } from 'tweetnacl';

import { toBase64Url, base64UrlToBytes } from '../encoding.js';
import { UKYC_LOCAL_USER_SECRET_SIZE_BYTES } from './constants.js';
import { deriveClientMaterial } from './deriveClientMaterial.js';
import type { Jwk } from './jwtChain.js';
import {
  assertAttestedServerPublicKey,
  wrapUkycSessionAuthorizations,
} from './sessionAuthorizations.js';

const KID = 'key-1';
const SERVER_PUBLIC_KEY_X = 'spk-x';

const SIGNING_PRIVATE_KEY = ed25519.utils.randomSecretKey();
const SIGNING_PUBLIC_KEY = ed25519.getPublicKey(SIGNING_PRIVATE_KEY);

const JWK: Jwk = {
  kty: 'OKP',
  crv: 'Ed25519',
  x: toBase64Url(SIGNING_PUBLIC_KEY),
  kid: KID,
};

/**
 * Builds a compact EdDSA JWT signed with the module's signing key.
 *
 * @param payload - JWT payload.
 * @returns The compact-serialized JWT.
 */
function buildJwt(payload: Record<string, unknown>): string {
  const headerSegment = toBase64Url(
    stringToBytes(JSON.stringify({ alg: 'EdDSA', kid: KID })),
  );
  const payloadSegment = toBase64Url(stringToBytes(JSON.stringify(payload)));
  const signature = ed25519.sign(
    new TextEncoder().encode(`${headerSegment}.${payloadSegment}`),
    SIGNING_PRIVATE_KEY,
  );
  return `${headerSegment}.${payloadSegment}.${toBase64Url(signature)}`;
}

/**
 * Opens a wrapped authorization from the session server's perspective.
 *
 * @param serverPrivateKey - Server X25519 private key.
 * @param clientPublicKey - Client X25519 public key.
 * @param data - Base64url ciphertext.
 * @param nonce - Base64url nonce.
 * @returns Recovered plaintext.
 */
function unwrap(
  serverPrivateKey: Uint8Array,
  clientPublicKey: Uint8Array,
  data: string,
  nonce: string,
): Uint8Array {
  const recovered = box.open(
    base64UrlToBytes(data),
    base64UrlToBytes(nonce),
    clientPublicKey,
    serverPrivateKey,
  );
  if (recovered === null) {
    throw new Error('Failed to open NaCl box');
  }
  return recovered;
}

describe('UKYC sessionAuthorizations', () => {
  describe('assertAttestedServerPublicKey', () => {
    it('accepts a schema whose server public key matches the jwtChain', () => {
      const jwtChain = buildJwt({
        sessionServerPublicKeyX: SERVER_PUBLIC_KEY_X,
        nonce: 'n',
      });

      expect(() =>
        assertAttestedServerPublicKey([JWK], {
          serverPublicKey: { x: SERVER_PUBLIC_KEY_X },
          jwtChain,
        }),
      ).not.toThrow();
    });

    it('rejects a schema whose server public key was swapped after signing', () => {
      const jwtChain = buildJwt({
        sessionServerPublicKeyX: SERVER_PUBLIC_KEY_X,
        nonce: 'n',
      });

      expect(() =>
        assertAttestedServerPublicKey([JWK], {
          serverPublicKey: { x: 'tampered' },
          jwtChain,
        }),
      ).toThrow('sessionServerPublicKey does not match');
    });
  });

  describe('wrapUkycSessionAuthorizations', () => {
    it('wraps the derived encryption key so the session server can recover it', () => {
      const encryptionServer = box.keyPair();
      const capabilityServer = box.keyPair();
      const sessionClient = box.keyPair();
      const localUserSecret = new Uint8Array(
        UKYC_LOCAL_USER_SECRET_SIZE_BYTES,
      ).fill(9);

      const wrapped = wrapUkycSessionAuthorizations({
        sessionClientPrivateKey: sessionClient.secretKey,
        encryptionDataKey: {
          serverPublicKey: { x: toBase64Url(encryptionServer.publicKey) },
          jwtChain: 'unused',
        },
        capabilityTokenSchema: {
          serverPublicKey: { x: toBase64Url(capabilityServer.publicKey) },
          jwtChain: 'unused',
        },
        localUserSecret,
      });

      const recoveredKey = unwrap(
        encryptionServer.secretKey,
        sessionClient.publicKey,
        wrapped.wrappedEncryptionDataKey.data,
        wrapped.wrappedEncryptionDataKey.nonce,
      );
      expect(
        areUint8ArraysEqual(
          recoveredKey,
          deriveClientMaterial(localUserSecret).dataEncryptionKey,
        ),
      ).toBe(true);

      const recoveredToken = unwrap(
        capabilityServer.secretKey,
        sessionClient.publicKey,
        wrapped.wrappedUkycCapabilityToken.data,
        wrapped.wrappedUkycCapabilityToken.nonce,
      );
      expect(recoveredToken.byteLength).toBeGreaterThan(0);
    });
  });
});
