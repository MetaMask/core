import {
  deriveKeyFromRegistrationResponse,
  deriveKeyFromAuthenticationResponse,
} from './key-derivation';
import type { PasskeyRecord, PasskeyRegistrationSession } from './types';
import type {
  PasskeyAuthenticationResponse,
  PasskeyRegistrationResponse,
} from './webauthn';

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

function makeSession(): PasskeyRegistrationSession {
  return {
    userHandle: USER_HANDLE,
    prfSalt: PRF_SALT,
    challenge: b64url('challenge'),
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
    credentialId: CREDENTIAL_ID,
    derivationMethod,
    iv: 'iv',
    encryptedVaultKey: 'ciphertext',
    publicKey: 'pubkey',
    counter: 0,
    prfSalt: derivationMethod === 'prf' ? PRF_SALT : undefined,
  };
}

describe('deriveKeyFromRegistrationResponse', () => {
  it('uses PRF output when prf.results.first is present', () => {
    const response = makeRegistrationResponse({
      prf: { results: { first: PRF_FIRST } },
    });

    const { encKey, derivationMethod } = deriveKeyFromRegistrationResponse(
      response,
      makeSession(),
    );

    expect(derivationMethod).toBe('prf');
    expect(encKey).toBeInstanceOf(Uint8Array);
    expect(encKey).toHaveLength(32);
  });

  it('uses PRF output when prf.enabled is true', () => {
    const response = makeRegistrationResponse({
      prf: { enabled: true, results: { first: PRF_FIRST } },
    });

    const { derivationMethod } = deriveKeyFromRegistrationResponse(
      response,
      makeSession(),
    );

    expect(derivationMethod).toBe('prf');
  });

  it('falls back to userHandle when PRF is absent', () => {
    const response = makeRegistrationResponse({});

    const { encKey, derivationMethod } = deriveKeyFromRegistrationResponse(
      response,
      makeSession(),
    );

    expect(derivationMethod).toBe('userHandle');
    expect(encKey).toBeInstanceOf(Uint8Array);
    expect(encKey).toHaveLength(32);
  });

  it('falls back to userHandle when prf.results.first is empty string', () => {
    const response = makeRegistrationResponse({
      prf: { results: { first: '' } },
    });

    const { derivationMethod } = deriveKeyFromRegistrationResponse(
      response,
      makeSession(),
    );

    expect(derivationMethod).toBe('userHandle');
  });

  it('produces different keys for different credential IDs', () => {
    const response1 = makeRegistrationResponse({});
    const response2 = makeRegistrationResponse({});
    response2.id = b64url('different-cred-id');

    const { encKey: key1 } = deriveKeyFromRegistrationResponse(
      response1,
      makeSession(),
    );
    const { encKey: key2 } = deriveKeyFromRegistrationResponse(
      response2,
      makeSession(),
    );

    expect(key1).not.toStrictEqual(key2);
  });

  it('produces different keys for PRF vs userHandle', () => {
    const session = makeSession();

    const responseWithPrf = makeRegistrationResponse({
      prf: { results: { first: PRF_FIRST } },
    });
    const responseWithoutPrf = makeRegistrationResponse({});

    const { encKey: prfKey } = deriveKeyFromRegistrationResponse(
      responseWithPrf,
      session,
    );
    const { encKey: uhKey } = deriveKeyFromRegistrationResponse(
      responseWithoutPrf,
      session,
    );

    expect(prfKey).not.toStrictEqual(uhKey);
  });
});

describe('deriveKeyFromAuthenticationResponse', () => {
  it('uses PRF output when derivationMethod is prf', () => {
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

  it('uses userHandle when derivationMethod is userHandle', () => {
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
    ).toThrow('Passkey assertion missing required key material');
  });

  it('produces consistent keys across registration and authentication', () => {
    const regResponse = makeRegistrationResponse({});
    const session = makeSession();

    const { encKey: regKey } = deriveKeyFromRegistrationResponse(
      regResponse,
      session,
    );

    const authResponse = makeAuthenticationResponse({}, USER_HANDLE);

    const authKey = deriveKeyFromAuthenticationResponse(
      authResponse,
      makeRecord('userHandle'),
    );

    expect(regKey).toStrictEqual(authKey);
  });
});
