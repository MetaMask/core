import { ed25519 } from '@noble/curves/ed25519';
import { p256, p384 } from '@noble/curves/nist';
import { sha256, sha384 } from '@noble/hashes/sha2';

import { COSEALG, COSECRV, COSEKEYS, COSEKTY } from './constants';
import { concatUint8Arrays } from '../utils/bytes';
import { bytesToBase64URL } from '../utils/encoding';

type COSEPublicKey = Map<number, number | Uint8Array>;

/**
 * Get the key type from a COSE public key map.
 *
 * @param cosePublicKey - COSE public key map.
 * @returns The COSEKTY value.
 */
function getKeyType(cosePublicKey: COSEPublicKey): number {
  const kty = cosePublicKey.get(COSEKEYS.Kty);
  if (typeof kty !== 'number') {
    throw new Error('COSE public key missing kty');
  }
  return kty;
}

/**
 * Verify an EC2 (P-256, P-384) signature using @noble/curves.
 *
 * ECDSA requires the data to be hashed with the curve-appropriate
 * algorithm before verification: SHA-256 for P-256 and SHA-384 for P-384.
 *
 * @param cosePublicKey - COSE-encoded EC2 public key.
 * @param signature - DER-encoded ECDSA signature.
 * @param data - Data that was signed.
 * @returns Whether the signature is valid.
 */
function verifyEC2(
  cosePublicKey: COSEPublicKey,
  signature: Uint8Array,
  data: Uint8Array,
): boolean {
  const crv = cosePublicKey.get(COSEKEYS.Crv) as number;
  const xCoord = cosePublicKey.get(COSEKEYS.X) as Uint8Array;
  const yCoord = cosePublicKey.get(COSEKEYS.Y) as Uint8Array;

  if (!xCoord || !yCoord) {
    throw new Error('EC2 public key missing x or y coordinate');
  }

  const uncompressed = concatUint8Arrays(
    new Uint8Array([0x04]),
    xCoord,
    yCoord,
  );

  switch (crv) {
    case COSECRV.P256:
      return p256.verify(signature, sha256(data), uncompressed);
    case COSECRV.P384:
      return p384.verify(signature, sha384(data), uncompressed);
    default:
      throw new Error(`Unsupported EC2 curve: ${crv}`);
  }
}

/**
 * Verify an OKP (Ed25519) signature using @noble/curves.
 *
 * @param cosePublicKey - COSE-encoded OKP public key.
 * @param signature - Raw Ed25519 signature (64 bytes).
 * @param data - Data that was signed.
 * @returns Whether the signature is valid.
 */
function verifyOKP(
  cosePublicKey: COSEPublicKey,
  signature: Uint8Array,
  data: Uint8Array,
): boolean {
  const xCoord = cosePublicKey.get(COSEKEYS.X) as Uint8Array;

  if (!xCoord) {
    throw new Error('OKP public key missing x coordinate');
  }

  return ed25519.verify(signature, data, xCoord);
}

/**
 * Verify an RSA (RS256/RS384/RS512) signature using Web Crypto API.
 *
 * @param cosePublicKey - COSE-encoded RSA public key.
 * @param signature - RSA PKCS#1 v1.5 signature.
 * @param data - Data that was signed.
 * @returns Whether the signature is valid.
 */
async function verifyRSA(
  cosePublicKey: COSEPublicKey,
  signature: Uint8Array,
  data: Uint8Array,
): Promise<boolean> {
  const alg = cosePublicKey.get(COSEKEYS.Alg) as number;
  const modulus = cosePublicKey.get(COSEKEYS.N) as Uint8Array;
  const exponent = cosePublicKey.get(COSEKEYS.E) as Uint8Array;

  if (!modulus || !exponent) {
    throw new Error('RSA public key missing n or e');
  }

  let hashAlg: string;
  switch (alg) {
    case COSEALG.RS256:
      hashAlg = 'SHA-256';
      break;
    case COSEALG.RS384:
      hashAlg = 'SHA-384';
      break;
    case COSEALG.RS512:
      hashAlg = 'SHA-512';
      break;
    default:
      throw new Error(`Unsupported RSA algorithm: ${alg}`);
  }

  const key = await globalThis.crypto.subtle.importKey(
    'jwk',
    {
      kty: 'RSA',
      n: bytesToBase64URL(modulus),
      e: bytesToBase64URL(exponent),
    },
    { name: 'RSASSA-PKCS1-v1_5', hash: { name: hashAlg } },
    false,
    ['verify'],
  );

  return globalThis.crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    signature.buffer as ArrayBuffer,
    data.buffer as ArrayBuffer,
  );
}

/**
 * Verify a WebAuthn signature using the appropriate algorithm based on
 * the COSE key type.
 *
 * Uses @noble/curves for EC2 and OKP (synchronous, audited, handles DER
 * natively). Falls back to Web Crypto API for RSA.
 *
 * @param opts - Options object.
 * @param opts.cosePublicKey - COSE-encoded public key as a Map.
 * @param opts.signature - The signature bytes.
 * @param opts.data - The data that was signed.
 * @returns Whether the signature is valid.
 */
export async function verifySignature(opts: {
  cosePublicKey: COSEPublicKey;
  signature: Uint8Array;
  data: Uint8Array;
}): Promise<boolean> {
  const { cosePublicKey, signature, data } = opts;
  const kty = getKeyType(cosePublicKey);

  switch (kty) {
    case COSEKTY.EC2:
      return verifyEC2(cosePublicKey, signature, data);
    case COSEKTY.OKP:
      return verifyOKP(cosePublicKey, signature, data);
    case COSEKTY.RSA:
      return verifyRSA(cosePublicKey, signature, data);
    default:
      throw new Error(`Unsupported COSE key type: ${kty}`);
  }
}
