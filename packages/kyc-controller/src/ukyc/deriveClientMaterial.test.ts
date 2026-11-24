import { areUint8ArraysEqual } from '@metamask/utils';
import { ed25519 } from '@noble/curves/ed25519';
import { describe, expect, it } from 'vitest';

import {
  UKYC_DERIVED_KEY_SIZES,
  UKYC_LOCAL_USER_SECRET_SIZE_BYTES,
} from './constants.js';
import {
  deriveClientMaterial,
  encodeClientMaterial,
} from './deriveClientMaterial.js';

const LOCAL_USER_SECRET = new Uint8Array(
  UKYC_LOCAL_USER_SECRET_SIZE_BYTES,
).fill(42);
const OTHER_LOCAL_USER_SECRET = new Uint8Array(
  UKYC_LOCAL_USER_SECRET_SIZE_BYTES,
).fill(43);

describe('UKYC deriveClientMaterial', () => {
  it('derives each value at the documented length', async () => {
    const material = await deriveClientMaterial(LOCAL_USER_SECRET);

    expect(material.storageId).toHaveLength(UKYC_DERIVED_KEY_SIZES.storageId);
    expect(material.dataEncryptionKey).toHaveLength(
      UKYC_DERIVED_KEY_SIZES.dataEncryptionKey,
    );
    expect(material.signingKey).toHaveLength(UKYC_DERIVED_KEY_SIZES.signingKey);
    expect(material.relayTunnelKey).toHaveLength(
      UKYC_DERIVED_KEY_SIZES.relayTunnelKey,
    );
    // Ed25519 public keys are 32 bytes.
    expect(material.signingPublicKey).toHaveLength(32);
  });

  it('is deterministic for the same local_user_secret', async () => {
    const a = await deriveClientMaterial(LOCAL_USER_SECRET);
    const b = await deriveClientMaterial(LOCAL_USER_SECRET);

    expect(a).toStrictEqual(b);
  });

  it('produces different material for a different local_user_secret', async () => {
    const a = await deriveClientMaterial(LOCAL_USER_SECRET);
    const b = await deriveClientMaterial(OTHER_LOCAL_USER_SECRET);

    expect(areUint8ArraysEqual(a.storageId, b.storageId)).toBe(false);
    expect(areUint8ArraysEqual(a.dataEncryptionKey, b.dataEncryptionKey)).toBe(
      false,
    );
    expect(areUint8ArraysEqual(a.signingKey, b.signingKey)).toBe(false);
    expect(areUint8ArraysEqual(a.relayTunnelKey, b.relayTunnelKey)).toBe(false);
  });

  it('domain-separates the derived values from one another', async () => {
    const { storageId, dataEncryptionKey, signingKey, relayTunnelKey } =
      await deriveClientMaterial(LOCAL_USER_SECRET);
    const values = [storageId, dataEncryptionKey, signingKey, relayTunnelKey];

    for (let i = 0; i < values.length; i++) {
      for (let j = i + 1; j < values.length; j++) {
        expect(areUint8ArraysEqual(values[i], values[j])).toBe(false);
      }
    }
  });

  it('derives a signing public key that matches the signing key', async () => {
    const material = await deriveClientMaterial(LOCAL_USER_SECRET);

    expect(material.signingPublicKey).toStrictEqual(
      ed25519.getPublicKey(material.signingKey),
    );
  });

  it('produces a working Ed25519 keypair for storage authorization', async () => {
    const material = await deriveClientMaterial(LOCAL_USER_SECRET);
    const message = new TextEncoder().encode('storage-authorization-payload');

    const signature = ed25519.sign(message, material.signingKey);

    expect(ed25519.verify(signature, message, material.signingPublicKey)).toBe(
      true,
    );
  });
});

describe('UKYC encodeClientMaterial', () => {
  it('encodes storage_id and signing public key as unpadded base64url', async () => {
    const material = await deriveClientMaterial(LOCAL_USER_SECRET);

    const encoded = encodeClientMaterial(material);

    expect(encoded.storageId).toMatch(/^[A-Za-z0-9_-]+$/u);
    expect(encoded.signingPublicKey).toMatch(/^[A-Za-z0-9_-]+$/u);
    expect(encoded.storageId).not.toContain('=');
    expect(encoded.signingPublicKey).not.toContain('=');
  });

  it('omits secret material from the encoded output', async () => {
    const material = await deriveClientMaterial(LOCAL_USER_SECRET);

    const encoded = encodeClientMaterial(material);

    expect(Object.keys(encoded).sort()).toStrictEqual([
      'signingPublicKey',
      'storageId',
    ]);
  });
});
