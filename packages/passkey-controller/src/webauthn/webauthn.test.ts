import { encodeCBOR } from '@levischuck/tiny-cbor';
import { ed25519 } from '@noble/curves/ed25519';
import { p256 } from '@noble/curves/p256';
import { p384 } from '@noble/curves/p384';
import { sha256, sha384 } from '@noble/hashes/sha2';

import { COSEALG, COSEKEYS, COSEKTY, COSECRV } from './constants';
import type {
  PasskeyRegistrationResponse,
  PasskeyAuthenticationResponse,
} from './types';
import { verifyAuthenticationResponse } from './verifyAuthenticationResponse';
import { verifyRegistrationResponse } from './verifyRegistrationResponse';
import { bytesToBase64URL } from '../utils/encoding';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

const TEST_RP_ID = 'example.com';
const TEST_ORIGIN = 'https://example.com';
const TEST_CHALLENGE = bytesToBase64URL(new Uint8Array(32).fill(0xab));

function makeClientDataJSON(
  overrides?: Partial<{
    type: string;
    challenge: string;
    origin: string;
  }>,
): string {
  const json = JSON.stringify({
    type: overrides?.type ?? 'webauthn.create',
    challenge: overrides?.challenge ?? TEST_CHALLENGE,
    origin: overrides?.origin ?? TEST_ORIGIN,
  });
  return bytesToBase64URL(new TextEncoder().encode(json));
}

/**
 * Build a COSE public key Map for ES256 (P-256) from a raw public key point.
 *
 * @param pubKeyBytes - Uncompressed EC public key bytes.
 * @returns A COSE public key map.
 */
function buildCosePublicKeyMap(
  pubKeyBytes: Uint8Array,
): Map<number, number | Uint8Array> {
  const map = new Map<number, number | Uint8Array>();
  map.set(COSEKEYS.Kty, COSEKTY.EC2);
  map.set(COSEKEYS.Alg, COSEALG.ES256);
  map.set(COSEKEYS.Crv, COSECRV.P256);
  // Skip 0x04 prefix for uncompressed point
  map.set(COSEKEYS.X, pubKeyBytes.slice(1, 33));
  map.set(COSEKEYS.Y, pubKeyBytes.slice(33, 65));
  return map;
}

/**
 * Generate a P-256 key pair.
 *
 * @returns An object with privateKey, publicKeyRaw, and cosePublicKeyCBOR.
 */
function generateES256KeyPair(): {
  privateKey: Uint8Array;
  publicKeyRaw: Uint8Array;
  cosePublicKeyCBOR: Uint8Array;
} {
  const privateKey = p256.utils.randomPrivateKey();
  const publicKeyRaw = p256.getPublicKey(privateKey, false);
  const coseMap = buildCosePublicKeyMap(publicKeyRaw);
  const cosePublicKeyCBOR = encodeCBOR(coseMap);
  return { privateKey, publicKeyRaw, cosePublicKeyCBOR };
}

/**
 * Build a minimal authenticator data buffer.
 *
 * @param opts - Authenticator data fields.
 * @param opts.rpIdHash - SHA-256 hash of the RP ID.
 * @param opts.flags - Flags byte value.
 * @param opts.counter - Signature counter.
 * @param opts.aaguid - Authenticator AAGUID.
 * @param opts.credentialID - Credential identifier bytes.
 * @param opts.credentialPublicKey - CBOR-encoded COSE public key.
 * @returns Raw authenticator data bytes.
 */
function buildAuthenticatorData(opts: {
  rpIdHash: Uint8Array;
  flags: number;
  counter: number;
  aaguid?: Uint8Array;
  credentialID?: Uint8Array;
  credentialPublicKey?: Uint8Array;
}): Uint8Array {
  const parts: Uint8Array[] = [];

  parts.push(opts.rpIdHash); // 32 bytes

  parts.push(new Uint8Array([opts.flags])); // 1 byte

  const counterBuf = new Uint8Array(4);
  new DataView(counterBuf.buffer).setUint32(0, opts.counter, false);
  parts.push(counterBuf); // 4 bytes

  if (opts.aaguid && opts.credentialID && opts.credentialPublicKey) {
    parts.push(opts.aaguid); // 16 bytes

    const credIDLen = new Uint8Array(2);
    new DataView(credIDLen.buffer).setUint16(
      0,
      opts.credentialID.length,
      false,
    );
    parts.push(credIDLen);

    parts.push(opts.credentialID);
    parts.push(opts.credentialPublicKey);
  }

  let totalLength = 0;
  for (const part of parts) {
    totalLength += part.length;
  }
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

/**
 * Build a minimal attestation object (CBOR).
 *
 * @param authData - Raw authenticator data.
 * @param fmt - Attestation format string.
 * @param attStmt - Attestation statement map.
 * @returns CBOR-encoded attestation object.
 */
function buildAttestationObject(
  authData: Uint8Array,
  fmt: string = 'none',
  attStmt: Map<string, unknown> = new Map(),
): Uint8Array {
  const map = new Map();
  map.set('fmt', fmt);
  map.set('attStmt', attStmt);
  map.set('authData', authData);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return encodeCBOR(map as any);
}

function buildRegistrationResponse(
  authData: Uint8Array,
  credentialId: string,
  fmt: string = 'none',
  attStmt: Map<string, unknown> = new Map(),
  clientDataJSONOverrides?: Partial<{
    type: string;
    challenge: string;
    origin: string;
  }>,
): PasskeyRegistrationResponse {
  const attestationObject = buildAttestationObject(authData, fmt, attStmt);
  return {
    id: credentialId,
    rawId: credentialId,
    type: 'public-key',
    response: {
      clientDataJSON: makeClientDataJSON(clientDataJSONOverrides),
      attestationObject: bytesToBase64URL(attestationObject),
    },
    clientExtensionResults: {},
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('verifyRegistrationResponse', () => {
  it('verifies a valid registration with none attestation', async () => {
    const { cosePublicKeyCBOR } = generateES256KeyPair();
    const credentialID = new Uint8Array(16).fill(0x01);
    const aaguid = new Uint8Array(16).fill(0);
    const rpIdHash = sha256(new TextEncoder().encode(TEST_RP_ID));

    // flags: UP (0x01) | AT (0x40) = 0x41
    const authData = buildAuthenticatorData({
      rpIdHash,
      flags: 0x41,
      counter: 0,
      aaguid,
      credentialID,
      credentialPublicKey: cosePublicKeyCBOR,
    });

    const credentialIdB64 = bytesToBase64URL(credentialID);
    const response = buildRegistrationResponse(authData, credentialIdB64);

    const result = await verifyRegistrationResponse({
      response,
      expectedChallenge: TEST_CHALLENGE,
      expectedOrigin: TEST_ORIGIN,
      expectedRPID: TEST_RP_ID,
    });

    expect(result.verified).toBe(true);
    expect(result.verified && result.registrationInfo.credentialId).toBe(
      credentialIdB64,
    );
    expect(result.verified && result.registrationInfo.publicKey).toStrictEqual(
      cosePublicKeyCBOR,
    );
  });

  it('rejects mismatched challenge', async () => {
    const { cosePublicKeyCBOR } = generateES256KeyPair();
    const credentialID = new Uint8Array(16).fill(0x02);
    const aaguid = new Uint8Array(16).fill(0);
    const rpIdHash = sha256(new TextEncoder().encode(TEST_RP_ID));

    const authData = buildAuthenticatorData({
      rpIdHash,
      flags: 0x41,
      counter: 0,
      aaguid,
      credentialID,
      credentialPublicKey: cosePublicKeyCBOR,
    });

    const credentialIdB64 = bytesToBase64URL(credentialID);
    const response = buildRegistrationResponse(authData, credentialIdB64);

    await expect(
      verifyRegistrationResponse({
        response,
        expectedChallenge: 'wrong-challenge',
        expectedOrigin: TEST_ORIGIN,
        expectedRPID: TEST_RP_ID,
      }),
    ).rejects.toThrow('Unexpected registration response challenge');
  });

  it('rejects mismatched origin', async () => {
    const { cosePublicKeyCBOR } = generateES256KeyPair();
    const credentialID = new Uint8Array(16).fill(0x03);
    const aaguid = new Uint8Array(16).fill(0);
    const rpIdHash = sha256(new TextEncoder().encode(TEST_RP_ID));

    const authData = buildAuthenticatorData({
      rpIdHash,
      flags: 0x41,
      counter: 0,
      aaguid,
      credentialID,
      credentialPublicKey: cosePublicKeyCBOR,
    });

    const credentialIdB64 = bytesToBase64URL(credentialID);
    const response = buildRegistrationResponse(authData, credentialIdB64);

    await expect(
      verifyRegistrationResponse({
        response,
        expectedChallenge: TEST_CHALLENGE,
        expectedOrigin: 'https://evil.com',
        expectedRPID: TEST_RP_ID,
      }),
    ).rejects.toThrow('Unexpected registration response origin');
  });

  it('rejects mismatched RP ID', async () => {
    const { cosePublicKeyCBOR } = generateES256KeyPair();
    const credentialID = new Uint8Array(16).fill(0x04);
    const aaguid = new Uint8Array(16).fill(0);
    const rpIdHash = sha256(new TextEncoder().encode(TEST_RP_ID));

    const authData = buildAuthenticatorData({
      rpIdHash,
      flags: 0x41,
      counter: 0,
      aaguid,
      credentialID,
      credentialPublicKey: cosePublicKeyCBOR,
    });

    const credentialIdB64 = bytesToBase64URL(credentialID);
    const response = buildRegistrationResponse(authData, credentialIdB64);

    await expect(
      verifyRegistrationResponse({
        response,
        expectedChallenge: TEST_CHALLENGE,
        expectedOrigin: TEST_ORIGIN,
        expectedRPID: 'wrong-rp.com',
      }),
    ).rejects.toThrow('Unexpected RP ID hash');
  });

  it('rejects wrong clientDataJSON type', async () => {
    const { cosePublicKeyCBOR } = generateES256KeyPair();
    const credentialID = new Uint8Array(16).fill(0x05);
    const aaguid = new Uint8Array(16).fill(0);
    const rpIdHash = sha256(new TextEncoder().encode(TEST_RP_ID));

    const authData = buildAuthenticatorData({
      rpIdHash,
      flags: 0x41,
      counter: 0,
      aaguid,
      credentialID,
      credentialPublicKey: cosePublicKeyCBOR,
    });

    const credentialIdB64 = bytesToBase64URL(credentialID);
    const response = buildRegistrationResponse(
      authData,
      credentialIdB64,
      'none',
      new Map(),
      { type: 'webauthn.get' },
    );

    await expect(
      verifyRegistrationResponse({
        response,
        expectedChallenge: TEST_CHALLENGE,
        expectedOrigin: TEST_ORIGIN,
        expectedRPID: TEST_RP_ID,
      }),
    ).rejects.toThrow('Unexpected registration response type');
  });

  it('rejects missing credential ID', async () => {
    const rpIdHash = sha256(new TextEncoder().encode(TEST_RP_ID));

    // flags: UP only (no AT bit) - no attested credential data
    const authData = buildAuthenticatorData({
      rpIdHash,
      flags: 0x01,
      counter: 0,
    });

    const response = buildRegistrationResponse(authData, 'some-id');

    await expect(
      verifyRegistrationResponse({
        response,
        expectedChallenge: TEST_CHALLENGE,
        expectedOrigin: TEST_ORIGIN,
        expectedRPID: TEST_RP_ID,
      }),
    ).rejects.toThrow('No credential ID was provided');
  });

  it('verifies packed self-attestation with real ES256 signature', async () => {
    const { privateKey, cosePublicKeyCBOR } = generateES256KeyPair();
    const credentialID = new Uint8Array(16).fill(0x07);
    const aaguid = new Uint8Array(16).fill(0);
    const rpIdHash = sha256(new TextEncoder().encode(TEST_RP_ID));

    const authData = buildAuthenticatorData({
      rpIdHash,
      flags: 0x41,
      counter: 0,
      aaguid,
      credentialID,
      credentialPublicKey: cosePublicKeyCBOR,
    });

    const clientDataJSONStr = makeClientDataJSON();
    const clientDataHash = sha256(
      Uint8Array.from(
        atob(
          clientDataJSONStr.replace(/-/gu, '+').replace(/_/gu, '/') +
            '='.repeat((4 - (clientDataJSONStr.length % 4)) % 4),
        ),
        (ch) => ch.charCodeAt(0),
      ),
    );

    const signatureBase = new Uint8Array(
      authData.length + clientDataHash.length,
    );
    signatureBase.set(authData, 0);
    signatureBase.set(clientDataHash, authData.length);

    const sigHash = sha256(signatureBase);
    const ecdsaSig = p256.sign(sigHash, privateKey);

    const attStmt = new Map<string, unknown>();
    attStmt.set('alg', COSEALG.ES256);
    attStmt.set('sig', new Uint8Array(ecdsaSig.toDERRawBytes()));

    const credentialIdB64 = bytesToBase64URL(credentialID);
    const attestationObject = buildAttestationObject(
      authData,
      'packed',
      attStmt,
    );

    const response: PasskeyRegistrationResponse = {
      id: credentialIdB64,
      rawId: credentialIdB64,
      type: 'public-key',
      response: {
        clientDataJSON: clientDataJSONStr,
        attestationObject: bytesToBase64URL(attestationObject),
      },
      clientExtensionResults: {},
    };

    const result = await verifyRegistrationResponse({
      response,
      expectedChallenge: TEST_CHALLENGE,
      expectedOrigin: TEST_ORIGIN,
      expectedRPID: TEST_RP_ID,
    });

    expect(result.verified).toBe(true);
  });
});

describe('verifyAuthenticationResponse', () => {
  function makeAuthClientDataJSON(
    overrides?: Partial<{
      type: string;
      challenge: string;
      origin: string;
    }>,
  ): string {
    const json = JSON.stringify({
      type: overrides?.type ?? 'webauthn.get',
      challenge: overrides?.challenge ?? TEST_CHALLENGE,
      origin: overrides?.origin ?? TEST_ORIGIN,
    });
    return bytesToBase64URL(new TextEncoder().encode(json));
  }

  it('verifies a valid authentication with real ES256 signature', async () => {
    const { privateKey, cosePublicKeyCBOR } = generateES256KeyPair();
    const rpIdHash = sha256(new TextEncoder().encode(TEST_RP_ID));

    // flags: UP (0x01)
    const authData = buildAuthenticatorData({
      rpIdHash,
      flags: 0x01,
      counter: 1,
    });

    const clientDataJSONStr = makeAuthClientDataJSON();
    const clientDataBytes = Uint8Array.from(
      atob(
        clientDataJSONStr.replace(/-/gu, '+').replace(/_/gu, '/') +
          '='.repeat((4 - (clientDataJSONStr.length % 4)) % 4),
      ),
      (ch) => ch.charCodeAt(0),
    );
    const clientDataHash = sha256(clientDataBytes);

    const signatureBase = new Uint8Array(
      authData.length + clientDataHash.length,
    );
    signatureBase.set(authData, 0);
    signatureBase.set(clientDataHash, authData.length);

    const sigHash = sha256(signatureBase);
    const ecdsaSig = p256.sign(sigHash, privateKey);

    const credentialIdB64 = bytesToBase64URL(new Uint8Array(16).fill(0x10));

    const response: PasskeyAuthenticationResponse = {
      id: credentialIdB64,
      rawId: credentialIdB64,
      type: 'public-key',
      response: {
        clientDataJSON: clientDataJSONStr,
        authenticatorData: bytesToBase64URL(authData),
        signature: bytesToBase64URL(new Uint8Array(ecdsaSig.toDERRawBytes())),
      },
      clientExtensionResults: {},
    };

    const result = await verifyAuthenticationResponse({
      response,
      expectedChallenge: TEST_CHALLENGE,
      expectedOrigin: TEST_ORIGIN,
      expectedRPID: TEST_RP_ID,
      credential: {
        id: credentialIdB64,
        publicKey: cosePublicKeyCBOR,
        counter: 0,
      },
    });

    expect(result.verified).toBe(true);
    expect(result.authenticationInfo.newCounter).toBe(1);
    expect(result.authenticationInfo.rpID).toBe(TEST_RP_ID);
  });

  it('rejects mismatched challenge', async () => {
    const { cosePublicKeyCBOR } = generateES256KeyPair();
    const rpIdHash = sha256(new TextEncoder().encode(TEST_RP_ID));
    const authData = buildAuthenticatorData({
      rpIdHash,
      flags: 0x01,
      counter: 1,
    });

    const credentialIdB64 = bytesToBase64URL(new Uint8Array(16).fill(0x11));

    const response: PasskeyAuthenticationResponse = {
      id: credentialIdB64,
      rawId: credentialIdB64,
      type: 'public-key',
      response: {
        clientDataJSON: makeAuthClientDataJSON(),
        authenticatorData: bytesToBase64URL(authData),
        signature: bytesToBase64URL(new Uint8Array(64)),
      },
      clientExtensionResults: {},
    };

    await expect(
      verifyAuthenticationResponse({
        response,
        expectedChallenge: 'wrong-challenge',
        expectedOrigin: TEST_ORIGIN,
        expectedRPID: TEST_RP_ID,
        credential: {
          id: credentialIdB64,
          publicKey: cosePublicKeyCBOR,
          counter: 0,
        },
      }),
    ).rejects.toThrow('Unexpected authentication response challenge');
  });

  it('rejects mismatched origin', async () => {
    const { cosePublicKeyCBOR } = generateES256KeyPair();
    const rpIdHash = sha256(new TextEncoder().encode(TEST_RP_ID));
    const authData = buildAuthenticatorData({
      rpIdHash,
      flags: 0x01,
      counter: 1,
    });

    const credentialIdB64 = bytesToBase64URL(new Uint8Array(16).fill(0x12));

    const response: PasskeyAuthenticationResponse = {
      id: credentialIdB64,
      rawId: credentialIdB64,
      type: 'public-key',
      response: {
        clientDataJSON: makeAuthClientDataJSON(),
        authenticatorData: bytesToBase64URL(authData),
        signature: bytesToBase64URL(new Uint8Array(64)),
      },
      clientExtensionResults: {},
    };

    await expect(
      verifyAuthenticationResponse({
        response,
        expectedChallenge: TEST_CHALLENGE,
        expectedOrigin: 'https://evil.com',
        expectedRPID: TEST_RP_ID,
        credential: {
          id: credentialIdB64,
          publicKey: cosePublicKeyCBOR,
          counter: 0,
        },
      }),
    ).rejects.toThrow('Unexpected authentication response origin');
  });

  it('rejects counter replay', async () => {
    const { privateKey, cosePublicKeyCBOR } = generateES256KeyPair();
    const rpIdHash = sha256(new TextEncoder().encode(TEST_RP_ID));

    const authData = buildAuthenticatorData({
      rpIdHash,
      flags: 0x01,
      counter: 5,
    });

    const clientDataJSONStr = makeAuthClientDataJSON();
    const clientDataBytes = Uint8Array.from(
      atob(
        clientDataJSONStr.replace(/-/gu, '+').replace(/_/gu, '/') +
          '='.repeat((4 - (clientDataJSONStr.length % 4)) % 4),
      ),
      (ch) => ch.charCodeAt(0),
    );
    const clientDataHash = sha256(clientDataBytes);

    const signatureBase = new Uint8Array(
      authData.length + clientDataHash.length,
    );
    signatureBase.set(authData, 0);
    signatureBase.set(clientDataHash, authData.length);

    const sigHash = sha256(signatureBase);
    const ecdsaSig = p256.sign(sigHash, privateKey);

    const credentialIdB64 = bytesToBase64URL(new Uint8Array(16).fill(0x13));

    const response: PasskeyAuthenticationResponse = {
      id: credentialIdB64,
      rawId: credentialIdB64,
      type: 'public-key',
      response: {
        clientDataJSON: clientDataJSONStr,
        authenticatorData: bytesToBase64URL(authData),
        signature: bytesToBase64URL(new Uint8Array(ecdsaSig.toDERRawBytes())),
      },
      clientExtensionResults: {},
    };

    await expect(
      verifyAuthenticationResponse({
        response,
        expectedChallenge: TEST_CHALLENGE,
        expectedOrigin: TEST_ORIGIN,
        expectedRPID: TEST_RP_ID,
        credential: {
          id: credentialIdB64,
          publicKey: cosePublicKeyCBOR,
          counter: 10,
        },
      }),
    ).rejects.toThrow('Response counter value 5 was lower than expected 10');
  });

  it('rejects wrong clientDataJSON type', async () => {
    const { cosePublicKeyCBOR } = generateES256KeyPair();
    const rpIdHash = sha256(new TextEncoder().encode(TEST_RP_ID));
    const authData = buildAuthenticatorData({
      rpIdHash,
      flags: 0x01,
      counter: 1,
    });

    const credentialIdB64 = bytesToBase64URL(new Uint8Array(16).fill(0x14));

    const response: PasskeyAuthenticationResponse = {
      id: credentialIdB64,
      rawId: credentialIdB64,
      type: 'public-key',
      response: {
        clientDataJSON: makeAuthClientDataJSON({ type: 'webauthn.create' }),
        authenticatorData: bytesToBase64URL(authData),
        signature: bytesToBase64URL(new Uint8Array(64)),
      },
      clientExtensionResults: {},
    };

    await expect(
      verifyAuthenticationResponse({
        response,
        expectedChallenge: TEST_CHALLENGE,
        expectedOrigin: TEST_ORIGIN,
        expectedRPID: TEST_RP_ID,
        credential: {
          id: credentialIdB64,
          publicKey: cosePublicKeyCBOR,
          counter: 0,
        },
      }),
    ).rejects.toThrow('Unexpected authentication response type');
  });

  it('rejects mismatched RP ID', async () => {
    const { cosePublicKeyCBOR } = generateES256KeyPair();
    const rpIdHash = sha256(new TextEncoder().encode(TEST_RP_ID));
    const authData = buildAuthenticatorData({
      rpIdHash,
      flags: 0x01,
      counter: 1,
    });

    const credentialIdB64 = bytesToBase64URL(new Uint8Array(16).fill(0x15));

    const response: PasskeyAuthenticationResponse = {
      id: credentialIdB64,
      rawId: credentialIdB64,
      type: 'public-key',
      response: {
        clientDataJSON: makeAuthClientDataJSON(),
        authenticatorData: bytesToBase64URL(authData),
        signature: bytesToBase64URL(new Uint8Array(64)),
      },
      clientExtensionResults: {},
    };

    await expect(
      verifyAuthenticationResponse({
        response,
        expectedChallenge: TEST_CHALLENGE,
        expectedOrigin: TEST_ORIGIN,
        expectedRPID: 'wrong-rp.com',
        credential: {
          id: credentialIdB64,
          publicKey: cosePublicKeyCBOR,
          counter: 0,
        },
      }),
    ).rejects.toThrow('Unexpected RP ID hash');
  });

  it('rejects missing credential ID', async () => {
    const { cosePublicKeyCBOR } = generateES256KeyPair();
    const credentialIdB64 = bytesToBase64URL(new Uint8Array(16).fill(0x16));

    const response: PasskeyAuthenticationResponse = {
      id: '',
      rawId: '',
      type: 'public-key',
      response: {
        clientDataJSON: makeAuthClientDataJSON(),
        authenticatorData: bytesToBase64URL(new Uint8Array(37)),
        signature: bytesToBase64URL(new Uint8Array(64)),
      },
      clientExtensionResults: {},
    };

    await expect(
      verifyAuthenticationResponse({
        response,
        expectedChallenge: TEST_CHALLENGE,
        expectedOrigin: TEST_ORIGIN,
        expectedRPID: TEST_RP_ID,
        credential: {
          id: credentialIdB64,
          publicKey: cosePublicKeyCBOR,
          counter: 0,
        },
      }),
    ).rejects.toThrow('Missing credential ID');
  });

  it('rejects id !== rawId', async () => {
    const { cosePublicKeyCBOR } = generateES256KeyPair();
    const credentialIdB64 = bytesToBase64URL(new Uint8Array(16).fill(0x17));

    const response: PasskeyAuthenticationResponse = {
      id: credentialIdB64,
      rawId: 'different-raw-id',
      type: 'public-key',
      response: {
        clientDataJSON: makeAuthClientDataJSON(),
        authenticatorData: bytesToBase64URL(new Uint8Array(37)),
        signature: bytesToBase64URL(new Uint8Array(64)),
      },
      clientExtensionResults: {},
    };

    await expect(
      verifyAuthenticationResponse({
        response,
        expectedChallenge: TEST_CHALLENGE,
        expectedOrigin: TEST_ORIGIN,
        expectedRPID: TEST_RP_ID,
        credential: {
          id: credentialIdB64,
          publicKey: cosePublicKeyCBOR,
          counter: 0,
        },
      }),
    ).rejects.toThrow('Credential ID was not base64url-encoded');
  });

  it('rejects wrong credential type', async () => {
    const { cosePublicKeyCBOR } = generateES256KeyPair();
    const credentialIdB64 = bytesToBase64URL(new Uint8Array(16).fill(0x18));

    const response = {
      id: credentialIdB64,
      rawId: credentialIdB64,
      type: 'not-public-key',
      response: {
        clientDataJSON: makeAuthClientDataJSON(),
        authenticatorData: bytesToBase64URL(new Uint8Array(37)),
        signature: bytesToBase64URL(new Uint8Array(64)),
      },
      clientExtensionResults: {},
    } as unknown as PasskeyAuthenticationResponse;

    await expect(
      verifyAuthenticationResponse({
        response,
        expectedChallenge: TEST_CHALLENGE,
        expectedOrigin: TEST_ORIGIN,
        expectedRPID: TEST_RP_ID,
        credential: {
          id: credentialIdB64,
          publicKey: cosePublicKeyCBOR,
          counter: 0,
        },
      }),
    ).rejects.toThrow('Unexpected credential type');
  });

  it('rejects when user not present', async () => {
    const { cosePublicKeyCBOR } = generateES256KeyPair();
    const rpIdHash = sha256(new TextEncoder().encode(TEST_RP_ID));

    // flags: 0x00 - no UP
    const authData = buildAuthenticatorData({
      rpIdHash,
      flags: 0x00,
      counter: 1,
    });

    const clientDataJSONStr = makeAuthClientDataJSON();
    const credentialIdB64 = bytesToBase64URL(new Uint8Array(16).fill(0x19));

    const response: PasskeyAuthenticationResponse = {
      id: credentialIdB64,
      rawId: credentialIdB64,
      type: 'public-key',
      response: {
        clientDataJSON: clientDataJSONStr,
        authenticatorData: bytesToBase64URL(authData),
        signature: bytesToBase64URL(new Uint8Array(64)),
      },
      clientExtensionResults: {},
    };

    await expect(
      verifyAuthenticationResponse({
        response,
        expectedChallenge: TEST_CHALLENGE,
        expectedOrigin: TEST_ORIGIN,
        expectedRPID: TEST_RP_ID,
        credential: {
          id: credentialIdB64,
          publicKey: cosePublicKeyCBOR,
          counter: 0,
        },
      }),
    ).rejects.toThrow('User not present during authentication');
  });

  it('rejects user verification not met when required', async () => {
    const { cosePublicKeyCBOR } = generateES256KeyPair();
    const rpIdHash = sha256(new TextEncoder().encode(TEST_RP_ID));

    // flags: UP only (0x01), no UV
    const authData = buildAuthenticatorData({
      rpIdHash,
      flags: 0x01,
      counter: 1,
    });

    const credentialIdB64 = bytesToBase64URL(new Uint8Array(16).fill(0x20));

    const response: PasskeyAuthenticationResponse = {
      id: credentialIdB64,
      rawId: credentialIdB64,
      type: 'public-key',
      response: {
        clientDataJSON: makeAuthClientDataJSON(),
        authenticatorData: bytesToBase64URL(authData),
        signature: bytesToBase64URL(new Uint8Array(64)),
      },
      clientExtensionResults: {},
    };

    await expect(
      verifyAuthenticationResponse({
        response,
        expectedChallenge: TEST_CHALLENGE,
        expectedOrigin: TEST_ORIGIN,
        expectedRPID: TEST_RP_ID,
        credential: {
          id: credentialIdB64,
          publicKey: cosePublicKeyCBOR,
          counter: 0,
        },
        requireUserVerification: true,
      }),
    ).rejects.toThrow('User verification required');
  });

  it('accepts expectedOrigin as array', async () => {
    const { privateKey, cosePublicKeyCBOR } = generateES256KeyPair();
    const rpIdHash = sha256(new TextEncoder().encode(TEST_RP_ID));

    const authData = buildAuthenticatorData({
      rpIdHash,
      flags: 0x01,
      counter: 1,
    });

    const clientDataJSONStr = makeAuthClientDataJSON();
    const clientDataBytes = Uint8Array.from(
      atob(
        clientDataJSONStr.replace(/-/gu, '+').replace(/_/gu, '/') +
          '='.repeat((4 - (clientDataJSONStr.length % 4)) % 4),
      ),
      (ch) => ch.charCodeAt(0),
    );
    const clientDataHash = sha256(clientDataBytes);

    const signatureBase = new Uint8Array(
      authData.length + clientDataHash.length,
    );
    signatureBase.set(authData, 0);
    signatureBase.set(clientDataHash, authData.length);

    const sigHash = sha256(signatureBase);
    const ecdsaSig = p256.sign(sigHash, privateKey);

    const credentialIdB64 = bytesToBase64URL(new Uint8Array(16).fill(0x21));

    const response: PasskeyAuthenticationResponse = {
      id: credentialIdB64,
      rawId: credentialIdB64,
      type: 'public-key',
      response: {
        clientDataJSON: clientDataJSONStr,
        authenticatorData: bytesToBase64URL(authData),
        signature: bytesToBase64URL(new Uint8Array(ecdsaSig.toDERRawBytes())),
      },
      clientExtensionResults: {},
    };

    const result = await verifyAuthenticationResponse({
      response,
      expectedChallenge: TEST_CHALLENGE,
      expectedOrigin: ['https://other.com', TEST_ORIGIN],
      expectedRPID: TEST_RP_ID,
      credential: {
        id: credentialIdB64,
        publicKey: cosePublicKeyCBOR,
        counter: 0,
      },
    });

    expect(result.verified).toBe(true);
  });

  it('skips counter check when both counters are zero', async () => {
    const { privateKey, cosePublicKeyCBOR } = generateES256KeyPair();
    const rpIdHash = sha256(new TextEncoder().encode(TEST_RP_ID));

    const authData = buildAuthenticatorData({
      rpIdHash,
      flags: 0x01,
      counter: 0,
    });

    const clientDataJSONStr = makeAuthClientDataJSON();
    const clientDataBytes = Uint8Array.from(
      atob(
        clientDataJSONStr.replace(/-/gu, '+').replace(/_/gu, '/') +
          '='.repeat((4 - (clientDataJSONStr.length % 4)) % 4),
      ),
      (ch) => ch.charCodeAt(0),
    );
    const clientDataHash = sha256(clientDataBytes);

    const signatureBase = new Uint8Array(
      authData.length + clientDataHash.length,
    );
    signatureBase.set(authData, 0);
    signatureBase.set(clientDataHash, authData.length);

    const sigHash = sha256(signatureBase);
    const ecdsaSig = p256.sign(sigHash, privateKey);

    const credentialIdB64 = bytesToBase64URL(new Uint8Array(16).fill(0x63));

    const response: PasskeyAuthenticationResponse = {
      id: credentialIdB64,
      rawId: credentialIdB64,
      type: 'public-key',
      response: {
        clientDataJSON: clientDataJSONStr,
        authenticatorData: bytesToBase64URL(authData),
        signature: bytesToBase64URL(new Uint8Array(ecdsaSig.toDERRawBytes())),
      },
      clientExtensionResults: {},
    };

    const result = await verifyAuthenticationResponse({
      response,
      expectedChallenge: TEST_CHALLENGE,
      expectedOrigin: TEST_ORIGIN,
      expectedRPID: TEST_RP_ID,
      credential: {
        id: credentialIdB64,
        publicKey: cosePublicKeyCBOR,
        counter: 0,
      },
    });

    expect(result.verified).toBe(true);
    expect(result.authenticationInfo.newCounter).toBe(0);
  });
});

describe('verifyRegistrationResponse edge cases', () => {
  it('rejects id !== rawId', async () => {
    const response: PasskeyRegistrationResponse = {
      id: 'id1',
      rawId: 'id2',
      type: 'public-key',
      response: {
        clientDataJSON: makeClientDataJSON(),
        attestationObject: bytesToBase64URL(new Uint8Array([0])),
      },
      clientExtensionResults: {},
    };

    await expect(
      verifyRegistrationResponse({
        response,
        expectedChallenge: TEST_CHALLENGE,
        expectedOrigin: TEST_ORIGIN,
        expectedRPID: TEST_RP_ID,
      }),
    ).rejects.toThrow('Credential ID was not base64url-encoded');
  });

  it('rejects wrong credential type', async () => {
    const response = {
      id: 'abc',
      rawId: 'abc',
      type: 'not-public-key',
      response: {
        clientDataJSON: makeClientDataJSON(),
        attestationObject: bytesToBase64URL(new Uint8Array([0])),
      },
      clientExtensionResults: {},
    } as unknown as PasskeyRegistrationResponse;

    await expect(
      verifyRegistrationResponse({
        response,
        expectedChallenge: TEST_CHALLENGE,
        expectedOrigin: TEST_ORIGIN,
        expectedRPID: TEST_RP_ID,
      }),
    ).rejects.toThrow('Unexpected credential type');
  });

  it('rejects user verification not met when required', async () => {
    const { cosePublicKeyCBOR } = generateES256KeyPair();
    const credentialID = new Uint8Array(16).fill(0x30);
    const aaguid = new Uint8Array(16).fill(0);
    const rpIdHash = sha256(new TextEncoder().encode(TEST_RP_ID));

    // flags: UP (0x01) | AT (0x40) = 0x41 (no UV)
    const authData = buildAuthenticatorData({
      rpIdHash,
      flags: 0x41,
      counter: 0,
      aaguid,
      credentialID,
      credentialPublicKey: cosePublicKeyCBOR,
    });

    const credentialIdB64 = bytesToBase64URL(credentialID);
    const response = buildRegistrationResponse(authData, credentialIdB64);

    await expect(
      verifyRegistrationResponse({
        response,
        expectedChallenge: TEST_CHALLENGE,
        expectedOrigin: TEST_ORIGIN,
        expectedRPID: TEST_RP_ID,
        requireUserVerification: true,
      }),
    ).rejects.toThrow('User verification was required');
  });

  it('rejects user not present', async () => {
    const { cosePublicKeyCBOR } = generateES256KeyPair();
    const credentialID = new Uint8Array(16).fill(0x31);
    const aaguid = new Uint8Array(16).fill(0);
    const rpIdHash = sha256(new TextEncoder().encode(TEST_RP_ID));

    // flags: AT (0x40) only, no UP
    const authData = buildAuthenticatorData({
      rpIdHash,
      flags: 0x40,
      counter: 0,
      aaguid,
      credentialID,
      credentialPublicKey: cosePublicKeyCBOR,
    });

    const credentialIdB64 = bytesToBase64URL(credentialID);
    const response = buildRegistrationResponse(authData, credentialIdB64);

    await expect(
      verifyRegistrationResponse({
        response,
        expectedChallenge: TEST_CHALLENGE,
        expectedOrigin: TEST_ORIGIN,
        expectedRPID: TEST_RP_ID,
      }),
    ).rejects.toThrow('User presence was required');
  });

  it('rejects unsupported public key algorithm', async () => {
    // Build a COSE key with an unsupported alg
    const unsupportedMap = new Map<number, number | Uint8Array>();
    unsupportedMap.set(COSEKEYS.Kty, COSEKTY.EC2);
    unsupportedMap.set(COSEKEYS.Alg, -999);
    unsupportedMap.set(COSEKEYS.Crv, COSECRV.P256);
    unsupportedMap.set(COSEKEYS.X, new Uint8Array(32).fill(0x01));
    unsupportedMap.set(COSEKEYS.Y, new Uint8Array(32).fill(0x02));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const unsupportedKeyCBOR = encodeCBOR(unsupportedMap as any);

    const credentialID = new Uint8Array(16).fill(0x32);
    const aaguid = new Uint8Array(16).fill(0);
    const rpIdHash = sha256(new TextEncoder().encode(TEST_RP_ID));

    const authData = buildAuthenticatorData({
      rpIdHash,
      flags: 0x41,
      counter: 0,
      aaguid,
      credentialID,
      credentialPublicKey: unsupportedKeyCBOR,
    });

    const credentialIdB64 = bytesToBase64URL(credentialID);
    const response = buildRegistrationResponse(authData, credentialIdB64);

    await expect(
      verifyRegistrationResponse({
        response,
        expectedChallenge: TEST_CHALLENGE,
        expectedOrigin: TEST_ORIGIN,
        expectedRPID: TEST_RP_ID,
      }),
    ).rejects.toThrow('Unexpected public key alg');
  });

  it('rejects missing public key', async () => {
    const rpIdHash = sha256(new TextEncoder().encode(TEST_RP_ID));

    const authData = buildAuthenticatorData({
      rpIdHash,
      flags: 0x01,
      counter: 0,
    });

    const credentialIdB64 = bytesToBase64URL(new Uint8Array(16).fill(0x33));
    const response = buildRegistrationResponse(authData, credentialIdB64);

    await expect(
      verifyRegistrationResponse({
        response,
        expectedChallenge: TEST_CHALLENGE,
        expectedOrigin: TEST_ORIGIN,
        expectedRPID: TEST_RP_ID,
      }),
    ).rejects.toThrow('No credential ID was provided');
  });

  it('rejects packed attestation with missing alg', async () => {
    const { cosePublicKeyCBOR } = generateES256KeyPair();
    const credentialID = new Uint8Array(16).fill(0x61);
    const aaguid = new Uint8Array(16).fill(0);
    const rpIdHash = sha256(new TextEncoder().encode(TEST_RP_ID));

    const authData = buildAuthenticatorData({
      rpIdHash,
      flags: 0x41,
      counter: 0,
      aaguid,
      credentialID,
      credentialPublicKey: cosePublicKeyCBOR,
    });

    const attStmt = new Map<string, unknown>();
    attStmt.set('sig', new Uint8Array(64));
    // no 'alg' set

    const credentialIdB64 = bytesToBase64URL(credentialID);
    const response = buildRegistrationResponse(
      authData,
      credentialIdB64,
      'packed',
      attStmt,
    );

    await expect(
      verifyRegistrationResponse({
        response,
        expectedChallenge: TEST_CHALLENGE,
        expectedOrigin: TEST_ORIGIN,
        expectedRPID: TEST_RP_ID,
      }),
    ).rejects.toThrow('Packed attestation statement missing alg');
  });

  it('rejects packed attestation with mismatched alg', async () => {
    const { cosePublicKeyCBOR } = generateES256KeyPair();
    const credentialID = new Uint8Array(16).fill(0x62);
    const aaguid = new Uint8Array(16).fill(0);
    const rpIdHash = sha256(new TextEncoder().encode(TEST_RP_ID));

    const authData = buildAuthenticatorData({
      rpIdHash,
      flags: 0x41,
      counter: 0,
      aaguid,
      credentialID,
      credentialPublicKey: cosePublicKeyCBOR,
    });

    const attStmt = new Map<string, unknown>();
    attStmt.set('alg', COSEALG.RS256); // doesn't match ES256
    attStmt.set('sig', new Uint8Array(64));

    const credentialIdB64 = bytesToBase64URL(credentialID);
    const response = buildRegistrationResponse(
      authData,
      credentialIdB64,
      'packed',
      attStmt,
    );

    await expect(
      verifyRegistrationResponse({
        response,
        expectedChallenge: TEST_CHALLENGE,
        expectedOrigin: TEST_ORIGIN,
        expectedRPID: TEST_RP_ID,
      }),
    ).rejects.toThrow('does not match credential alg');
  });

  it('rejects packed attestation with x5c certificates', async () => {
    const { cosePublicKeyCBOR } = generateES256KeyPair();
    const credentialID = new Uint8Array(16).fill(0x34);
    const aaguid = new Uint8Array(16).fill(0);
    const rpIdHash = sha256(new TextEncoder().encode(TEST_RP_ID));

    const authData = buildAuthenticatorData({
      rpIdHash,
      flags: 0x41,
      counter: 0,
      aaguid,
      credentialID,
      credentialPublicKey: cosePublicKeyCBOR,
    });

    const attStmt = new Map<string, unknown>();
    attStmt.set('alg', COSEALG.ES256);
    attStmt.set('sig', new Uint8Array(64));
    attStmt.set('x5c', [new Uint8Array(100)]);

    const credentialIdB64 = bytesToBase64URL(credentialID);
    const response = buildRegistrationResponse(
      authData,
      credentialIdB64,
      'packed',
      attStmt,
    );

    await expect(
      verifyRegistrationResponse({
        response,
        expectedChallenge: TEST_CHALLENGE,
        expectedOrigin: TEST_ORIGIN,
        expectedRPID: TEST_RP_ID,
      }),
    ).rejects.toThrow(
      'Packed attestation with certificate chain (x5c) is not supported',
    );
  });

  it('rejects packed attestation with missing signature', async () => {
    const { cosePublicKeyCBOR } = generateES256KeyPair();
    const credentialID = new Uint8Array(16).fill(0x35);
    const aaguid = new Uint8Array(16).fill(0);
    const rpIdHash = sha256(new TextEncoder().encode(TEST_RP_ID));

    const authData = buildAuthenticatorData({
      rpIdHash,
      flags: 0x41,
      counter: 0,
      aaguid,
      credentialID,
      credentialPublicKey: cosePublicKeyCBOR,
    });

    const attStmt = new Map<string, unknown>();
    attStmt.set('alg', COSEALG.ES256);

    const credentialIdB64 = bytesToBase64URL(credentialID);
    const response = buildRegistrationResponse(
      authData,
      credentialIdB64,
      'packed',
      attStmt,
    );

    await expect(
      verifyRegistrationResponse({
        response,
        expectedChallenge: TEST_CHALLENGE,
        expectedOrigin: TEST_ORIGIN,
        expectedRPID: TEST_RP_ID,
      }),
    ).rejects.toThrow('Packed attestation missing signature');
  });

  it('rejects unsupported attestation format', async () => {
    const { cosePublicKeyCBOR } = generateES256KeyPair();
    const credentialID = new Uint8Array(16).fill(0x36);
    const aaguid = new Uint8Array(16).fill(0);
    const rpIdHash = sha256(new TextEncoder().encode(TEST_RP_ID));

    const authData = buildAuthenticatorData({
      rpIdHash,
      flags: 0x41,
      counter: 0,
      aaguid,
      credentialID,
      credentialPublicKey: cosePublicKeyCBOR,
    });

    const credentialIdB64 = bytesToBase64URL(credentialID);
    const response = buildRegistrationResponse(
      authData,
      credentialIdB64,
      'fido-u2f',
    );

    await expect(
      verifyRegistrationResponse({
        response,
        expectedChallenge: TEST_CHALLENGE,
        expectedOrigin: TEST_ORIGIN,
        expectedRPID: TEST_RP_ID,
      }),
    ).rejects.toThrow('Unsupported attestation format');
  });

  it('rejects none attestation with non-empty attStmt', async () => {
    const { cosePublicKeyCBOR } = generateES256KeyPair();
    const credentialID = new Uint8Array(16).fill(0x37);
    const aaguid = new Uint8Array(16).fill(0);
    const rpIdHash = sha256(new TextEncoder().encode(TEST_RP_ID));

    const authData = buildAuthenticatorData({
      rpIdHash,
      flags: 0x41,
      counter: 0,
      aaguid,
      credentialID,
      credentialPublicKey: cosePublicKeyCBOR,
    });

    const attStmt = new Map<string, unknown>();
    attStmt.set('unexpected', 'value');

    const credentialIdB64 = bytesToBase64URL(credentialID);
    const response = buildRegistrationResponse(
      authData,
      credentialIdB64,
      'none',
      attStmt,
    );

    await expect(
      verifyRegistrationResponse({
        response,
        expectedChallenge: TEST_CHALLENGE,
        expectedOrigin: TEST_ORIGIN,
        expectedRPID: TEST_RP_ID,
      }),
    ).rejects.toThrow('None attestation had unexpected attestation statement');
  });

  it('accepts expectedOrigin as array', async () => {
    const { cosePublicKeyCBOR } = generateES256KeyPair();
    const credentialID = new Uint8Array(16).fill(0x38);
    const aaguid = new Uint8Array(16).fill(0);
    const rpIdHash = sha256(new TextEncoder().encode(TEST_RP_ID));

    const authData = buildAuthenticatorData({
      rpIdHash,
      flags: 0x41,
      counter: 0,
      aaguid,
      credentialID,
      credentialPublicKey: cosePublicKeyCBOR,
    });

    const credentialIdB64 = bytesToBase64URL(credentialID);
    const response = buildRegistrationResponse(authData, credentialIdB64);

    const result = await verifyRegistrationResponse({
      response,
      expectedChallenge: TEST_CHALLENGE,
      expectedOrigin: ['https://other.com', TEST_ORIGIN],
      expectedRPID: TEST_RP_ID,
    });

    expect(result.verified).toBe(true);
  });

  it('rejects missing credential ID in registration response', async () => {
    const response: PasskeyRegistrationResponse = {
      id: '',
      rawId: '',
      type: 'public-key',
      response: {
        clientDataJSON: makeClientDataJSON(),
        attestationObject: bytesToBase64URL(new Uint8Array([0])),
      },
      clientExtensionResults: {},
    };

    await expect(
      verifyRegistrationResponse({
        response,
        expectedChallenge: TEST_CHALLENGE,
        expectedOrigin: TEST_ORIGIN,
        expectedRPID: TEST_RP_ID,
      }),
    ).rejects.toThrow('Missing credential ID');
  });
});

describe('verifySignature', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, n/global-require
  const { verifySignature } = require('./verifySignature');

  it('verifies P-384 EC2 signature', async () => {
    const privateKey = p384.utils.randomPrivateKey();
    const publicKeyRaw = p384.getPublicKey(privateKey, false);

    const coseMap = new Map<number, number | Uint8Array>();
    coseMap.set(COSEKEYS.Kty, COSEKTY.EC2);
    coseMap.set(COSEKEYS.Alg, COSEALG.ES384);
    coseMap.set(COSEKEYS.Crv, COSECRV.P384);
    coseMap.set(COSEKEYS.X, publicKeyRaw.slice(1, 49));
    coseMap.set(COSEKEYS.Y, publicKeyRaw.slice(49, 97));

    const data = new Uint8Array(32).fill(0xcc);
    const hash = sha384(data);
    const ecdsaSig = p384.sign(hash, privateKey);

    const result = await verifySignature({
      cosePublicKey: coseMap,
      signature: new Uint8Array(ecdsaSig.toDERRawBytes()),
      data,
    });

    expect(result).toBe(true);
  });

  it('verifies Ed25519 OKP signature', async () => {
    const privateKey = ed25519.utils.randomPrivateKey();
    const publicKey = ed25519.getPublicKey(privateKey);

    const coseMap = new Map<number, number | Uint8Array>();
    coseMap.set(COSEKEYS.Kty, COSEKTY.OKP);
    coseMap.set(COSEKEYS.Alg, COSEALG.EdDSA);
    coseMap.set(COSEKEYS.Crv, COSECRV.ED25519);
    coseMap.set(COSEKEYS.X, publicKey);

    const data = new Uint8Array(32).fill(0xdd);
    const edSig = ed25519.sign(data, privateKey);

    const result = await verifySignature({
      cosePublicKey: coseMap,
      signature: edSig,
      data,
    });

    expect(result).toBe(true);
  });

  it('throws for unsupported EC2 curve', async () => {
    const coseMap = new Map<number, number | Uint8Array>();
    coseMap.set(COSEKEYS.Kty, COSEKTY.EC2);
    coseMap.set(COSEKEYS.Alg, COSEALG.ES256);
    coseMap.set(COSEKEYS.Crv, 99);
    coseMap.set(COSEKEYS.X, new Uint8Array(32));
    coseMap.set(COSEKEYS.Y, new Uint8Array(32));

    await expect(
      verifySignature({
        cosePublicKey: coseMap,
        signature: new Uint8Array(64),
        data: new Uint8Array(32),
      }),
    ).rejects.toThrow('Unsupported EC2 curve');
  });

  it('throws for missing EC2 coordinates', async () => {
    const coseMap = new Map<number, number | Uint8Array>();
    coseMap.set(COSEKEYS.Kty, COSEKTY.EC2);
    coseMap.set(COSEKEYS.Alg, COSEALG.ES256);
    coseMap.set(COSEKEYS.Crv, COSECRV.P256);

    await expect(
      verifySignature({
        cosePublicKey: coseMap,
        signature: new Uint8Array(64),
        data: new Uint8Array(32),
      }),
    ).rejects.toThrow('EC2 public key missing x or y coordinate');
  });

  it('throws for missing OKP x coordinate', async () => {
    const coseMap = new Map<number, number | Uint8Array>();
    coseMap.set(COSEKEYS.Kty, COSEKTY.OKP);
    coseMap.set(COSEKEYS.Alg, COSEALG.EdDSA);
    coseMap.set(COSEKEYS.Crv, COSECRV.ED25519);

    await expect(
      verifySignature({
        cosePublicKey: coseMap,
        signature: new Uint8Array(64),
        data: new Uint8Array(32),
      }),
    ).rejects.toThrow('OKP public key missing x coordinate');
  });

  it('throws for missing kty', async () => {
    const coseMap = new Map<number, number | Uint8Array>();
    coseMap.set(COSEKEYS.Alg, COSEALG.ES256);

    await expect(
      verifySignature({
        cosePublicKey: coseMap,
        signature: new Uint8Array(64),
        data: new Uint8Array(32),
      }),
    ).rejects.toThrow('COSE public key missing kty');
  });

  it('throws for unsupported key type', async () => {
    const coseMap = new Map<number, number | Uint8Array>();
    coseMap.set(COSEKEYS.Kty, 99);
    coseMap.set(COSEKEYS.Alg, COSEALG.ES256);

    await expect(
      verifySignature({
        cosePublicKey: coseMap,
        signature: new Uint8Array(64),
        data: new Uint8Array(32),
      }),
    ).rejects.toThrow('Unsupported COSE key type');
  });

  /* eslint-disable n/no-unsupported-features/node-builtins */
  it('verifies RSA signature via Web Crypto', async () => {
    const keyPair = await globalThis.crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: { name: 'SHA-256' },
      },
      true,
      ['sign', 'verify'],
    );

    const data = new Uint8Array(32).fill(0xee);
    const signature = new Uint8Array(
      await globalThis.crypto.subtle.sign(
        'RSASSA-PKCS1-v1_5',
        keyPair.privateKey,
        data,
      ),
    );

    const jwk = await globalThis.crypto.subtle.exportKey(
      'jwk',
      keyPair.publicKey,
    );

    // Convert JWK n and e to raw bytes
    const nBytes = Uint8Array.from(
      atob(
        (jwk.n as string).replace(/-/gu, '+').replace(/_/gu, '/') +
          '='.repeat((4 - ((jwk.n as string).length % 4)) % 4),
      ),
      (ch) => ch.charCodeAt(0),
    );
    const eBytes = Uint8Array.from(
      atob(
        (jwk.e as string).replace(/-/gu, '+').replace(/_/gu, '/') +
          '='.repeat((4 - ((jwk.e as string).length % 4)) % 4),
      ),
      (ch) => ch.charCodeAt(0),
    );

    const coseMap = new Map<number, number | Uint8Array>();
    coseMap.set(COSEKEYS.Kty, COSEKTY.RSA);
    coseMap.set(COSEKEYS.Alg, COSEALG.RS256);
    // For RSA, COSE uses -1 for n and -2 for e (same numeric values as crv/x in EC2)
    coseMap.set(-1, nBytes);
    coseMap.set(-2, eBytes);

    const result = await verifySignature({
      cosePublicKey: coseMap,
      signature,
      data,
    });

    expect(result).toBe(true);
  });
  /* eslint-enable n/no-unsupported-features/node-builtins */

  it('throws for unsupported RSA algorithm', async () => {
    const coseMap = new Map<number, number | Uint8Array>();
    coseMap.set(COSEKEYS.Kty, COSEKTY.RSA);
    coseMap.set(COSEKEYS.Alg, -999);
    coseMap.set(-1, new Uint8Array(256));
    coseMap.set(-2, new Uint8Array([1, 0, 1]));

    await expect(
      verifySignature({
        cosePublicKey: coseMap,
        signature: new Uint8Array(256),
        data: new Uint8Array(32),
      }),
    ).rejects.toThrow('Unsupported RSA algorithm');
  });

  it('throws for missing RSA n or e', async () => {
    const coseMap = new Map<number, number | Uint8Array>();
    coseMap.set(COSEKEYS.Kty, COSEKTY.RSA);
    coseMap.set(COSEKEYS.Alg, COSEALG.RS256);

    await expect(
      verifySignature({
        cosePublicKey: coseMap,
        signature: new Uint8Array(256),
        data: new Uint8Array(32),
      }),
    ).rejects.toThrow('RSA public key missing n or e');
  });
});

describe('parseAuthenticatorData edge cases', () => {
  /* eslint-disable @typescript-eslint/no-require-imports, n/global-require */
  const { parseAuthenticatorData } = require('./parseAuthenticatorData');
  /* eslint-enable @typescript-eslint/no-require-imports, n/global-require */

  it('throws for authenticator data shorter than 37 bytes', () => {
    expect(() => parseAuthenticatorData(new Uint8Array(36))).toThrow(
      'authenticatorData is 36 bytes, expected at least 37',
    );
  });

  it('parses extension data when ED flag is set', () => {
    const rpIdHash = sha256(new TextEncoder().encode(TEST_RP_ID));
    // flags: UP (0x01) | ED (0x80) = 0x81
    const flags = 0x81;
    const counter = new Uint8Array(4);

    // Extension data: CBOR map {"credProtect": 2}
    const extMap = new Map();
    extMap.set('credProtect', 2);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const extCBOR = encodeCBOR(extMap as any);

    const authData = new Uint8Array(37 + extCBOR.length);
    authData.set(rpIdHash, 0);
    authData[32] = flags;
    authData.set(counter, 33);
    authData.set(extCBOR, 37);

    const result = parseAuthenticatorData(authData);
    expect(result.flags.ed).toBe(true);
    expect(result.extensionsData).toBeDefined();
    expect(result.extensionsData?.get('credProtect')).toBe(2);
  });

  it('throws on leftover bytes after parsing', () => {
    const rpIdHash = sha256(new TextEncoder().encode(TEST_RP_ID));
    // flags: UP only (0x01) -- no AT, no ED
    const authData = new Uint8Array(37 + 5);
    authData.set(rpIdHash, 0);
    authData[32] = 0x01;
    // counter = 0 (bytes 33-36 are already zero)
    // 5 extra bytes after the 37-byte minimum
    authData.set(new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x00]), 37);

    expect(() => parseAuthenticatorData(authData)).toThrow(
      'Leftover bytes detected while parsing authenticator data',
    );
  });

  it('parses authenticator data without attested credential or extensions', () => {
    const rpIdHash = sha256(new TextEncoder().encode(TEST_RP_ID));
    // flags: UP (0x01) | UV (0x04) = 0x05
    const authData = new Uint8Array(37);
    authData.set(rpIdHash, 0);
    authData[32] = 0x05;
    // counter = 42
    const counterView = new DataView(authData.buffer, 33, 4);
    counterView.setUint32(0, 42, false);

    const result = parseAuthenticatorData(authData);
    expect(result.flags.up).toBe(true);
    expect(result.flags.uv).toBe(true);
    expect(result.flags.at).toBe(false);
    expect(result.flags.ed).toBe(false);
    expect(result.counter).toBe(42);
    expect(result.aaguid).toBeUndefined();
    expect(result.credentialID).toBeUndefined();
    expect(result.credentialPublicKey).toBeUndefined();
    expect(result.extensionsData).toBeUndefined();
  });
});

describe('matchExpectedRPID edge cases', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, n/global-require
  const { matchExpectedRPID } = require('./matchExpectedRPID');

  it('throws when no RP ID matches', () => {
    const rpIdHash = sha256(new TextEncoder().encode('example.com'));
    expect(() => matchExpectedRPID(rpIdHash, ['wrong.com'])).toThrow(
      'Unexpected RP ID hash',
    );
  });

  it('returns matching RP ID', () => {
    const rpIdHash = sha256(new TextEncoder().encode('example.com'));
    expect(matchExpectedRPID(rpIdHash, ['example.com'])).toBe('example.com');
  });

  it('constant-time compare rejects different lengths', () => {
    // Pass a 16-byte rpIdHash to trigger the areEqual length-mismatch branch
    // (sha256 always produces 32 bytes, so the comparison short-circuits)
    const shortHash = new Uint8Array(16).fill(0xaa);
    expect(() => matchExpectedRPID(shortHash, ['example.com'])).toThrow(
      'Unexpected RP ID hash',
    );
  });

  it('matches second candidate in array', () => {
    const rpIdHash = sha256(new TextEncoder().encode('example.com'));
    expect(matchExpectedRPID(rpIdHash, ['wrong.com', 'example.com'])).toBe(
      'example.com',
    );
  });
});

describe('verifyRegistrationResponse missing public key fields', () => {
  it('rejects public key missing alg field', async () => {
    // Build COSE key without alg
    const coseMapNoAlg = new Map<number, number | Uint8Array>();
    coseMapNoAlg.set(COSEKEYS.Kty, COSEKTY.EC2);
    coseMapNoAlg.set(COSEKEYS.Crv, COSECRV.P256);
    coseMapNoAlg.set(COSEKEYS.X, new Uint8Array(32).fill(0x01));
    coseMapNoAlg.set(COSEKEYS.Y, new Uint8Array(32).fill(0x02));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const coseNoAlgCBOR = encodeCBOR(coseMapNoAlg as any);

    const credentialID = new Uint8Array(16).fill(0x40);
    const aaguid = new Uint8Array(16).fill(0);
    const rpIdHash = sha256(new TextEncoder().encode(TEST_RP_ID));

    const authData = buildAuthenticatorData({
      rpIdHash,
      flags: 0x41,
      counter: 0,
      aaguid,
      credentialID,
      credentialPublicKey: coseNoAlgCBOR,
    });

    const credentialIdB64 = bytesToBase64URL(credentialID);
    const response = buildRegistrationResponse(authData, credentialIdB64);

    await expect(
      verifyRegistrationResponse({
        response,
        expectedChallenge: TEST_CHALLENGE,
        expectedOrigin: TEST_ORIGIN,
        expectedRPID: TEST_RP_ID,
      }),
    ).rejects.toThrow('Credential public key was missing numeric alg');
  });
});

/* eslint-disable n/no-unsupported-features/node-builtins */
describe('verifySignature RSA hash variants', () => {
  /* eslint-disable @typescript-eslint/no-require-imports, n/global-require */
  const {
    verifySignature: verifySignatureHelper,
  } = require('./verifySignature');
  /* eslint-enable @typescript-eslint/no-require-imports, n/global-require */

  async function generateRSAKeyPairAndSign(
    hashName: string,
    alg: number,
  ): Promise<{
    coseMap: Map<number, number | Uint8Array>;
    signature: Uint8Array;
    data: Uint8Array;
  }> {
    const keyPair = await globalThis.crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: { name: hashName },
      },
      true,
      ['sign', 'verify'],
    );

    const data = new Uint8Array(32).fill(0xff);
    const signature = new Uint8Array(
      await globalThis.crypto.subtle.sign(
        'RSASSA-PKCS1-v1_5',
        keyPair.privateKey,
        data,
      ),
    );

    const jwk = await globalThis.crypto.subtle.exportKey(
      'jwk',
      keyPair.publicKey,
    );
    const nBytes = Uint8Array.from(
      atob(
        (jwk.n as string).replace(/-/gu, '+').replace(/_/gu, '/') +
          '='.repeat((4 - ((jwk.n as string).length % 4)) % 4),
      ),
      (ch) => ch.charCodeAt(0),
    );
    const eBytes = Uint8Array.from(
      atob(
        (jwk.e as string).replace(/-/gu, '+').replace(/_/gu, '/') +
          '='.repeat((4 - ((jwk.e as string).length % 4)) % 4),
      ),
      (ch) => ch.charCodeAt(0),
    );

    const coseMap = new Map<number, number | Uint8Array>();
    coseMap.set(COSEKEYS.Kty, COSEKTY.RSA);
    coseMap.set(COSEKEYS.Alg, alg);
    coseMap.set(-1, nBytes);
    coseMap.set(-2, eBytes);

    return { coseMap, signature, data };
  }

  it('verifies RS384 signature', async () => {
    const { coseMap, signature, data } = await generateRSAKeyPairAndSign(
      'SHA-384',
      COSEALG.RS384,
    );
    const result = await verifySignatureHelper({
      cosePublicKey: coseMap,
      signature,
      data,
    });
    expect(result).toBe(true);
  });

  it('verifies RS512 signature', async () => {
    const { coseMap, signature, data } = await generateRSAKeyPairAndSign(
      'SHA-512',
      COSEALG.RS512,
    );
    const result = await verifySignatureHelper({
      cosePublicKey: coseMap,
      signature,
      data,
    });
    expect(result).toBe(true);
  });
});
/* eslint-enable n/no-unsupported-features/node-builtins */
