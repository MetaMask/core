import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock, Mocked } from 'vitest';

import { LighterNotificationEnrollmentService } from '../../../src/services/LighterNotificationEnrollmentService.js';
import type { PerpsPlatformDependencies } from '../../../src/types/index.js';
/* eslint-disable */
import {
  createMockInfrastructure,
  createMockMessenger,
  createPartiallyDelegatedMessenger,
} from '../../helpers/serviceMocks.js';

describe('LighterNotificationEnrollmentService', () => {
  let mockDeps: Mocked<PerpsPlatformDependencies>;
  let mockMessenger: ReturnType<typeof createMockMessenger>;
  const mockToken = 'mock-bearer-token';
  const mockFetch = vi.fn();
  const getAccountIndex = vi.fn();

  const createService = (
    baseUrl: string | null = 'https://notify.test',
    messenger: ConstructorParameters<
      typeof LighterNotificationEnrollmentService
    >[1] = mockMessenger,
  ) => {
    mockDeps = createMockInfrastructure();
    mockDeps.notifyPerpsApi = baseUrl === null ? undefined : { baseUrl };
    return new LighterNotificationEnrollmentService(mockDeps, messenger);
  };

  const enroll = (
    service: LighterNotificationEnrollmentService,
    overrides: { isTestnet?: boolean } = {},
  ) =>
    service.enroll({
      isTestnet: false,
      getAccountIndex,
      ...overrides,
    });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', mockFetch);
    vi.clearAllMocks();
    mockMessenger = createMockMessenger();
    (mockMessenger.call as Mock).mockImplementation((action: string) =>
      action === 'AuthenticationController:getBearerToken'
        ? Promise.resolve(mockToken)
        : undefined,
    );
    getAccountIndex.mockResolvedValue(9828);
    mockFetch.mockResolvedValue({ ok: true, status: 204 });
  });

  afterEach(() => {
    vi.resetAllMocks();
    vi.useRealTimers();
  });

  it('posts only the account index to the enrollment endpoint', async () => {
    const result = await enroll(createService());

    expect(result).toEqual({ success: true });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://notify.test/api/v1/lighter/accounts',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${mockToken}`,
        },
        body: JSON.stringify({ account_index: 9828 }),
      },
    );
  });

  it.each([
    ['https://notify.dev.test', 'https://notify.dev.test'],
    ['https://notify.uat.test/', 'https://notify.uat.test'],
    ['https://notify.prd.test', 'https://notify.prd.test'],
  ])('builds the URL for base URL %s', async (baseUrl, expected) => {
    await enroll(createService(baseUrl));

    expect(mockFetch).toHaveBeenCalledWith(
      `${expected}/api/v1/lighter/accounts`,
      expect.any(Object),
    );
  });

  it('resolves the account index before waiting for the bearer token', async () => {
    let resolveToken: (token: string) => void = () => undefined;
    (mockMessenger.call as Mock).mockReturnValue(
      new Promise<string>((resolve) => {
        resolveToken = resolve;
      }),
    );

    const promise = enroll(createService());

    expect(getAccountIndex).toHaveBeenCalledTimes(1);
    resolveToken(mockToken);
    await expect(promise).resolves.toEqual({ success: true });
  });

  describe('skips', () => {
    it('on testnet', async () => {
      const result = await enroll(createService(), { isTestnet: true });

      expect(result).toEqual({ success: true, error: 'Skipped for testnet' });
      expect(getAccountIndex).not.toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('when no base URL is configured', async () => {
      const result = await enroll(createService(null));

      expect(result).toEqual({
        success: false,
        error: 'No base URL configured',
      });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('when there is no bearer token', async () => {
      (mockMessenger.call as Mock).mockResolvedValue(undefined);

      const result = await enroll(createService());

      expect(result).toEqual({ success: false, error: 'No token available' });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('when the host has no authentication controller', async () => {
      const result = await enroll(
        createService(
          'https://notify.test',
          createPartiallyDelegatedMessenger({}),
        ),
      );

      expect(result).toEqual({ success: false, error: 'No token available' });
      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockDeps.logger.error).not.toHaveBeenCalled();
    });
  });

  describe('failures', () => {
    it('never throws and logs when the account index cannot be resolved', async () => {
      getAccountIndex.mockRejectedValue(new Error('no account'));

      const result = await enroll(createService());

      expect(result).toEqual({ success: false, error: 'no account' });
      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockDeps.logger.error).toHaveBeenCalledTimes(1);
    });

    it('retries with exponential backoff until it succeeds', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 500 })
        .mockRejectedValueOnce(new Error('network'))
        .mockResolvedValueOnce({ ok: true, status: 204 });

      const promise = enroll(createService());
      await vi.advanceTimersByTimeAsync(1000);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(2000);

      await expect(promise).resolves.toEqual({ success: true });
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('gives up after 3 retries and logs the final failure', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 503 });

      const promise = enroll(createService());
      await vi.advanceTimersByTimeAsync(1000 + 2000 + 4000);

      await expect(promise).resolves.toEqual({
        success: false,
        error: 'Lighter notification enrollment API error: 503',
      });
      expect(mockFetch).toHaveBeenCalledTimes(4);
      expect(mockDeps.logger.error).toHaveBeenCalled();
    });
  });
});
