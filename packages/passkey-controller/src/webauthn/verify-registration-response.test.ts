import { encodeCBOR } from '@levischuck/tiny-cbor';
import { p256 } from '@noble/curves/p256';
import { sha256 } from '@noble/hashes/sha2';

import { base64URLToBytes } from '../utils/encoding';
import { bytesToBase64URL } from '../utils/encoding';
import { COSEALG, COSECRV, COSEKEYS, COSEKTY } from './constants';
import { decodeClientDataJSON } from './decode-client-data-json';
import * as parseAuthenticatorDataModule from './parse-authenticator-data';
import type { PasskeyRegistrationResponse } from './types';
import { verifyRegistrationResponse } from './verify-registration-response';

const EXPECTED_ORIGIN = 'https://dev.dontneeda.pw';
const EXPECTED_RP_ID = 'dev.dontneeda.pw';

const attestationNone: PasskeyRegistrationResponse = {
  id: 'AdKXJEch1aV5Wo7bj7qLHskVY4OoNaj9qu8TPdJ7kSAgUeRxWNngXlcNIGt4gexZGKVGcqZpqqWordXb_he1izY',
  rawId:
    'AdKXJEch1aV5Wo7bj7qLHskVY4OoNaj9qu8TPdJ7kSAgUeRxWNngXlcNIGt4gexZGKVGcqZpqqWordXb_he1izY',
  response: {
    attestationObject:
      'o2NmbXRkbm9uZWdhdHRTdG10oGhhdXRoRGF0YVjFPdxHEOnAiLIp26idVjIguzn3I' +
      'pr_RlsKZWsa-5qK-KBFAAAAAAAAAAAAAAAAAAAAAAAAAAAAQQHSlyRHIdWleVqO24-6ix7JFWODqDWo_arvEz3Se' +
      '5EgIFHkcVjZ4F5XDSBreIHsWRilRnKmaaqlqK3V2_4XtYs2pQECAyYgASFYID5PQTZQQg6haZFQWFzqfAOyQ_ENs' +
      'MH8xxQ4GRiNPsqrIlggU8IVUOV8qpgk_Jh-OTaLuZL52KdX1fTht07X4DiQPow',
    clientDataJSON:
      'eyJ0eXBlIjoid2ViYXV0aG4uY3JlYXRlIiwiY2hhbGxlbmdlIjoiYUVWalkxQlhkWHBw' +
      'VURBd1NEQndOV2Q0YURKZmRUVmZVRU0wVG1WWloyUSIsIm9yaWdpbiI6Imh0dHBzOlwvXC9kZXYuZG9udG5lZWRh' +
      'LnB3IiwiYW5kcm9pZFBhY2thZ2VOYW1lIjoib3JnLm1vemlsbGEuZmlyZWZveCJ9',
    transports: [],
  },
  type: 'public-key',
  clientExtensionResults: {},
};

const attestationFIDOU2F: PasskeyRegistrationResponse = {
  id: 'VHzbxaYaJu2P8m1Y2iHn2gRNHrgK0iYbn9E978L3Qi7Q-chFeicIHwYCRophz5lth2nCgEVKcgWirxlgidgbUQ',
  rawId:
    'VHzbxaYaJu2P8m1Y2iHn2gRNHrgK0iYbn9E978L3Qi7Q-chFeicIHwYCRophz5lth2nCgEVKcgWirxlgidgbUQ',
  response: {
    attestationObject:
      'o2NmbXRoZmlkby11MmZnYXR0U3RtdKJjc2lnWEcwRQIgRYUftNUmhT0VWTZmIgDmrOoP26Pcre-kL3DLnCrXbegCIQCOu_x5gqp-Rej76zeBuXlk8e7J-9WM_i-wZmCIbIgCGmN4NWOBWQLBMIICvTCCAaWgAwIBAgIEKudiYzANBgkqhkiG9w0BAQsFADAuMSwwKgYDVQQDEyNZdWJpY28gVTJGIFJvb3QgQ0EgU2VyaWFsIDQ1NzIwMDYzMTAgFw0xNDA4MDEwMDAwMDBaGA8yMDUwMDkwNDAwMDAwMFowbjELMAkGA1UEBhMCU0UxEjAQBgNVBAoMCVl1YmljbyBBQjEiMCAGA1UECwwZQXV0aGVudGljYXRvciBBdHRlc3RhdGlvbjEnMCUGA1UEAwweWXViaWNvIFUyRiBFRSBTZXJpYWwgNzE5ODA3MDc1MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEKgOGXmBD2Z4R_xCqJVRXhL8Jr45rHjsyFykhb1USGozZENOZ3cdovf5Ke8fj2rxi5tJGn_VnW4_6iQzKdIaeP6NsMGowIgYJKwYBBAGCxAoCBBUxLjMuNi4xLjQuMS40MTQ4Mi4xLjEwEwYLKwYBBAGC5RwCAQEEBAMCBDAwIQYLKwYBBAGC5RwBAQQEEgQQbUS6m_bsLkm5MAyP6SDLczAMBgNVHRMBAf8EAjAAMA0GCSqGSIb3DQEBCwUAA4IBAQByV9A83MPhFWmEkNb4DvlbUwcjc9nmRzJjKxHc3HeK7GvVkm0H4XucVDB4jeMvTke0WHb_jFUiApvpOHh5VyMx5ydwFoKKcRs5x0_WwSWL0eTZ5WbVcHkDR9pSNcA_D_5AsUKOBcbpF5nkdVRxaQHuuIuwV4k1iK2IqtMNcU8vL6w21U261xCcWwJ6sMq4zzVO8QCKCQhsoIaWrwz828GDmPzfAjFsJiLJXuYivdHACkeJ5KHMt0mjVLpfJ2BCML7_rgbmvwL7wBW80VHfNdcKmKjkLcpEiPzwcQQhiN_qHV90t-p4iyr5xRSpurlP5zic2hlRkLKxMH2_kRjhqSn4aGF1dGhEYXRhWMQ93EcQ6cCIsinbqJ1WMiC7Ofcimv9GWwplaxr7mor4oEEAAAAAAAAAAAAAAAAAAAAAAAAAAABAVHzbxaYaJu2P8m1Y2iHn2gRNHrgK0iYbn9E978L3Qi7Q-chFeicIHwYCRophz5lth2nCgEVKcgWirxlgidgbUaUBAgMmIAEhWCDIkcsOaVKDIQYwq3EDQ-pST2kRwNH_l1nCgW-WcFpNXiJYIBSbummp-KO3qZeqmvZ_U_uirCDL2RNj3E5y4_KzefIr',
    clientDataJSON:
      'eyJjaGFsbGVuZ2UiOiJkRzkwWVd4c2VWVnVhWEYxWlZaaGJIVmxSWFpsY25sQmRIUmxjM1JoZEdsdmJnIiwiY2xpZW50RXh0ZW5zaW9ucyI6e30sImhhc2hBbGdvcml0aG0iOiJTSEEtMjU2Iiwib3JpZ2luIjoiaHR0cHM6Ly9kZXYuZG9udG5lZWRhLnB3IiwidHlwZSI6IndlYmF1dGhuLmNyZWF0ZSJ9',
    transports: [],
  },
  type: 'public-key',
  clientExtensionResults: {},
};

const attestationPacked: PasskeyRegistrationResponse = {
  id: 'AYThY1csINY4JrbHyGmqTl1nL_F1zjAF3hSAIngz8kAcjugmAMNVvxZRwqpEH-bNHHAIv291OX5ko9eDf_5mu3UB2BvsScr2K-ppM4owOpGsqwg5tZglqqmxIm1Q',
  rawId:
    'AYThY1csINY4JrbHyGmqTl1nL_F1zjAF3hSAIngz8kAcjugmAMNVvxZRwqpEH-bNHHAIv291OX5ko9eDf_5mu3UB2BvsScr2K-ppM4owOpGsqwg5tZglqqmxIm1Q',
  response: {
    attestationObject:
      'o2NmbXRmcGFja2VkZ2F0dFN0bXSiY2FsZyZjc2lnWEcwRQIhANvrPZMUFrl_rvlgR' +
      'qz6lCPlF6B4y885FYUCCrhrzAYXAiAb4dQKXbP3IimsTTadkwXQlrRVdxzlbmPXt847-Oh6r2hhdXRoRGF0YVjhP' +
      'dxHEOnAiLIp26idVjIguzn3Ipr_RlsKZWsa-5qK-KBFXsOO-a3OAAI1vMYKZIsLJfHwVQMAXQGE4WNXLCDWOCa2x' +
      '8hpqk5dZy_xdc4wBd4UgCJ4M_JAHI7oJgDDVb8WUcKqRB_mzRxwCL9vdTl-ZKPXg3_-Zrt1Adgb7EnK9ivqaTOKM' +
      'DqRrKsIObWYJaqpsSJtUKUBAgMmIAEhWCBKMVVaivqCBpqqAxMjuCo5jMeUdh3jDOC0EF4fLBNNTyJYILc7rqDDe' +
      'X1pwCLrl3ZX7IThrtZNwKQVLQyfHiorqP-n',
    clientDataJSON:
      'eyJjaGFsbGVuZ2UiOiJjelpRU1dKQ2JsQlFibkpIVGxOQ2VFNWtkRVJ5VkRkVmNsWlpT' +
      'a3M1U0UwIiwib3JpZ2luIjoiaHR0cHM6Ly9kZXYuZG9udG5lZWRhLnB3IiwidHlwZSI6IndlYmF1dGhuLmNyZWF0' +
      'ZSJ9',
    transports: [],
  },
  clientExtensionResults: {},
  type: 'public-key',
};

const attestationPackedX5C: PasskeyRegistrationResponse = {
  id: '4rrvMciHCkdLQ2HghazIp1sMc8TmV8W8RgoX-x8tqV_1AmlqWACqUK8mBGLandr-htduQKPzgb2yWxOFV56Tlg',
  rawId:
    '4rrvMciHCkdLQ2HghazIp1sMc8TmV8W8RgoX-x8tqV_1AmlqWACqUK8mBGLandr-htduQKPzgb2yWxOFV56Tlg',
  response: {
    attestationObject:
      'o2NmbXRmcGFja2VkZ2F0dFN0bXSjY2FsZyZjc2lnWEcwRQIhAIMt_hGMtdgpIVIwMOeKK' +
      'w0IkUUFkXSY8arKh3Q0c5QQAiB9Sv9JavAEmppeH_XkZjB7TFM3jfxsgl97iIkvuJOUImN4NWOBWQLBMIICvTCCAaWgA' +
      'wIBAgIEKudiYzANBgkqhkiG9w0BAQsFADAuMSwwKgYDVQQDEyNZdWJpY28gVTJGIFJvb3QgQ0EgU2VyaWFsIDQ1NzIwM' +
      'DYzMTAgFw0xNDA4MDEwMDAwMDBaGA8yMDUwMDkwNDAwMDAwMFowbjELMAkGA1UEBhMCU0UxEjAQBgNVBAoMCVl1Ymljb' +
      'yBBQjEiMCAGA1UECwwZQXV0aGVudGljYXRvciBBdHRlc3RhdGlvbjEnMCUGA1UEAwweWXViaWNvIFUyRiBFRSBTZXJpY' +
      'WwgNzE5ODA3MDc1MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEKgOGXmBD2Z4R_xCqJVRXhL8Jr45rHjsyFykhb1USG' +
      'ozZENOZ3cdovf5Ke8fj2rxi5tJGn_VnW4_6iQzKdIaeP6NsMGowIgYJKwYBBAGCxAoCBBUxLjMuNi4xLjQuMS40MTQ4M' +
      'i4xLjEwEwYLKwYBBAGC5RwCAQEEBAMCBDAwIQYLKwYBBAGC5RwBAQQEEgQQbUS6m_bsLkm5MAyP6SDLczAMBgNVHRMBA' +
      'f8EAjAAMA0GCSqGSIb3DQEBCwUAA4IBAQByV9A83MPhFWmEkNb4DvlbUwcjc9nmRzJjKxHc3HeK7GvVkm0H4XucVDB4j' +
      'eMvTke0WHb_jFUiApvpOHh5VyMx5ydwFoKKcRs5x0_WwSWL0eTZ5WbVcHkDR9pSNcA_D_5AsUKOBcbpF5nkdVRxaQHuu' +
      'IuwV4k1iK2IqtMNcU8vL6w21U261xCcWwJ6sMq4zzVO8QCKCQhsoIaWrwz828GDmPzfAjFsJiLJXuYivdHACkeJ5KHMt' +
      '0mjVLpfJ2BCML7_rgbmvwL7wBW80VHfNdcKmKjkLcpEiPzwcQQhiN_qHV90t-p4iyr5xRSpurlP5zic2hlRkLKxMH2_k' +
      'RjhqSn4aGF1dGhEYXRhWMQ93EcQ6cCIsinbqJ1WMiC7Ofcimv9GWwplaxr7mor4oEEAAAAcbUS6m_bsLkm5MAyP6SDLc' +
      'wBA4rrvMciHCkdLQ2HghazIp1sMc8TmV8W8RgoX-x8tqV_1AmlqWACqUK8mBGLandr-htduQKPzgb2yWxOFV56TlqUBA' +
      'gMmIAEhWCBsJbGAjckW-AA_XMk8OnB-VUvrs35ZpjtVJXRhnvXiGiJYIL2ncyg_KesCi44GH8UcZXYwjBkVdGMjNd6LF' +
      'myiD6xf',
    clientDataJSON:
      'eyJ0eXBlIjoid2ViYXV0aG4uY3JlYXRlIiwiY2hhbGxlbmdlIjoiZEc5MFlXeHNlVlZ1YVhG' +
      'MVpWWmhiSFZsUlhabGNubFVhVzFsIiwib3JpZ2luIjoiaHR0cHM6Ly9kZXYuZG9udG5lZWRhLnB3In0=',
    transports: [],
  },
  type: 'public-key',
  clientExtensionResults: {},
};

const noneChallenge = decodeClientDataJSON(
  attestationNone.response.clientDataJSON,
).challenge;

const fidoU2fChallenge = decodeClientDataJSON(
  attestationFIDOU2F.response.clientDataJSON,
).challenge;

const packedChallenge = decodeClientDataJSON(
  attestationPacked.response.clientDataJSON,
).challenge;

const packedX5cChallenge = decodeClientDataJSON(
  attestationPackedX5C.response.clientDataJSON,
).challenge;

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

function buildCosePublicKeyMap(
  pubKeyBytes: Uint8Array,
): Map<number, number | Uint8Array> {
  const map = new Map<number, number | Uint8Array>();
  map.set(COSEKEYS.Kty, COSEKTY.EC2);
  map.set(COSEKEYS.Alg, COSEALG.ES256);
  map.set(COSEKEYS.Crv, COSECRV.P256);
  map.set(COSEKEYS.X, pubKeyBytes.slice(1, 33));
  map.set(COSEKEYS.Y, pubKeyBytes.slice(33, 65));
  return map;
}

function generateES256KeyPair(): {
  privateKey: Uint8Array;
  cosePublicKeyCBOR: Uint8Array;
} {
  const privateKey = p256.utils.randomPrivateKey();
  const publicKeyRaw = p256.getPublicKey(privateKey, false);
  const coseMap = buildCosePublicKeyMap(publicKeyRaw);
  const cosePublicKeyCBOR = encodeCBOR(coseMap);
  return { privateKey, cosePublicKeyCBOR };
}

function buildAuthenticatorData(opts: {
  rpIdHash: Uint8Array;
  flags: number;
  counter: number;
  aaguid?: Uint8Array;
  credentialID?: Uint8Array;
  credentialPublicKey?: Uint8Array;
}): Uint8Array {
  const parts: Uint8Array[] = [];
  parts.push(opts.rpIdHash);
  parts.push(new Uint8Array([opts.flags]));

  const counterBuf = new Uint8Array(4);
  new DataView(counterBuf.buffer).setUint32(0, opts.counter, false);
  parts.push(counterBuf);

  if (opts.aaguid && opts.credentialID && opts.credentialPublicKey) {
    parts.push(opts.aaguid);

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

describe('verifyRegistrationResponse', () => {
  it('verifies none attestation when expectedRPIDs is empty', async () => {
    const verification = await verifyRegistrationResponse({
      response: attestationNone,
      expectedChallenge: noneChallenge,
      expectedOrigin: EXPECTED_ORIGIN,
      expectedRPIDs: [],
    });

    expect(verification.verified).toBe(true);
  });

  it('verifies none attestation', async () => {
    const verification = await verifyRegistrationResponse({
      response: attestationNone,
      expectedChallenge: noneChallenge,
      expectedOrigin: EXPECTED_ORIGIN,
      expectedRPIDs: [EXPECTED_RP_ID],
    });

    expect(verification.verified).toBe(true);
    if (!verification.verified) {
      return;
    }

    const { registrationInfo } = verification;
    expect(registrationInfo.attestationFormat).toBe('none');
    expect(registrationInfo.counter).toBe(0);
    expect(registrationInfo.publicKey).toStrictEqual(
      base64URLToBytes(
        'pQECAyYgASFYID5PQTZQQg6haZFQWFzqfAOyQ_ENsMH8xxQ4GRiNPsqrIlggU8IVUOV8qpgk_Jh-OTaLuZL52KdX1fTht07X4DiQPow',
      ),
    );
    expect(registrationInfo.credentialId).toBe(
      'AdKXJEch1aV5Wo7bj7qLHskVY4OoNaj9qu8TPdJ7kSAgUeRxWNngXlcNIGt4gexZGKVGcqZpqqWordXb_he1izY',
    );
    expect(registrationInfo.aaguid).toBe(
      '00000000-0000-0000-0000-000000000000',
    );
    // authData flags byte is 0x45 (UP | UV | AT); UV is set in this vector.
    expect(registrationInfo.userVerified).toBe(true);
  });

  it('verifies packed self-attestation (SimpleWebAuthn conformance vector)', async () => {
    const verification = await verifyRegistrationResponse({
      response: attestationPacked,
      expectedChallenge: packedChallenge,
      expectedOrigin: EXPECTED_ORIGIN,
      expectedRPIDs: [EXPECTED_RP_ID],
    });

    expect(verification.verified).toBe(true);
    if (!verification.verified) {
      return;
    }

    expect(verification.registrationInfo.attestationFormat).toBe('packed');
    expect(verification.registrationInfo.counter).toBe(1589874425);
    expect(verification.registrationInfo.publicKey).toStrictEqual(
      base64URLToBytes(
        'pQECAyYgASFYIEoxVVqK-oIGmqoDEyO4KjmMx5R2HeMM4LQQXh8sE01PIlggtzuuoMN5fWnAIuuXdlfshOGu1k3ApBUtDJ8eKiuo_6c',
      ),
    );
    expect(verification.registrationInfo.credentialId).toBe(
      'AYThY1csINY4JrbHyGmqTl1nL_F1zjAF3hSAIngz8kAcjugmAMNVvxZRwqpEH-bNHHAIv291OX5ko9eDf_5mu3UB2BvsScr2K-ppM4owOpGsqwg5tZglqqmxIm1Q',
    );
  });

  it('rejects when response challenge is not expected value', async () => {
    await expect(
      verifyRegistrationResponse({
        response: attestationNone,
        expectedChallenge: 'shouldhavebeenthisvalue',
        expectedOrigin: EXPECTED_ORIGIN,
        expectedRPIDs: [EXPECTED_RP_ID],
      }),
    ).rejects.toThrow('Unexpected registration response challenge');
  });

  it('rejects when response origin is not expected value', async () => {
    await expect(
      verifyRegistrationResponse({
        response: attestationNone,
        expectedChallenge: noneChallenge,
        expectedOrigin: 'https://different.address',
        expectedRPIDs: [EXPECTED_RP_ID],
      }),
    ).rejects.toThrow('Unexpected registration response origin');
  });

  it('rejects when RP ID is not expected value', async () => {
    await expect(
      verifyRegistrationResponse({
        response: attestationNone,
        expectedChallenge: noneChallenge,
        expectedOrigin: EXPECTED_ORIGIN,
        expectedRPIDs: ['wrong-rp.com'],
      }),
    ).rejects.toThrow('Unexpected RP ID hash');
  });

  it('rejects wrong clientDataJSON type', async () => {
    const badTypeClientDataJSON = btoa(
      JSON.stringify({
        ...decodeClientDataJSON(attestationNone.response.clientDataJSON),
        type: 'webauthn.get',
      }),
    )
      .replace(/\+/gu, '-')
      .replace(/\//gu, '_')
      .replace(/[=]+$/u, '');

    await expect(
      verifyRegistrationResponse({
        response: {
          ...attestationNone,
          response: {
            ...attestationNone.response,
            clientDataJSON: badTypeClientDataJSON,
          },
        },
        expectedChallenge: noneChallenge,
        expectedOrigin: EXPECTED_ORIGIN,
        expectedRPIDs: [EXPECTED_RP_ID],
      }),
    ).rejects.toThrow('Unexpected registration response type');
  });

  it('rejects missing credential ID', async () => {
    await expect(
      verifyRegistrationResponse({
        response: {
          ...attestationNone,
          id: '',
          rawId: '',
        },
        expectedChallenge: noneChallenge,
        expectedOrigin: EXPECTED_ORIGIN,
        expectedRPIDs: [EXPECTED_RP_ID],
      }),
    ).rejects.toThrow('Missing credential ID');
  });

  it('rejects fido-u2f attestation as unsupported format', async () => {
    await expect(
      verifyRegistrationResponse({
        response: attestationFIDOU2F,
        expectedChallenge: fidoU2fChallenge,
        expectedOrigin: EXPECTED_ORIGIN,
        expectedRPIDs: [EXPECTED_RP_ID],
        requireUserVerification: false,
      }),
    ).rejects.toThrow('Unsupported attestation format: fido-u2f');
  });

  it('rejects packed attestation with x5c certificate chain', async () => {
    await expect(
      verifyRegistrationResponse({
        response: attestationPackedX5C,
        expectedChallenge: packedX5cChallenge,
        expectedOrigin: EXPECTED_ORIGIN,
        expectedRPIDs: [EXPECTED_RP_ID],
        requireUserVerification: false,
      }),
    ).rejects.toThrow(
      'Packed attestation with certificate chain (x5c) is not supported',
    );
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
        expectedRPIDs: [TEST_RP_ID],
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
        expectedRPIDs: [TEST_RP_ID],
      }),
    ).rejects.toThrow('Unexpected credential type');
  });

  it('rejects user verification not met when required', async () => {
    const { cosePublicKeyCBOR } = generateES256KeyPair();
    const credentialID = new Uint8Array(16).fill(0x30);
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
        expectedRPIDs: [TEST_RP_ID],
        requireUserVerification: true,
      }),
    ).rejects.toThrow('User verification was required');
  });

  it('rejects user not present', async () => {
    const { cosePublicKeyCBOR } = generateES256KeyPair();
    const credentialID = new Uint8Array(16).fill(0x31);
    const aaguid = new Uint8Array(16).fill(0);
    const rpIdHash = sha256(new TextEncoder().encode(TEST_RP_ID));

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
        expectedRPIDs: [TEST_RP_ID],
      }),
    ).rejects.toThrow('User presence was required');
  });

  it('rejects credential id not matching authenticator data', async () => {
    const { cosePublicKeyCBOR } = generateES256KeyPair();
    const credentialID = new Uint8Array(16).fill(0x30);
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

    const wrongWrapperId = bytesToBase64URL(new Uint8Array(16).fill(0x42));
    const response = buildRegistrationResponse(authData, wrongWrapperId);

    await expect(
      verifyRegistrationResponse({
        response,
        expectedChallenge: TEST_CHALLENGE,
        expectedOrigin: TEST_ORIGIN,
        expectedRPIDs: [TEST_RP_ID],
      }),
    ).rejects.toThrow(
      'Credential id does not match the credential id in authenticator data',
    );
  });

  it('rejects unsupported public key algorithm', async () => {
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
        expectedRPIDs: [TEST_RP_ID],
      }),
    ).rejects.toThrow('Unexpected public key alg');
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
        expectedRPIDs: [TEST_RP_ID],
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
    attStmt.set('alg', COSEALG.RS256);
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
        expectedRPIDs: [TEST_RP_ID],
      }),
    ).rejects.toThrow('does not match credential alg');
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
        expectedRPIDs: [TEST_RP_ID],
      }),
    ).rejects.toThrow('Packed attestation missing signature');
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
        expectedRPIDs: [TEST_RP_ID],
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
      expectedRPIDs: [TEST_RP_ID],
    });

    expect(result.verified).toBe(true);
  });

  it('rejects tokenBinding that is not an object', async () => {
    const clientDataJSON = bytesToBase64URL(
      new TextEncoder().encode(
        JSON.stringify({
          ...decodeClientDataJSON(attestationNone.response.clientDataJSON),
          tokenBinding: 'invalid',
        }),
      ),
    );

    await expect(
      verifyRegistrationResponse({
        response: {
          ...attestationNone,
          response: {
            ...attestationNone.response,
            clientDataJSON,
          },
        },
        expectedChallenge: noneChallenge,
        expectedOrigin: EXPECTED_ORIGIN,
        expectedRPIDs: [EXPECTED_RP_ID],
      }),
    ).rejects.toThrow('ClientDataJSON tokenBinding was not an object');
  });

  it('rejects tokenBinding with invalid status', async () => {
    const clientDataJSON = bytesToBase64URL(
      new TextEncoder().encode(
        JSON.stringify({
          ...decodeClientDataJSON(attestationNone.response.clientDataJSON),
          tokenBinding: { status: 'invalid-status' },
        }),
      ),
    );

    await expect(
      verifyRegistrationResponse({
        response: {
          ...attestationNone,
          response: {
            ...attestationNone.response,
            clientDataJSON,
          },
        },
        expectedChallenge: noneChallenge,
        expectedOrigin: EXPECTED_ORIGIN,
        expectedRPIDs: [EXPECTED_RP_ID],
      }),
    ).rejects.toThrow('Unexpected tokenBinding.status value');
  });

  it('rejects missing attested credential data', async () => {
    const rpIdHash = sha256(new TextEncoder().encode(TEST_RP_ID));
    const authData = buildAuthenticatorData({
      rpIdHash,
      flags: 0x01,
      counter: 0,
    });

    const response = buildRegistrationResponse(authData, 'missing-attested');

    await expect(
      verifyRegistrationResponse({
        response,
        expectedChallenge: TEST_CHALLENGE,
        expectedOrigin: TEST_ORIGIN,
        expectedRPIDs: [TEST_RP_ID],
      }),
    ).rejects.toThrow('No credential ID was provided by authenticator');
  });

  it('returns verified false for packed attestation with invalid signature', async () => {
    const { cosePublicKeyCBOR } = generateES256KeyPair();
    const credentialID = new Uint8Array(16).fill(0x91);
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
    attStmt.set('sig', new Uint8Array(64).fill(0xff));

    const response = buildRegistrationResponse(
      authData,
      bytesToBase64URL(credentialID),
      'packed',
      attStmt,
    );

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: TEST_CHALLENGE,
      expectedOrigin: TEST_ORIGIN,
      expectedRPIDs: [TEST_RP_ID],
    });

    expect(verification).toStrictEqual({ verified: false });
  });

  const mockParsedAuthBase = {
    rpIdHash: sha256(new TextEncoder().encode(EXPECTED_RP_ID)),
    flags: {
      up: true,
      uv: false,
      be: false,
      bs: false,
      at: true,
      ed: false,
      flagsByte: 0x41,
    },
    counter: 0,
  } as const;

  it('throws when parsed authenticator data has no credential ID', async () => {
    const spy = jest
      .spyOn(parseAuthenticatorDataModule, 'parseAuthenticatorData')
      .mockReturnValueOnce({
        ...mockParsedAuthBase,
      });

    await expect(
      verifyRegistrationResponse({
        response: attestationNone,
        expectedChallenge: noneChallenge,
        expectedOrigin: EXPECTED_ORIGIN,
        expectedRPIDs: [EXPECTED_RP_ID],
      }),
    ).rejects.toThrow('No credential ID was provided by authenticator');

    spy.mockRestore();
  });

  it('throws when parsed authenticator data has no credential public key', async () => {
    const spy = jest
      .spyOn(parseAuthenticatorDataModule, 'parseAuthenticatorData')
      .mockReturnValueOnce({
        ...mockParsedAuthBase,
        credentialID: new Uint8Array([1]),
      });

    const credentialIdB64 = bytesToBase64URL(new Uint8Array([1]));
    await expect(
      verifyRegistrationResponse({
        response: {
          ...attestationNone,
          id: credentialIdB64,
          rawId: credentialIdB64,
        },
        expectedChallenge: noneChallenge,
        expectedOrigin: EXPECTED_ORIGIN,
        expectedRPIDs: [EXPECTED_RP_ID],
      }),
    ).rejects.toThrow('No public key was provided by authenticator');

    spy.mockRestore();
  });

  it('throws when parsed authenticator data has no AAGUID', async () => {
    const spy = jest
      .spyOn(parseAuthenticatorDataModule, 'parseAuthenticatorData')
      .mockReturnValueOnce({
        ...mockParsedAuthBase,
        credentialID: new Uint8Array([1]),
        credentialPublicKey: new Uint8Array([0xa1]),
      });

    const credentialIdB64 = bytesToBase64URL(new Uint8Array([1]));
    await expect(
      verifyRegistrationResponse({
        response: {
          ...attestationNone,
          id: credentialIdB64,
          rawId: credentialIdB64,
        },
        expectedChallenge: noneChallenge,
        expectedOrigin: EXPECTED_ORIGIN,
        expectedRPIDs: [EXPECTED_RP_ID],
      }),
    ).rejects.toThrow('No AAGUID was present during registration');

    spy.mockRestore();
  });
});

describe('verifyRegistrationResponse missing public key fields', () => {
  it('rejects public key missing alg field', async () => {
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
        expectedRPIDs: [TEST_RP_ID],
      }),
    ).rejects.toThrow('Credential public key was missing numeric alg');
  });
});
