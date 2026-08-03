import { bytesToHex, hexToBytes } from '@metamask/utils';

import { HttpSecretEscrowClient } from './HttpSecretEscrowClient';
import { SecretEscrowErrorCode } from './errors';
import type { WebAuthnEscrowFactor } from './types';

const TEST_FACTOR: WebAuthnEscrowFactor = {
  type: 'webauthn',
  rpId: 'example.com',
  origins: ['https://example.com'],
  credentialId: 'cred-1',
  publicKey: { kty: 'EC', crv: 'P-256', x: 'x', y: 'y' },
};

const SECRET = new Uint8Array(32).fill(7);

function jsonResponse(status: number, body?: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () =>
      body === undefined || status === 204 ? '' : JSON.stringify(body),
    json: async () => body,
  } as Response;
}

describe('HttpSecretEscrowClient', () => {
  it('registers and returns the escrow secret', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      jsonResponse(200, { secretHex: bytesToHex(SECRET) }),
    );
    const client = new HttpSecretEscrowClient({
      baseUrl: 'http://127.0.0.1:8787/',
      fetch: fetchMock,
    });

    const { secret } = await client.register({
      userId: 'user-1',
      factorId: 'passkey',
      factor: TEST_FACTOR,
      secret: SECRET,
    });

    expect(bytesToHex(secret)).toBe(bytesToHex(SECRET));
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8787/v1/register',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('runs exportInit and exportComplete', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { challenge: 'chal' }))
      .mockResolvedValueOnce(
        jsonResponse(200, { secretHex: bytesToHex(SECRET) }),
      );
    const client = new HttpSecretEscrowClient({
      baseUrl: 'http://127.0.0.1:8787',
      fetch: fetchMock,
    });

    await expect(
      client.exportInit({ userId: 'user-1', factorId: 'passkey' }),
    ).resolves.toEqual({ challenge: 'chal' });

    const { secret } = await client.exportComplete({
      userId: 'user-1',
      factorId: 'passkey',
      proof: {
        type: 'webauthn',
        assertion: { id: 'cred-1', challenge: 'chal' },
      },
    });
    expect(hexToBytes(bytesToHex(secret))).toEqual(SECRET);
  });

  it('adds a factor via HTTP', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(204));
    const client = new HttpSecretEscrowClient({
      baseUrl: 'http://127.0.0.1:8787',
      fetch: fetchMock,
    });

    await client.addFactor({
      userId: 'user-1',
      factorId: 'password',
      factor: { type: 'password', password: 'wallet-password' },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8787/v1/add_factor',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('revokes and puts/gets enrollment metadata', async () => {
    const enrollment = {
      userId: 'user-1',
      factorId: 'passkey',
      factor: TEST_FACTOR,
      wrappedPassword: { ciphertext: 'c', iv: 'i' },
      enrolledAt: 1,
    };
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(204))
      .mockResolvedValueOnce(jsonResponse(204))
      .mockResolvedValueOnce(jsonResponse(200, enrollment))
      .mockResolvedValueOnce(jsonResponse(404));
    const client = new HttpSecretEscrowClient({
      baseUrl: 'http://127.0.0.1:8787',
      fetch: fetchMock,
    });

    await client.revoke({ userId: 'user-1' });
    await client.putEnrollmentMetadata(enrollment);
    await expect(client.getEnrollmentMetadata('user-1')).resolves.toEqual(
      enrollment,
    );
    await expect(client.getEnrollmentMetadata('missing')).resolves.toBeNull();
  });

  it('maps HTTP error bodies to SecretEscrowError', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      jsonResponse(400, {
        code: SecretEscrowErrorCode.AlreadyRegistered,
        message: 'already',
      }),
    );
    const client = new HttpSecretEscrowClient({
      baseUrl: 'http://127.0.0.1:8787',
      fetch: fetchMock,
    });

    await expect(
      client.register({
        userId: 'user-1',
        factorId: 'passkey',
        factor: TEST_FACTOR,
      }),
    ).rejects.toMatchObject({
      code: SecretEscrowErrorCode.AlreadyRegistered,
      message: 'already',
    });
  });

  it('maps unknown HTTP error codes and empty success bodies', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(500, { code: 'nope', message: 'boom' }),
      )
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '',
        json: async () => {
          throw new Error('no json');
        },
      } as Response)
      .mockResolvedValueOnce(
        jsonResponse(500, {
          /* no code */
        }),
      )
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        text: async () => '',
        json: async () => {
          throw new Error('bad json');
        },
      } as Response)
      .mockResolvedValueOnce(jsonResponse(503, { message: 'down' }));

    const client = new HttpSecretEscrowClient({
      baseUrl: 'http://127.0.0.1:8787',
      fetch: fetchMock,
    });

    await expect(client.revoke({ userId: 'user-1' })).rejects.toMatchObject({
      code: SecretEscrowErrorCode.AssertionFailed,
      message: 'boom',
    });

    await expect(client.revoke({ userId: 'user-1' })).resolves.toBeUndefined();

    await expect(client.revoke({ userId: 'user-1' })).rejects.toMatchObject({
      code: SecretEscrowErrorCode.AssertionFailed,
    });

    await expect(client.revoke({ userId: 'user-1' })).rejects.toMatchObject({
      message: 'Secret escrow HTTP 502',
    });

    await expect(client.getEnrollmentMetadata('user-1')).rejects.toMatchObject({
      message: 'down',
    });
  });

  it('uses globalThis.fetch by default and supports health checks without a body', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(200, { ok: true }) as never);
    try {
      const client = new HttpSecretEscrowClient({
        baseUrl: 'http://127.0.0.1:8787',
      });
      await expect(client.health()).resolves.toEqual({ ok: true });
      expect(fetchSpy).toHaveBeenCalledWith(
        'http://127.0.0.1:8787/health',
        expect.objectContaining({
          method: 'GET',
          body: undefined,
        }),
      );
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
