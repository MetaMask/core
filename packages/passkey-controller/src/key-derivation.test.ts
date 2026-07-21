import { PasskeyControllerErrorMessage } from './constants';
import { deriveKeyFromAuthenticationResponse } from './key-derivation';
import { PasskeyRecord } from './types';
import { deriveEncryptionKey } from './utils/crypto';
import { base64URLToBytes } from './utils/encoding';
import type { PasskeyAuthenticationResponse } from './webauthn/types';

function b64url(str: string): string {
  return btoa(str)
    .replace(/\+/gu, '-')
    .replace(/\//gu, '_')
    .replace(/[=]+$/u, '');
}

const CREDENTIAL_ID = b64url('credential-id-bytes');
const USER_HANDLE = b64url('user-handle-bytes');
const PRF_SALT = b64url('prf-salt-bytes');
const PRF_FIRST = b64url('prf-output-bytes');

function makeAuthenticationResponse(
  extensionResults: Record<string, unknown>,
  userHandle?: string,
): PasskeyAuthenticationResponse {
  return {
    id: CREDENTIAL_ID,
    rawId: CREDENTIAL_ID,
    type: 'public-key',
    response: {
      clientDataJSON: '',
      authenticatorData: '',
      signature: '',
      userHandle,
    },
    clientExtensionResults: extensionResults,
  };
}

function makeRecord(
  derivationMethod: 'prf' | 'userHandle',
): Pick<PasskeyRecord, 'credential' | 'keyDerivation'> {
  return {
    credential: {
      id: CREDENTIAL_ID,
      publicKey: 'pubkey',
      counter: 0,
      aaguid: '00000000-0000-0000-0000-000000000000',
    },
    keyDerivation:
      derivationMethod === 'prf'
        ? { method: 'prf', prfSalt: PRF_SALT }
        : { method: 'userHandle' },
  };
}

describe('deriveKeyFromAuthenticationResponse', () => {
  it('uses PRF output when keyDerivation.method is prf', () => {
    const response = makeAuthenticationResponse(
      { prf: { results: { first: PRF_FIRST } } },
      USER_HANDLE,
    );

    const encKey = deriveKeyFromAuthenticationResponse(
      response,
      makeRecord('prf'),
    );

    expect(encKey).toBeInstanceOf(Uint8Array);
    expect(encKey).toHaveLength(32);
  });

  it('uses userHandle when keyDerivation.method is userHandle', () => {
    const response = makeAuthenticationResponse({}, USER_HANDLE);

    const encKey = deriveKeyFromAuthenticationResponse(
      response,
      makeRecord('userHandle'),
    );

    expect(encKey).toBeInstanceOf(Uint8Array);
    expect(encKey).toHaveLength(32);
  });

  it('throws when userHandle derivation is needed but userHandle is missing', () => {
    const response = makeAuthenticationResponse({});

    expect(() =>
      deriveKeyFromAuthenticationResponse(response, makeRecord('userHandle')),
    ).toThrow(PasskeyControllerErrorMessage.MissingKeyMaterial);
  });

  it('throws when PRF derivation is needed but PRF output is missing', () => {
    const response = makeAuthenticationResponse({});

    expect(() =>
      deriveKeyFromAuthenticationResponse(response, makeRecord('prf')),
    ).toThrow(PasskeyControllerErrorMessage.MissingKeyMaterial);
  });

  it('throws when PRF derivation is needed but prf.results.first is empty', () => {
    const response = makeAuthenticationResponse({
      prf: { results: { first: '' } },
    });

    expect(() =>
      deriveKeyFromAuthenticationResponse(response, makeRecord('prf')),
    ).toThrow(PasskeyControllerErrorMessage.MissingKeyMaterial);
  });

  it('userHandle wrapping key matches HKDF of assertion userHandle and credential id', () => {
    const response = makeAuthenticationResponse({}, USER_HANDLE);
    const expected = deriveEncryptionKey(
      base64URLToBytes(USER_HANDLE),
      base64URLToBytes(CREDENTIAL_ID),
    );
    const encKey = deriveKeyFromAuthenticationResponse(
      response,
      makeRecord('userHandle'),
    );
    expect(encKey).toStrictEqual(expected);
  });

  it('prf wrapping key matches HKDF of PRF output and credential id', () => {
    const response = makeAuthenticationResponse({
      prf: { results: { first: PRF_FIRST } },
    });
    const expected = deriveEncryptionKey(
      base64URLToBytes(PRF_FIRST),
      base64URLToBytes(CREDENTIAL_ID),
    );
    const encKey = deriveKeyFromAuthenticationResponse(
      response,
      makeRecord('prf'),
    );
    expect(encKey).toStrictEqual(expected);
  });

  it('produces different keys for PRF vs userHandle', () => {
    const prfResponse = makeAuthenticationResponse({
      prf: { results: { first: PRF_FIRST } },
    });
    const uhResponse = makeAuthenticationResponse({}, USER_HANDLE);

    const prfKey = deriveKeyFromAuthenticationResponse(
      prfResponse,
      makeRecord('prf'),
    );
    const uhKey = deriveKeyFromAuthenticationResponse(
      uhResponse,
      makeRecord('userHandle'),
    );

    expect(prfKey).not.toStrictEqual(uhKey);
  });
});
