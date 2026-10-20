import { createDeferredPromise } from '@metamask/utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RecoveryRegistrationLockProvider } from './recovery-registration-lock-provider.js';

describe('RecoveryRegistrationLockProvider', () => {
  const getAccessToken = vi.fn(async () => 'hydra-token');
  const options = { baseUrl: 'https://registration.example/', getAccessToken };
  const leaseResponse = (expiresIn = 300): Response =>
    new Response(JSON.stringify({ expires_in: expiresIn }));

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    [
      'acquire',
      'POST',
      '/recovery/lock',
      leaseResponse(),
      { body: JSON.stringify({ lock_id: 'operation-1' }) },
    ],
    ['renew', 'PUT', '/recovery/lock/operation-1', leaseResponse(), {}],
    [
      'release',
      'DELETE',
      '/recovery/lock/operation-1',
      new Response(null, { status: 204 }),
      {},
    ],
  ] as const)(
    'sends an authenticated %s request',
    async (action, method, path, response, body) => {
      const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response);
      const provider = new RecoveryRegistrationLockProvider({
        ...options,
        fetch: fetchMock,
      });

      await provider[action]('operation-1');

      expect(fetchMock).toHaveBeenCalledWith(
        `https://registration.example${path}`,
        {
          method,
          headers: {
            Authorization: 'Bearer hydra-token',
            'Content-Type': 'application/json',
          },
          ...body,
        },
      );
    },
  );

  it('skips renewals until 30 seconds remain in the returned lifetime', async () => {
    const startedAt = Date.now();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(async () => {
        vi.setSystemTime(startedAt + 30_000);
        return leaseResponse(90);
      })
      .mockResolvedValueOnce(leaseResponse());
    const provider = new RecoveryRegistrationLockProvider({
      ...options,
      fetch: fetchMock,
    });
    await provider.acquire('operation-1');
    vi.setSystemTime(startedAt + 59_999);
    await provider.renew('operation-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.setSystemTime(startedAt + 60_000);
    await provider.renew('operation-1');
    await provider.renew('operation-1');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not reuse a cached lease for a different lock ID', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(leaseResponse())
      .mockResolvedValueOnce(new Response(null, { status: 409 }));
    const provider = new RecoveryRegistrationLockProvider({
      ...options,
      fetch: fetchMock,
    });
    await provider.acquire('operation-1');

    await expect(provider.renew('operation-2')).rejects.toMatchObject({
      code: 'recovery_lock_conflict',
    });
  });

  it.each(['acquire', 'release'] as const)(
    'invalidates the cached lease when %s fails',
    async (action) => {
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(leaseResponse())
        .mockRejectedValueOnce(new Error('response lost'))
        .mockResolvedValueOnce(leaseResponse());
      const provider = new RecoveryRegistrationLockProvider({
        ...options,
        fetch: fetchMock,
      });
      await provider.acquire('operation-1');

      await expect(provider[action]('operation-1')).rejects.toThrow(
        'response lost',
      );
      await provider.renew('operation-1');

      expect(fetchMock).toHaveBeenCalledTimes(3);
    },
  );

  it('does not restore a released lease from a delayed response', async () => {
    const deferred = createDeferredPromise<Response>();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockReturnValueOnce(deferred.promise)
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 409 }));
    const provider = new RecoveryRegistrationLockProvider({
      ...options,
      fetch: fetchMock,
    });
    const acquisition = provider.acquire('operation-1');
    await provider.release('operation-1');
    deferred.resolve(leaseResponse());
    await acquisition;

    await expect(provider.renew('operation-1')).rejects.toMatchObject({
      code: 'recovery_lock_conflict',
    });
  });

  it('rejects a response without a positive lifetime', async () => {
    const provider = new RecoveryRegistrationLockProvider({
      ...options,
      fetch: vi.fn<typeof fetch>().mockResolvedValue(leaseResponse(0)),
    });

    await expect(provider.acquire('operation-1')).rejects.toMatchObject({
      code: 'recovery_lock_unavailable',
    });
  });

  it.each([
    [409, 'recovery_lock_conflict'],
    [503, 'recovery_lock_unavailable'],
  ] as const)('surfaces HTTP %s without retrying', async (status, code) => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status }));
    const provider = new RecoveryRegistrationLockProvider({
      ...options,
      fetch: fetchMock,
    });

    await expect(provider.acquire('operation-1')).rejects.toMatchObject({
      code,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('uses the global fetch by default', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));
    await new RecoveryRegistrationLockProvider(options).release('operation-1');
    expect(fetchMock.mock.contexts[0]).toBe(globalThis);
  });
});
