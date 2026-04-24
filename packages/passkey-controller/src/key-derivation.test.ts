import { PasskeyControllerErrorMessage } from './constants';
import {
  deriveKeyFromAuthenticationResponse,
  deriveKeyFromRegistrationResponse,
} from './key-derivation';
import type { PasskeyRecord, PasskeyRegistrationCeremony } from './types';
import type {
  PasskeyAuthenticationResponse,
  PasskeyRegistrationResponse,
} from './webauthn/types';

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

function makeRegistrationCeremony(): PasskeyRegistrationCeremony {
  return {
    userHandle: USER_HANDLE,
    prfSalt: PRF_SALT,
    challenge: b64url('challenge'),
    createdAt: 0,
  };
}

function makeRegistrationResponse(
  extensionResults: Record<string, unknown>,
): PasskeyRegistrationResponse {
  return {
    id: CREDENTIAL_ID,
    rawId: CREDENTIAL_ID,
    type: 'public-key',
    response: {
      clientDataJSON: '',
      attestationObject: '',
    },
    clientExtensionResults: extensionResults,
  };
}

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

function makeRecord(derivationMethod: 'prf' | 'userHandle'): PasskeyRecord {
  return {
    credential: {
      id: CREDENTIAL_ID,
      publicKey: 'pubkey',
      counter: 0,
    },
    encryptedVaultKey: {
      ciphertext: 'ciphertext',
      iv: 'iv',
    },
    keyDerivation:
      derivationMethod === 'prf'
        ? { method: 'prf', prfSalt: PRF_SALT }
        : { method: 'userHandle' },
  };
}

describe('deriveKeyFromRegistrationResponse', () => {
  it('uses PRF output when prf.results.first is present', () => {
    const response = makeRegistrationResponse({
      prf: { results: { first: PRF_FIRST } },
    });

    const { encKey, keyDerivation } = deriveKeyFromRegistrationResponse(
      response,
      makeRegistrationCeremony(),
      CREDENTIAL_ID,
    );

    expect(keyDerivation).toStrictEqual({ method: 'prf', prfSalt: PRF_SALT });
    expect(encKey).toBeInstanceOf(Uint8Array);
    expect(encKey).toHaveLength(32);
  });

  it('uses PRF output when prf.enabled is true and results.first is present', () => {
    const response = makeRegistrationResponse({
      prf: { enabled: true, results: { first: PRF_FIRST } },
    });

    const { keyDerivation } = deriveKeyFromRegistrationResponse(
      response,
      makeRegistrationCeremony(),
      CREDENTIAL_ID,
    );

    expect(keyDerivation).toStrictEqual({ method: 'prf', prfSalt: PRF_SALT });
  });

  it('falls back to userHandle when prf.enabled is true but results.first is absent', () => {
    const response = makeRegistrationResponse({
      prf: { enabled: true },
    });

    const { keyDerivation } = deriveKeyFromRegistrationResponse(
      response,
      makeRegistrationCeremony(),
      CREDENTIAL_ID,
    );

    expect(keyDerivation).toStrictEqual({ method: 'userHandle' });
  });

  it('falls back to userHandle when PRF is absent', () => {
    const response = makeRegistrationResponse({});

    const { encKey, keyDerivation } = deriveKeyFromRegistrationResponse(
      response,
      makeRegistrationCeremony(),
      CREDENTIAL_ID,
    );

    expect(keyDerivation).toStrictEqual({ method: 'userHandle' });
    expect(encKey).toBeInstanceOf(Uint8Array);
    expect(encKey).toHaveLength(32);
  });

  it('falls back to userHandle when prf.results.first is empty string', () => {
    const response = makeRegistrationResponse({
      prf: { results: { first: '' } },
    });

    const { keyDerivation } = deriveKeyFromRegistrationResponse(
      response,
      makeRegistrationCeremony(),
      CREDENTIAL_ID,
    );

    expect(keyDerivation).toStrictEqual({ method: 'userHandle' });
  });

  it('produces different keys for different verified credential IDs', () => {
    const response = makeRegistrationResponse({});
    const ceremony = makeRegistrationCeremony();

    const { encKey: key1 } = deriveKeyFromRegistrationResponse(
      response,
      ceremony,
      CREDENTIAL_ID,
    );
    const { encKey: key2 } = deriveKeyFromRegistrationResponse(
      response,
      ceremony,
      b64url('different-cred-id'),
    );

    expect(key1).not.toStrictEqual(key2);
  });

  it('produces different keys for PRF vs userHandle', () => {
    const registrationCeremony = makeRegistrationCeremony();

    const responseWithPrf = makeRegistrationResponse({
      prf: { results: { first: PRF_FIRST } },
    });
    const responseWithoutPrf = makeRegistrationResponse({});

    const { encKey: prfKey } = deriveKeyFromRegistrationResponse(
      responseWithPrf,
      registrationCeremony,
      CREDENTIAL_ID,
    );
    const { encKey: uhKey } = deriveKeyFromRegistrationResponse(
      responseWithoutPrf,
      registrationCeremony,
      CREDENTIAL_ID,
    );

    expect(prfKey).not.toStrictEqual(uhKey);
  });
});

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

  it('produces consistent keys across registration and authentication', () => {
    const regResponse = makeRegistrationResponse({});
    const registrationCeremony = makeRegistrationCeremony();

    const { encKey: regKey } = deriveKeyFromRegistrationResponse(
      regResponse,
      registrationCeremony,
      CREDENTIAL_ID,
    );

    const authResponse = makeAuthenticationResponse({}, USER_HANDLE);

    const authKey = deriveKeyFromAuthenticationResponse(
      authResponse,
      makeRecord('userHandle'),
    );

    expect(regKey).toStrictEqual(authKey);
  });
});
