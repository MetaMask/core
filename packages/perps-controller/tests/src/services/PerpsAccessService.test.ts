import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';

import { PERPS_ACCESS_CONFIG } from '../../../src/constants/perpsConfig.js';
import { PerpsAccessService } from '../../../src/services/PerpsAccessService.js';
import type {
  PerpsAccessPolicy,
  PerpsPlatformDependencies,
} from '../../../src/types/index.js';
import { createMockInfrastructure } from '../../helpers/serviceMocks.js';

const POLICY_URL = 'https://api.test/v1/perps/access-policy';
const ADDRESS = '0x00000000000000000000000000000000000000aa' as const;

const policy: PerpsAccessPolicy = {
  venues: [
    {
      providerId: 'hyperliquid',
      marketSource: null,
      listed: true,
      access: 'trade',
    },
  ],
  programs: [
    {
      id: 'us',
      enrollable: false,
      venues: [
        {
          providerId: 'hyperliquid',
          marketSource: 'ignp',
          listed: true,
          access: 'trade',
        },
      ],
    },
  ],
  ttlSeconds: 3600,
};

const jsonResponse = (body: unknown, ok = true): Response =>
  ({ ok, status: ok ? 200 : 503, json: async () => body }) as Response;

describe('PerpsAccessService', () => {
  let deps: PerpsPlatformDependencies;
  let service: PerpsAccessService;
  let fetchMock: MockInstance<typeof fetch>;

  beforeEach(() => {
    deps = createMockInfrastructure();
    deps.terminalApi = { accessPolicyUrl: POLICY_URL };
    service = new PerpsAccessService(deps);
    fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(policy));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('refresh', () => {
    it('fetches the policy for the network and caches it on disk', async () => {
      const record = await service.refresh('testnet', { force: true });

      expect(fetchMock).toHaveBeenCalledWith(
        `${POLICY_URL}?network=testnet`,
        expect.objectContaining({ method: 'GET' }),
      );
      expect(record?.policy).toStrictEqual(policy);
      expect(deps.diskCache.setItem).toHaveBeenCalledWith(
        `${PERPS_ACCESS_CONFIG.DiskCacheKeyPrefix}testnet`,
        JSON.stringify(record),
      );
      expect(service.readCached('testnet')).toBe(record);
    });

    it('appends the network to a URL that already has a query', async () => {
      deps.terminalApi = { accessPolicyUrl: `${POLICY_URL}?region=US` };

      await service.refresh('mainnet', { force: true });

      expect(fetchMock).toHaveBeenCalledWith(
        `${POLICY_URL}?region=US&network=mainnet`,
        expect.anything(),
      );
    });

    it('fetches at most once per refresh interval unless forced', async () => {
      vi.useFakeTimers();
      await service.refresh('mainnet', { force: true });
      expect(await service.refresh('mainnet')).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(1);

      vi.setSystemTime(Date.now() + PERPS_ACCESS_CONFIG.RefreshIntervalMs);
      await service.refresh('mainnet');
      await service.refresh('mainnet', { force: true });
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('fetches again within the interval once the cached policy expired', async () => {
      vi.useFakeTimers();
      fetchMock.mockResolvedValue(jsonResponse({ ...policy, ttlSeconds: 60 }));
      await service.refresh('mainnet', { force: true });

      vi.setSystemTime(Date.now() + 61_000);
      await service.refresh('mainnet');

      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('shares an in-flight fetch', async () => {
      const [first, second] = await Promise.all([
        service.refresh('mainnet', { force: true }),
        service.refresh('mainnet', { force: true }),
      ]);

      expect(first).toBe(second);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('does nothing without a configured URL', async () => {
      deps.terminalApi = {};

      expect(await service.refresh('mainnet', { force: true })).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each([
      ['a non-2xx response', jsonResponse(policy, false)],
      ['a malformed policy', jsonResponse({ venues: 'all' })],
      ['a non-positive TTL', jsonResponse({ ...policy, ttlSeconds: 0 })],
    ])('logs and returns null for %s', async (_label, response) => {
      fetchMock.mockResolvedValue(response);

      expect(await service.refresh('mainnet', { force: true })).toBeNull();
      expect(deps.logger.error).toHaveBeenCalled();
      expect(service.readCached('mainnet')).toBeNull();
    });

    it('drops venues with an unknown provider or access level', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          ...policy,
          venues: [
            ...policy.venues,
            {
              providerId: 'other',
              marketSource: null,
              listed: true,
              access: 'trade',
            },
            {
              providerId: 'hyperliquid',
              marketSource: 'xyz',
              listed: true,
              access: 'closeOnly',
            },
          ],
        }),
      );

      const record = await service.refresh('mainnet', { force: true });

      expect(record?.policy.venues).toStrictEqual(policy.venues);
    });
  });

  describe('cache', () => {
    it('reads a record written by an earlier session', async () => {
      const record = { policy, fetchedAt: 1 };
      await deps.diskCache.setItem(
        `${PERPS_ACCESS_CONFIG.DiskCacheKeyPrefix}mainnet`,
        JSON.stringify(record),
      );

      expect(new PerpsAccessService(deps).readCached('mainnet')).toStrictEqual(
        record,
      );
      expect(
        await new PerpsAccessService(deps).loadCached('mainnet'),
      ).toStrictEqual(record);
    });

    it('falls back to the asynchronous disk API', async () => {
      const record = { policy, fetchedAt: 1 };
      deps.diskCache = {
        getItem: vi.fn().mockResolvedValue(JSON.stringify(record)),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      };

      expect(service.readCached('mainnet')).toBeNull();
      expect(
        await new PerpsAccessService(deps).loadCached('mainnet'),
      ).toStrictEqual(record);
    });

    it.each([
      'not json',
      JSON.stringify({ policy: {}, fetchedAt: 1 }),
      JSON.stringify({ policy: { ...policy, ttlSeconds: -1 }, fetchedAt: 1 }),
    ])('ignores a corrupt record %#', async (raw) => {
      await deps.diskCache.setItem(
        `${PERPS_ACCESS_CONFIG.DiskCacheKeyPrefix}mainnet`,
        raw,
      );
      expect(service.readCached('mainnet')).toBeNull();
    });

    it('treats disk errors as no cache', async () => {
      deps.diskCache = {
        getItem: vi.fn().mockRejectedValue(new Error('io')),
        getItemSync: vi.fn().mockImplementation(() => {
          throw new Error('io');
        }),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      };

      expect(await service.loadCached('mainnet')).toBeNull();
    });
  });

  describe('isFresh', () => {
    it('is fresh only before fetchedAt + ttl', () => {
      const record = { policy, fetchedAt: 1_000 };
      expect(service.isFresh(record, 1_000)).toBe(true);
      expect(service.isFresh(record, 1_000 + 3_600_000)).toBe(false);
      expect(service.isFresh(record, 999)).toBe(false);
      expect(service.isFresh(null)).toBe(false);
    });
  });

  describe('getEnrollment', () => {
    it('is none without a reader', async () => {
      expect(
        await service.getEnrollment({
          network: 'testnet',
          address: ADDRESS,
          programId: 'us',
          read: undefined,
        }),
      ).toBe('none');
    });

    it('caches per wallet until the next policy fetch', async () => {
      const read = vi.fn().mockResolvedValue('approved');
      const options = {
        network: 'testnet' as const,
        address: ADDRESS,
        programId: 'us',
        read,
      };

      expect(await service.getEnrollment(options)).toBe('approved');
      expect(await service.getEnrollment(options)).toBe('approved');
      expect(read).toHaveBeenCalledTimes(1);

      await service.refresh('testnet', { force: true });
      await service.getEnrollment(options);
      expect(read).toHaveBeenCalledTimes(2);
    });

    it('is none on a failed read, which is retried next time', async () => {
      const read = vi
        .fn()
        .mockRejectedValueOnce(new Error('venue down'))
        .mockResolvedValue('reduceOnly');
      const options = {
        network: 'testnet' as const,
        address: ADDRESS,
        programId: 'us',
        read,
      };

      expect(await service.getEnrollment(options)).toBe('none');
      expect(deps.logger.error).toHaveBeenCalled();
      expect(await service.getEnrollment(options)).toBe('reduceOnly');
    });
  });

  describe('getPositionVenueKeys', () => {
    const options = {
      network: 'testnet' as const,
      address: ADDRESS,
      programId: 'us',
      fallback: ['hyperliquid:ignp'],
    };

    it('caches per wallet until the next policy fetch', async () => {
      const read = vi.fn().mockResolvedValue([]);

      await service.getPositionVenueKeys({ ...options, read });
      await service.getPositionVenueKeys({ ...options, read });
      expect(read).toHaveBeenCalledTimes(1);

      await service.refresh('testnet', { force: true });
      await service.getPositionVenueKeys({ ...options, read });
      expect(read).toHaveBeenCalledTimes(2);
    });

    it('returns the fallback without caching a failed read', async () => {
      const read = vi
        .fn()
        .mockRejectedValueOnce(new Error('down'))
        .mockResolvedValue([]);

      expect(
        await service.getPositionVenueKeys({ ...options, read }),
      ).toStrictEqual(['hyperliquid:ignp']);
      expect(
        await service.getPositionVenueKeys({ ...options, read }),
      ).toStrictEqual([]);
    });
  });
});
