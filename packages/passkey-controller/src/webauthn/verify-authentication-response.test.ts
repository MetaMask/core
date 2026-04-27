import { bytesToBase64URL, base64URLToBytes } from '../utils/encoding';
import { decodeClientDataJSON } from './decode-client-data-json';
import type { PasskeyAuthenticationResponse } from './types';
import { verifyAuthenticationResponse } from './verify-authentication-response';

const EXPECTED_ORIGIN = 'https://dev.dontneeda.pw';
const EXPECTED_RP_ID = 'dev.dontneeda.pw';

const assertionResponse: PasskeyAuthenticationResponse = {
  id: 'KEbWNCc7NgaYnUyrNeFGX9_3Y-8oJ3KwzjnaiD1d1LVTxR7v3CaKfCz2Vy_g_MHSh7yJ8yL0Pxg6jo_o0hYiew',
  rawId:
    'KEbWNCc7NgaYnUyrNeFGX9_3Y-8oJ3KwzjnaiD1d1LVTxR7v3CaKfCz2Vy_g_MHSh7yJ8yL0Pxg6jo_o0hYiew',
  response: {
    authenticatorData: 'PdxHEOnAiLIp26idVjIguzn3Ipr_RlsKZWsa-5qK-KABAAAAkA==',
    clientDataJSON:
      'eyJjaGFsbGVuZ2UiOiJkRzkwWVd4c2VWVnVhWEYxWlZaaGJIVmxSWFpsY25sVWFXMWwiLCJj' +
      'bGllbnRFeHRlbnNpb25zIjp7fSwiaGFzaEFsZ29yaXRobSI6IlNIQS0yNTYiLCJvcmlnaW4iOiJodHRwczovL2Rldi5k' +
      'b250bmVlZGEucHciLCJ0eXBlIjoid2ViYXV0aG4uZ2V0In0=',
    signature:
      'MEUCIQDYXBOpCWSWq2Ll4558GJKD2RoWg958lvJSB_GdeokxogIgWuEVQ7ee6AswQY0OsuQ6y8Ks6' +
      'jhd45bDx92wjXKs900=',
  },
  clientExtensionResults: {},
  type: 'public-key',
};

const credential = {
  publicKey: base64URLToBytes(
    'pQECAyYgASFYIIheFp-u6GvFT2LNGovf3ZrT0iFVBsA_76rRysxRG9A1Ilgg8WGeA6hPmnab0HAViUYVRkwTNcN77QBf_RR0dv3lIvQ',
  ),
  id: 'KEbWNCc7NgaYnUyrNeFGX9_3Y-8oJ3KwzjnaiD1d1LVTxR7v3CaKfCz2Vy_g_MHSh7yJ8yL0Pxg6jo_o0hYiew',
  counter: 143,
};

const assertionFirstTimeUsedResponse: PasskeyAuthenticationResponse = {
  id: 'wSisR0_4hlzw3Y1tj4uNwwifIhRa-ZxWJwWbnfror0pVK9qPdBPO5pW3gasPqn6wXHb0LNhXB_IrA1nFoSQJ9A',
  rawId:
    'wSisR0_4hlzw3Y1tj4uNwwifIhRa-ZxWJwWbnfror0pVK9qPdBPO5pW3gasPqn6wXHb0LNhXB_IrA1nFoSQJ9A',
  response: {
    authenticatorData: 'PdxHEOnAiLIp26idVjIguzn3Ipr_RlsKZWsa-5qK-KABAAAAAA',
    clientDataJSON:
      'eyJjaGFsbGVuZ2UiOiJkRzkwWVd4c2VWVnVhWEYxWlZaaGJIVmxSWFpsY25sQmMzTmxjblJwYjI0IiwiY2xpZW50RXh0ZW5zaW9ucyI6e30sImhhc2hBbGdvcml0aG0iOiJTSEEtMjU2Iiwib3JpZ2luIjoiaHR0cHM6Ly9kZXYuZG9udG5lZWRhLnB3IiwidHlwZSI6IndlYmF1dGhuLmdldCJ9',
    signature:
      'MEQCIBu6M-DGzu1O8iocGHEj0UaAZm0HmxTeRIE6-nS3_CPjAiBDsmIzy5sacYwwzgpXqfwRt_2vl5yiQZ_OAqWJQBGVsQ',
  },
  type: 'public-key',
  clientExtensionResults: {},
};

const authenticatorFirstTimeUsed = {
  publicKey: base64URLToBytes(
    'pQECAyYgASFYIGmaxR4mBbukc2QhtW2ldhAAd555r-ljlGQN8MbcTnPPIlgg9CyUlE-0AB2fbzZbNgBvJuRa7r6o2jPphOmtyNPR_kY',
  ),
  id: 'wSisR0_4hlzw3Y1tj4uNwwifIhRa-ZxWJwWbnfror0pVK9qPdBPO5pW3gasPqn6wXHb0LNhXB_IrA1nFoSQJ9A',
  counter: 0,
};

const assertionChallenge = decodeClientDataJSON(
  assertionResponse.response.clientDataJSON,
).challenge;

const assertionFirstTimeUsedChallenge = decodeClientDataJSON(
  assertionFirstTimeUsedResponse.response.clientDataJSON,
).challenge;

describe('verifyAuthenticationResponse', () => {
  it('verifies an assertion response', async () => {
    const verification = await verifyAuthenticationResponse({
      response: assertionResponse,
      expectedChallenge: assertionChallenge,
      expectedOrigin: EXPECTED_ORIGIN,
      expectedRPID: EXPECTED_RP_ID,
      credential,
      requireUserVerification: false,
    });

    expect(verification.verified).toBe(true);
  });

  it('returns authenticator info after verification', async () => {
    const verification = await verifyAuthenticationResponse({
      response: assertionResponse,
      expectedChallenge: assertionChallenge,
      expectedOrigin: EXPECTED_ORIGIN,
      expectedRPID: EXPECTED_RP_ID,
      credential,
      requireUserVerification: false,
    });

    expect(verification.verified).toBe(true);
    if (!verification.verified) {
      return;
    }
    expect(verification.authenticationInfo.newCounter).toBe(144);
    expect(verification.authenticationInfo.credentialId).toBe(credential.id);
    expect(verification.authenticationInfo.origin).toBe(EXPECTED_ORIGIN);
    expect(verification.authenticationInfo.rpID).toBe(EXPECTED_RP_ID);
  });

  it('throws when response challenge is not expected value', async () => {
    await expect(
      verifyAuthenticationResponse({
        response: assertionResponse,
        expectedChallenge: 'shouldhavebeenthisvalue',
        expectedOrigin: EXPECTED_ORIGIN,
        expectedRPID: EXPECTED_RP_ID,
        credential,
      }),
    ).rejects.toThrow('Unexpected authentication response challenge');
  });

  it('throws when response origin is not expected value', async () => {
    await expect(
      verifyAuthenticationResponse({
        response: assertionResponse,
        expectedChallenge: assertionChallenge,
        expectedOrigin: 'https://different.address',
        expectedRPID: EXPECTED_RP_ID,
        credential,
      }),
    ).rejects.toThrow('Unexpected authentication response origin');
  });

  it('returns { verified: false } when signature does not verify', async () => {
    const signatureBytes = base64URLToBytes(
      assertionResponse.response.signature,
    );
    signatureBytes[0] = ((signatureBytes[0] ?? 0) + 1) % 256;

    const result = await verifyAuthenticationResponse({
      response: {
        ...assertionResponse,
        response: {
          ...assertionResponse.response,
          signature: bytesToBase64URL(signatureBytes),
        },
      },
      expectedChallenge: assertionChallenge,
      expectedOrigin: EXPECTED_ORIGIN,
      expectedRPID: EXPECTED_RP_ID,
      credential,
    });

    expect(result.verified).toBe(false);
    expect(result.authenticationInfo).toBeUndefined();
  });

  it('throws when authentication type is not webauthn.get', async () => {
    const badTypeClientData = bytesToBase64URL(
      new TextEncoder().encode(
        JSON.stringify({
          ...decodeClientDataJSON(assertionResponse.response.clientDataJSON),
          type: 'webauthn.badtype',
        }),
      ),
    );

    await expect(
      verifyAuthenticationResponse({
        response: {
          ...assertionResponse,
          response: {
            ...assertionResponse.response,
            clientDataJSON: badTypeClientData,
          },
        },
        expectedChallenge: assertionChallenge,
        expectedOrigin: EXPECTED_ORIGIN,
        expectedRPID: EXPECTED_RP_ID,
        credential,
      }),
    ).rejects.toThrow('Unexpected authentication response type');
  });

  it('throws when RP ID is not expected value', async () => {
    await expect(
      verifyAuthenticationResponse({
        response: assertionResponse,
        expectedChallenge: assertionChallenge,
        expectedOrigin: EXPECTED_ORIGIN,
        expectedRPID: 'wrong-rp.com',
        credential,
      }),
    ).rejects.toThrow('Unexpected RP ID hash');
  });

  it('throws when credential ID is missing in response', async () => {
    await expect(
      verifyAuthenticationResponse({
        response: {
          ...assertionResponse,
          id: '',
          rawId: '',
        },
        expectedChallenge: assertionChallenge,
        expectedOrigin: EXPECTED_ORIGIN,
        expectedRPID: EXPECTED_RP_ID,
        credential,
      }),
    ).rejects.toThrow('Missing credential ID');
  });

  it('throws when id and rawId differ', async () => {
    await expect(
      verifyAuthenticationResponse({
        response: {
          ...assertionResponse,
          rawId: 'different-raw-id',
        },
        expectedChallenge: assertionChallenge,
        expectedOrigin: EXPECTED_ORIGIN,
        expectedRPID: EXPECTED_RP_ID,
        credential,
      }),
    ).rejects.toThrow('Credential ID was not base64url-encoded');
  });

  it('throws when credential type is not public-key', async () => {
    await expect(
      verifyAuthenticationResponse({
        response: {
          ...assertionResponse,
          type: 'not-public-key',
        } as unknown as PasskeyAuthenticationResponse,
        expectedChallenge: assertionChallenge,
        expectedOrigin: EXPECTED_ORIGIN,
        expectedRPID: EXPECTED_RP_ID,
        credential,
      }),
    ).rejects.toThrow('Unexpected credential type');
  });

  it('throws error if user was not present', async () => {
    const authData = base64URLToBytes(
      assertionResponse.response.authenticatorData,
    );
    authData[32] = 0x00;

    await expect(
      verifyAuthenticationResponse({
        response: {
          ...assertionResponse,
          response: {
            ...assertionResponse.response,
            authenticatorData: bytesToBase64URL(authData),
          },
        },
        expectedChallenge: assertionChallenge,
        expectedOrigin: EXPECTED_ORIGIN,
        expectedRPID: EXPECTED_RP_ID,
        credential,
      }),
    ).rejects.toThrow('User not present during authentication');
  });

  it('throws error when response counter equals stored counter and monotonicity applies', async () => {
    await expect(
      verifyAuthenticationResponse({
        response: assertionResponse,
        expectedChallenge: assertionChallenge,
        expectedOrigin: EXPECTED_ORIGIN,
        expectedRPID: EXPECTED_RP_ID,
        credential: {
          ...credential,
          counter: 144,
        },
        requireUserVerification: false,
      }),
    ).rejects.toThrow(
      'Response counter value 144 must be greater than stored counter 144',
    );
  });

  it('throws error when response counter is lower than stored counter', async () => {
    await expect(
      verifyAuthenticationResponse({
        response: assertionResponse,
        expectedChallenge: assertionChallenge,
        expectedOrigin: EXPECTED_ORIGIN,
        expectedRPID: EXPECTED_RP_ID,
        credential: {
          ...credential,
          counter: 200,
        },
        requireUserVerification: false,
      }),
    ).rejects.toThrow(
      'Response counter value 144 must be greater than stored counter 200',
    );
  });

  it('does not compare counters if both are 0', async () => {
    const verification = await verifyAuthenticationResponse({
      response: assertionFirstTimeUsedResponse,
      expectedChallenge: assertionFirstTimeUsedChallenge,
      expectedOrigin: EXPECTED_ORIGIN,
      expectedRPID: EXPECTED_RP_ID,
      credential: authenticatorFirstTimeUsed,
      requireUserVerification: false,
    });

    expect(verification.verified).toBe(true);
  });

  it('throws if user verification is required but uv is false', async () => {
    await expect(
      verifyAuthenticationResponse({
        response: assertionResponse,
        expectedChallenge: assertionChallenge,
        expectedOrigin: EXPECTED_ORIGIN,
        expectedRPID: EXPECTED_RP_ID,
        credential,
        requireUserVerification: true,
      }),
    ).rejects.toThrow(
      'User verification required, but user could not be verified',
    );
  });

  it('accepts expectedOrigin as array', async () => {
    const verification = await verifyAuthenticationResponse({
      response: assertionResponse,
      expectedChallenge: assertionChallenge,
      expectedOrigin: ['https://other.com', EXPECTED_ORIGIN],
      expectedRPID: EXPECTED_RP_ID,
      credential,
      requireUserVerification: false,
    });

    expect(verification.verified).toBe(true);
  });

  it('throws when clientDataJSON is not a string', async () => {
    await expect(
      verifyAuthenticationResponse({
        response: {
          ...assertionResponse,
          response: {
            ...assertionResponse.response,
            clientDataJSON: 1 as unknown as string,
          },
        },
        expectedChallenge: assertionChallenge,
        expectedOrigin: EXPECTED_ORIGIN,
        expectedRPID: EXPECTED_RP_ID,
        credential,
      }),
    ).rejects.toThrow('Credential response clientDataJSON was not a string');
  });

  it('throws when userHandle is not a string', async () => {
    await expect(
      verifyAuthenticationResponse({
        response: {
          ...assertionResponse,
          response: {
            ...assertionResponse.response,
            userHandle: 1 as unknown as string,
          },
        },
        expectedChallenge: assertionChallenge,
        expectedOrigin: EXPECTED_ORIGIN,
        expectedRPID: EXPECTED_RP_ID,
        credential,
      }),
    ).rejects.toThrow('Credential response userHandle was not a string');
  });

  it('throws when tokenBinding is not an object', async () => {
    const clientDataJSON = bytesToBase64URL(
      new TextEncoder().encode(
        JSON.stringify({
          ...decodeClientDataJSON(assertionResponse.response.clientDataJSON),
          tokenBinding: 'invalid',
        }),
      ),
    );

    await expect(
      verifyAuthenticationResponse({
        response: {
          ...assertionResponse,
          response: {
            ...assertionResponse.response,
            clientDataJSON,
          },
        },
        expectedChallenge: assertionChallenge,
        expectedOrigin: EXPECTED_ORIGIN,
        expectedRPID: EXPECTED_RP_ID,
        credential,
      }),
    ).rejects.toThrow('ClientDataJSON tokenBinding was not an object');
  });

  it('throws when tokenBinding status is invalid', async () => {
    const clientDataJSON = bytesToBase64URL(
      new TextEncoder().encode(
        JSON.stringify({
          ...decodeClientDataJSON(assertionResponse.response.clientDataJSON),
          tokenBinding: { status: 'invalid-status' },
        }),
      ),
    );

    await expect(
      verifyAuthenticationResponse({
        response: {
          ...assertionResponse,
          response: {
            ...assertionResponse.response,
            clientDataJSON,
          },
        },
        expectedChallenge: assertionChallenge,
        expectedOrigin: EXPECTED_ORIGIN,
        expectedRPID: EXPECTED_RP_ID,
        credential,
      }),
    ).rejects.toThrow('Unexpected tokenBinding status');
  });
});
