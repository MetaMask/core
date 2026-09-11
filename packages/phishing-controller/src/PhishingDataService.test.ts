import {
  ConstantBackoff,
  DEFAULT_HYDRATION_TIMEOUT,
  handleWhen,
} from '@metamask/base-data-service';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';
import { Duration, inMilliseconds } from '@metamask/utils';
import nock, { cleanAll } from 'nock';

import { flushPromises } from '../../../tests/helpers.js';
import {
  PhishingDataService,
  C2_DOMAIN_BLOCKLIST_ENDPOINT,
  CLIENT_SIDE_DETECION_BASE_URL,
  METAMASK_HOTLIST_DIFF_FILE,
  METAMASK_STALELIST_FILE,
  PHISHING_CONFIG_BASE_URL,
  PHISHING_DETECTION_BASE_URL,
  PHISHING_DETECTION_BULK_SCAN_ENDPOINT,
  PHISHING_DETECTION_SCAN_ENDPOINT,
  SECURITY_ALERTS_BASE_URL,
  TOKEN_BULK_SCANNING_ENDPOINT,
  ADDRESS_SCAN_ENDPOINT,
  APPROVALS_ENDPOINT,
  SCAN_RESULT_GC_TIME,
  SCAN_RESULT_STALE_TIME,
  URL_SCAN_TIMEOUT,
} from './PhishingDataService.js';
import type { PhishingDataServiceMessenger } from './PhishingDataService.js';
import { TokenScanResultType } from './types.js';
import type { TokenScanApiResponse } from './types.js';

const createdServices: PhishingDataService[] = [];

const STALELIST_RESPONSE = {
  data: {
    allowlist: [],
    blocklist: ['phishing.example.com'],
    blocklistPaths: [],
    fuzzylist: [],
    tolerance: 2,
    version: 1,
    lastUpdated: 1700000000,
  },
};

describe('PhishingDataService', () => {
  afterEach(() => {
    jest.useRealTimers();
    cleanAll();
    while (createdServices.length > 0) {
      createdServices.pop()?.destroy();
    }
  });

  describe('constructor', () => {
    it('applies default options when only a messenger is given', () => {
      const rootMessenger = createRootMessenger();
      const messenger: PhishingDataServiceMessenger = new Messenger({
        namespace: 'PhishingDataService',
        parent: rootMessenger,
      });
      const service = new PhishingDataService({ messenger });
      createdServices.push(service);

      expect(service.name).toBe('PhishingDataService');
    });
  });

  describe('getStalelist', () => {
    it('returns the stalelist from the API', async () => {
      nock(PHISHING_CONFIG_BASE_URL)
        .get(METAMASK_STALELIST_FILE)
        .reply(200, STALELIST_RESPONSE);
      const { rootMessenger } = createService();

      const response = await rootMessenger.call(
        'PhishingDataService:getStalelist',
      );

      expect(response).toStrictEqual(STALELIST_RESPONSE);
    });

    it('throws if the API returns a non-200 status', async () => {
      nock(PHISHING_CONFIG_BASE_URL).get(METAMASK_STALELIST_FILE).reply(500);
      const { rootMessenger } = createService();

      await expect(
        rootMessenger.call('PhishingDataService:getStalelist'),
      ).rejects.toThrow('500 Internal Server Error');
    });

    it('throws if the API returns a malformed response', async () => {
      nock(PHISHING_CONFIG_BASE_URL)
        .get(METAMASK_STALELIST_FILE)
        .reply(200, { data: { lastUpdated: 1700000000 } });
      const { rootMessenger } = createService();

      await expect(
        rootMessenger.call('PhishingDataService:getStalelist'),
      ).rejects.toThrow('Malformed response received from stalelist endpoint');
    });

    it('aborts a pending list request when the service is destroyed', async () => {
      let requestSignal: AbortSignal | null | undefined;
      const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(
        (_input, init) =>
          new Promise<Response>((_resolve, reject) => {
            requestSignal = init?.signal;
            requestSignal?.addEventListener(
              'abort',
              () => reject(new Error('aborted')),
              { once: true },
            );
          }),
      );
      const { service } = createService();
      const pendingRequest = service.getStalelist().catch((error) => error);

      try {
        await flushPromises();
        service.destroy();

        expect(requestSignal?.aborted).toBe(true);
        await pendingRequest;
      } finally {
        fetchMock.mockRestore();
      }
    });

    it('aborts batched and uncached POST requests when destroyed', async () => {
      jest.useFakeTimers({
        doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'],
      });
      const requestSignals: AbortSignal[] = [];
      const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(
        (_input, init) =>
          new Promise<Response>((_resolve, reject) => {
            const signal = init?.signal;
            if (signal) {
              requestSignals.push(signal);
              if (signal.aborted) {
                reject(new Error('aborted'));
              } else {
                signal.addEventListener(
                  'abort',
                  () => reject(new Error('aborted')),
                  { once: true },
                );
              }
            }
          }),
      );
      const { service } = createService();
      const pendingBulkScan = service
        .bulkScanUrls(['https://example.com'])
        .catch((error) => error);
      const pendingApprovals = service
        .getApprovals('ethereum', '0x1234567890123456789012345678901234567890')
        .catch((error) => error);

      try {
        await flushPromises();
        expect(requestSignals).toHaveLength(2);

        service.destroy();

        expect(requestSignals.every((signal) => signal.aborted)).toBe(true);
        await Promise.all([pendingBulkScan, pendingApprovals]);
      } finally {
        fetchMock.mockRestore();
      }
    });
  });

  describe('getHotlistDiffs', () => {
    it('returns the hotlist diffs recorded since the given timestamp', async () => {
      const diffs = {
        data: [
          {
            url: 'phishing.example.com',
            timestamp: 1700000001,
            targetList: 'eth_phishing_detect_config.blocklist',
          },
        ],
      };
      nock(PHISHING_CONFIG_BASE_URL)
        .get(`${METAMASK_HOTLIST_DIFF_FILE}/1700000000`)
        .reply(200, diffs);
      const { rootMessenger } = createService();

      const response = await rootMessenger.call(
        'PhishingDataService:getHotlistDiffs',
        1700000000,
      );

      expect(response).toStrictEqual(diffs);
    });

    it('passes through diffs for unrecognized target lists', async () => {
      const diffs = {
        data: [
          {
            url: 'phishing.example.com',
            timestamp: 1700000001,
            targetList: 'unexpected.blocklist',
          },
        ],
      };
      nock(PHISHING_CONFIG_BASE_URL)
        .get(`${METAMASK_HOTLIST_DIFF_FILE}/1700000000`)
        .reply(200, diffs);
      const { rootMessenger } = createService();

      const response = await rootMessenger.call(
        'PhishingDataService:getHotlistDiffs',
        1700000000,
      );

      expect(response).toStrictEqual(diffs);
    });

    it('throws if the API returns a malformed response', async () => {
      nock(PHISHING_CONFIG_BASE_URL)
        .get(`${METAMASK_HOTLIST_DIFF_FILE}/1700000000`)
        .reply(200, {
          data: [{ url: 'phishing.example.com', timestamp: 'soon' }],
        });
      const { rootMessenger } = createService();

      await expect(
        rootMessenger.call('PhishingDataService:getHotlistDiffs', 1700000000),
      ).rejects.toThrow(
        'Malformed response received from hotlist diffs endpoint',
      );
    });
  });

  describe('getC2DomainBlocklist', () => {
    it('returns the C2 domain blocklist when no timestamp is given', async () => {
      const blocklist = {
        recentlyAdded: ['0415f1f1'],
        recentlyRemoved: [],
        lastFetchedAt: 1700000000,
      };
      nock(CLIENT_SIDE_DETECION_BASE_URL)
        .get(C2_DOMAIN_BLOCKLIST_ENDPOINT)
        .reply(200, blocklist);
      const { rootMessenger } = createService();

      const response = await rootMessenger.call(
        'PhishingDataService:getC2DomainBlocklist',
      );

      expect(response).toStrictEqual(blocklist);
    });

    it('passes the given timestamp to the API', async () => {
      const blocklist = {
        recentlyAdded: [],
        recentlyRemoved: ['0415f1f1'],
        lastFetchedAt: 1700000000,
      };
      nock(CLIENT_SIDE_DETECION_BASE_URL)
        .get(C2_DOMAIN_BLOCKLIST_ENDPOINT)
        .query({ timestamp: 1700000000 })
        .reply(200, blocklist);
      const { rootMessenger } = createService();

      const response = await rootMessenger.call(
        'PhishingDataService:getC2DomainBlocklist',
        1700000000,
      );

      expect(response).toStrictEqual(blocklist);
    });

    it('accepts a response without lastFetchedAt', async () => {
      nock(CLIENT_SIDE_DETECION_BASE_URL)
        .get(C2_DOMAIN_BLOCKLIST_ENDPOINT)
        .reply(200, { recentlyAdded: ['abc'], recentlyRemoved: [] });
      const { rootMessenger } = createService();

      expect(
        await rootMessenger.call('PhishingDataService:getC2DomainBlocklist'),
      ).toStrictEqual({ recentlyAdded: ['abc'], recentlyRemoved: [] });
    });

    it('throws if the API returns a malformed response', async () => {
      nock(CLIENT_SIDE_DETECION_BASE_URL)
        .get(C2_DOMAIN_BLOCKLIST_ENDPOINT)
        .reply(200, { recentlyAdded: 'abc', recentlyRemoved: [] });
      const { rootMessenger } = createService();

      await expect(
        rootMessenger.call('PhishingDataService:getC2DomainBlocklist'),
      ).rejects.toThrow(
        'Malformed response received from C2 domain blocklist endpoint',
      );
    });
  });

  describe('scanUrl', () => {
    it('returns the scan result from the API', async () => {
      nock(PHISHING_DETECTION_BASE_URL)
        .get(`/${PHISHING_DETECTION_SCAN_ENDPOINT}`)
        .query({ url: 'example.com' })
        .reply(200, { hostname: 'example.com', recommendedAction: 'NONE' });
      const { rootMessenger } = createService();

      const response = await rootMessenger.call(
        'PhishingDataService:scanUrl',
        'example.com',
      );

      expect(response).toStrictEqual({
        hostname: 'example.com',
        recommendedAction: 'NONE',
      });
    });

    it('serves a repeated scan of the same URL from the cache within the stale time', async () => {
      jest.useFakeTimers({
        doNotFake: ['nextTick', 'queueMicrotask'],
        now: 1_000_000,
      });
      nock(PHISHING_DETECTION_BASE_URL)
        .get(`/${PHISHING_DETECTION_SCAN_ENDPOINT}`)
        .query({ url: 'example.com' })
        .reply(200, { recommendedAction: 'NONE' })
        .get(`/${PHISHING_DETECTION_SCAN_ENDPOINT}`)
        .query({ url: 'example.com' })
        .reply(200, { recommendedAction: 'BLOCK' });
      const { rootMessenger } = createService();

      const response1 = await rootMessenger.call(
        'PhishingDataService:scanUrl',
        'example.com',
      );
      const response2 = await rootMessenger.call(
        'PhishingDataService:scanUrl',
        'example.com',
      );
      expect(response1).toStrictEqual(response2);

      // Once the result goes stale, the URL is scanned again.
      jest.advanceTimersByTime(SCAN_RESULT_STALE_TIME + 1);
      const response3 = await rootMessenger.call(
        'PhishingDataService:scanUrl',
        'example.com',
      );
      expect(response3).toStrictEqual({
        hostname: 'example.com',
        recommendedAction: 'BLOCK',
      });
    });

    it('throws if the API returns a non-200 status', async () => {
      nock(PHISHING_DETECTION_BASE_URL)
        .get(`/${PHISHING_DETECTION_SCAN_ENDPOINT}`)
        .query({ url: 'example.com' })
        .reply(404);
      const { rootMessenger } = createService();

      await expect(
        rootMessenger.call('PhishingDataService:scanUrl', 'example.com'),
      ).rejects.toThrow('404 Not Found');
    });

    it('aborts a timed-out request so the next scan can retry', async () => {
      jest.useFakeTimers({
        doNotFake: ['nextTick', 'queueMicrotask'],
      });
      const fetchMock = jest.spyOn(globalThis, 'fetch');
      fetchMock
        .mockImplementationOnce(
          (_input, init) =>
            new Promise<Response>((_resolve, reject) => {
              init?.signal?.addEventListener(
                'abort',
                () => reject(new Error('aborted')),
                { once: true },
              );
            }),
        )
        .mockResolvedValueOnce(
          new globalThis.Response(
            JSON.stringify({ recommendedAction: 'BLOCK' }),
            {
              status: 200,
            },
          ),
        );
      const { rootMessenger } = createService();

      try {
        const timedOutScan = rootMessenger
          .call('PhishingDataService:scanUrl', 'example.com')
          .catch((error) => error);
        await jest.advanceTimersByTimeAsync(URL_SCAN_TIMEOUT);
        expect(await timedOutScan).toMatchObject({
          message: `timeout of ${URL_SCAN_TIMEOUT}ms exceeded`,
        });

        expect(
          await rootMessenger.call(
            'PhishingDataService:scanUrl',
            'example.com',
          ),
        ).toStrictEqual({
          hostname: 'example.com',
          recommendedAction: 'BLOCK',
        });
        expect(fetchMock).toHaveBeenCalledTimes(2);
      } finally {
        fetchMock.mockRestore();
      }
    });

    it('throws if the API returns a malformed response', async () => {
      nock(PHISHING_DETECTION_BASE_URL)
        .get(`/${PHISHING_DETECTION_SCAN_ENDPOINT}`)
        .query({ url: 'example.com' })
        .reply(200, { recommendedAction: 'INVALID' });
      const { rootMessenger } = createService();

      await expect(
        rootMessenger.call('PhishingDataService:scanUrl', 'example.com'),
      ).rejects.toThrow('Malformed response received from URL scan endpoint');
    });

    it('validates optional URL scan response fields when present', async () => {
      nock(PHISHING_DETECTION_BASE_URL)
        .get(`/${PHISHING_DETECTION_SCAN_ENDPOINT}`)
        .query({ url: 'example.com' })
        .reply(200, {
          hostname: 123,
          recommendedAction: 'NONE',
          fetchError: false,
        });
      const { rootMessenger } = createService();

      await expect(
        rootMessenger.call('PhishingDataService:scanUrl', 'example.com'),
      ).rejects.toThrow('Malformed response received from URL scan endpoint');
    });

    it('does not cache a malformed response', async () => {
      const scope = nock(PHISHING_DETECTION_BASE_URL)
        .get(`/${PHISHING_DETECTION_SCAN_ENDPOINT}`)
        .query({ url: 'example.com' })
        .reply(200, { unexpected: 'shape' })
        .get(`/${PHISHING_DETECTION_SCAN_ENDPOINT}`)
        .query({ url: 'example.com' })
        .reply(200, { recommendedAction: 'BLOCK' });
      const { rootMessenger } = createService();

      await expect(
        rootMessenger.call('PhishingDataService:scanUrl', 'example.com'),
      ).rejects.toThrow('Malformed response received from URL scan endpoint');

      // The malformed body must not have been committed to the cache, so the
      // next call re-requests and sees the real verdict.
      expect(
        await rootMessenger.call('PhishingDataService:scanUrl', 'example.com'),
      ).toStrictEqual({
        hostname: 'example.com',
        recommendedAction: 'BLOCK',
      });
      expect(scope.isDone()).toBe(true);
    });

    it('does not cache a response containing a fetch error', async () => {
      const scope = nock(PHISHING_DETECTION_BASE_URL)
        .get(`/${PHISHING_DETECTION_SCAN_ENDPOINT}`)
        .query({ url: 'example.com' })
        .reply(200, {
          recommendedAction: 'NONE',
          fetchError: 'detector unavailable',
        })
        .get(`/${PHISHING_DETECTION_SCAN_ENDPOINT}`)
        .query({ url: 'example.com' })
        .reply(200, { recommendedAction: 'BLOCK' });
      const { rootMessenger } = createService();

      await expect(
        rootMessenger.call('PhishingDataService:scanUrl', 'example.com'),
      ).rejects.toThrow('detector unavailable');
      expect(
        await rootMessenger.call('PhishingDataService:scanUrl', 'example.com'),
      ).toStrictEqual({
        hostname: 'example.com',
        recommendedAction: 'BLOCK',
      });
      expect(scope.isDone()).toBe(true);
    });

    it('refetches once a cached result passes its garbage collection time', async () => {
      jest.useFakeTimers({
        doNotFake: ['nextTick', 'queueMicrotask'],
        now: 1_000_000,
      });
      const scope = nock(PHISHING_DETECTION_BASE_URL)
        .get(`/${PHISHING_DETECTION_SCAN_ENDPOINT}`)
        .query({ url: 'example.com' })
        .times(2)
        .reply(200, { recommendedAction: 'NONE' });
      const { rootMessenger } = createService();

      await rootMessenger.call('PhishingDataService:scanUrl', 'example.com');

      jest.advanceTimersByTime(SCAN_RESULT_GC_TIME + 1000);
      await flushPromises();

      await rootMessenger.call('PhishingDataService:scanUrl', 'example.com');

      // The entry is collected rather than being retained forever, which is
      // what TanStack Query would otherwise do in a service worker.
      expect(scope.isDone()).toBe(true);
    });
  });

  describe('bulkScanUrls', () => {
    it('retries a failed batch as a whole when retries are enabled', async () => {
      const batchSizes: number[] = [];
      nock(PHISHING_DETECTION_BASE_URL)
        .post(`/${PHISHING_DETECTION_BULK_SCAN_ENDPOINT}`)
        .times(3)
        .reply(function (_uri, body) {
          batchSizes.push((body as { urls: string[] }).urls.length);
          return [500, 'boom'];
        });
      const { rootMessenger } = createService({
        options: {
          policyOptions: { maxRetries: 2, backoff: new ConstantBackoff(0) },
        },
      });

      await expect(
        rootMessenger.call('PhishingDataService:bulkScanUrls', [
          'https://example1.com',
          'https://example2.com',
          'https://example3.com',
        ]),
      ).rejects.toThrow('500 Internal Server Error');
      expect(batchSizes).toStrictEqual([3, 3, 3]);
    });

    it('still coalesces lookups into one request after init', async () => {
      const batchSizes: number[] = [];
      nock(PHISHING_DETECTION_BASE_URL)
        .post(`/${PHISHING_DETECTION_BULK_SCAN_ENDPOINT}`)
        .reply(function (_uri, body) {
          const { urls } = body as { urls: string[] };
          batchSizes.push(urls.length);
          return [
            200,
            {
              results: Object.fromEntries(
                urls.map((url) => [url, { recommendedAction: 'NONE' }]),
              ),
              errors: {},
            },
          ];
        });
      const { rootMessenger, service } = createService({
        options: { persistenceConfig: undefined },
        setItemMock: jest.fn(),
        getItemMock: jest.fn().mockResolvedValue({ result: null }),
      });
      service.init();

      const response = await rootMessenger.call(
        'PhishingDataService:bulkScanUrls',
        [
          'https://example1.com',
          'https://example2.com',
          'https://example3.com',
        ],
      );

      expect(batchSizes).toStrictEqual([3]);
      expect(Object.keys(response.results)).toHaveLength(3);
    });

    it('batches a bulk call even when rehydration times out', async () => {
      const batchSizes: number[] = [];
      nock(PHISHING_DETECTION_BASE_URL)
        .post(`/${PHISHING_DETECTION_BULK_SCAN_ENDPOINT}`)
        .times(3)
        .reply(function (_uri, body) {
          const { urls } = body as { urls: string[] };
          batchSizes.push(urls.length);
          return [
            200,
            {
              results: Object.fromEntries(
                urls.map((url) => [url, { recommendedAction: 'NONE' }]),
              ),
              errors: {},
            },
          ];
        });
      const { rootMessenger, service } = createService({
        options: {
          persistenceConfig: {
            maxAge: inMilliseconds(5, Duration.Minute),
            hydrationTimeout: 20,
          },
        },
        setItemMock: jest.fn(),
        getItemMock: jest.fn(() => new Promise(() => undefined)),
      });
      service.init();

      const response = await rootMessenger.call(
        'PhishingDataService:bulkScanUrls',
        [
          'https://example1.com',
          'https://example2.com',
          'https://example3.com',
        ],
      );

      expect(batchSizes).toStrictEqual([3]);
      expect(Object.keys(response.results)).toHaveLength(3);
    });

    it('does not retry per-URL errors reported by the endpoint', async () => {
      let requests = 0;
      nock(PHISHING_DETECTION_BASE_URL)
        .post(`/${PHISHING_DETECTION_BULK_SCAN_ENDPOINT}`)
        .times(3)
        .reply(() => {
          requests += 1;
          return [
            200,
            { results: {}, errors: { 'https://example1.com': ['boom'] } },
          ];
        });
      const { rootMessenger } = createService({
        options: {
          policyOptions: { maxRetries: 2, backoff: new ConstantBackoff(0) },
        },
      });

      expect(
        await rootMessenger.call('PhishingDataService:bulkScanUrls', [
          'https://example1.com',
        ]),
      ).toStrictEqual({
        results: {},
        errors: { 'https://example1.com': ['boom'] },
      });
      expect(requests).toBe(1);
    });

    it('never retries item-level batch errors even if a caller-provided retryFilterPolicy would', async () => {
      let requests = 0;
      nock(PHISHING_DETECTION_BASE_URL)
        .post(`/${PHISHING_DETECTION_BULK_SCAN_ENDPOINT}`)
        .times(3)
        .reply(() => {
          requests += 1;
          return [
            200,
            { results: {}, errors: { 'https://example1.com': ['boom'] } },
          ];
        });
      const { rootMessenger } = createService({
        options: {
          policyOptions: {
            maxRetries: 2,
            backoff: new ConstantBackoff(0),
            retryFilterPolicy: handleWhen(() => true),
          },
        },
      });

      expect(
        await rootMessenger.call('PhishingDataService:bulkScanUrls', [
          'https://example1.com',
        ]),
      ).toStrictEqual({
        results: {},
        errors: { 'https://example1.com': ['boom'] },
      });
      expect(requests).toBe(1);
    });

    it('returns the scan results from the API', async () => {
      const urls = ['https://example1.com', 'https://example2.com'];
      const apiResponse = {
        results: {
          'https://example1.com': {
            hostname: 'example1.com',
            recommendedAction: 'NONE',
          },
          'https://example2.com': {
            hostname: 'example2.com',
            recommendedAction: 'BLOCK',
          },
        },
        errors: {},
      };
      nock(PHISHING_DETECTION_BASE_URL)
        .post(`/${PHISHING_DETECTION_BULK_SCAN_ENDPOINT}`, { urls })
        .reply(200, apiResponse);
      const { rootMessenger } = createService();

      const response = await rootMessenger.call(
        'PhishingDataService:bulkScanUrls',
        urls,
      );

      expect(response).toStrictEqual(apiResponse);
    });

    it('reports a malformed result for that URL and keeps the others', async () => {
      nock(PHISHING_DETECTION_BASE_URL)
        .post(`/${PHISHING_DETECTION_BULK_SCAN_ENDPOINT}`)
        .reply(200, {
          results: {
            'https://example1.com': {},
            'https://example2.com': { recommendedAction: 'BLOCK' },
          },
          errors: {},
        });
      const { rootMessenger } = createService();

      const response = await rootMessenger.call(
        'PhishingDataService:bulkScanUrls',
        ['https://example1.com', 'https://example2.com'],
      );

      expect(response).toStrictEqual({
        results: {
          'https://example2.com': {
            recommendedAction: 'BLOCK',
            hostname: 'example2.com',
          },
        },
        errors: {
          'https://example1.com': [
            'Malformed result returned by bulk URL scan endpoint',
          ],
        },
      });
    });

    it('throws if the API returns a malformed response', async () => {
      nock(PHISHING_DETECTION_BASE_URL)
        .post(`/${PHISHING_DETECTION_BULK_SCAN_ENDPOINT}`)
        .reply(200, { results: 'nope' });
      const { rootMessenger } = createService();

      await expect(
        rootMessenger.call('PhishingDataService:bulkScanUrls', [
          'https://example1.com',
        ]),
      ).rejects.toThrow(
        'Malformed response received from bulk URL scan endpoint',
      );
    });

    it('accepts a response without an errors object', async () => {
      nock(PHISHING_DETECTION_BASE_URL)
        .post(`/${PHISHING_DETECTION_BULK_SCAN_ENDPOINT}`)
        .reply(200, {
          results: { 'https://example1.com': { recommendedAction: 'NONE' } },
        });
      const { rootMessenger } = createService();

      expect(
        await rootMessenger.call('PhishingDataService:bulkScanUrls', [
          'https://example1.com',
        ]),
      ).toStrictEqual({
        results: {
          'https://example1.com': {
            recommendedAction: 'NONE',
            hostname: 'example1.com',
          },
        },
        errors: {},
      });
    });

    it('stores a hostname on cache entries shared with scanUrl', async () => {
      nock(PHISHING_DETECTION_BASE_URL)
        .post(`/${PHISHING_DETECTION_BULK_SCAN_ENDPOINT}`)
        .reply(200, {
          results: {
            'https://evil.com/some/path': { recommendedAction: 'BLOCK' },
          },
          errors: {},
        });
      const { rootMessenger } = createService();
      await rootMessenger.call('PhishingDataService:bulkScanUrls', [
        'https://evil.com/some/path',
      ]);

      // No GET interceptor is registered, so this must be a cache hit.
      expect(
        await rootMessenger.call('PhishingDataService:scanUrl', 'evil.com'),
      ).toStrictEqual({ recommendedAction: 'BLOCK', hostname: 'evil.com' });
    });

    it('sends each path separately for path-sensitive hosts', async () => {
      const urls = ['https://ipfs.io/ipfs/AAA', 'https://ipfs.io/ipfs/BBB'];
      nock(PHISHING_DETECTION_BASE_URL)
        .post(`/${PHISHING_DETECTION_BULK_SCAN_ENDPOINT}`, { urls })
        .reply(200, {
          results: {
            [urls[0]]: { hostname: urls[0], recommendedAction: 'NONE' },
            [urls[1]]: { hostname: urls[1], recommendedAction: 'BLOCK' },
          },
          errors: {},
        });
      const { rootMessenger } = createService();

      const response = await rootMessenger.call(
        'PhishingDataService:bulkScanUrls',
        urls,
      );

      // Both paths must be scanned; they must not share one verdict.
      expect(response.results[urls[0]].recommendedAction).toBe('NONE');
      expect(response.results[urls[1]].recommendedAction).toBe('BLOCK');
    });

    it('reports invalid URLs without calling the API', async () => {
      const { rootMessenger } = createService();

      const response = await rootMessenger.call(
        'PhishingDataService:bulkScanUrls',
        ['not-a-url'],
      );

      expect(response).toStrictEqual({
        results: {},
        errors: { 'not-a-url': ['url is not a valid web URL'] },
      });
    });

    it('does not cache URLs the API reported an error for', async () => {
      const scope = nock(PHISHING_DETECTION_BASE_URL)
        .post(`/${PHISHING_DETECTION_BULK_SCAN_ENDPOINT}`)
        .times(2)
        .reply(200, {
          results: {},
          errors: { 'https://example1.com': ['upstream failure'] },
        });
      const { rootMessenger } = createService();

      const first = await rootMessenger.call(
        'PhishingDataService:bulkScanUrls',
        ['https://example1.com'],
      );
      const second = await rootMessenger.call(
        'PhishingDataService:bulkScanUrls',
        ['https://example1.com'],
      );

      // The error must be reported both times rather than being cached as a
      // silent "no result" for the stale time.
      expect(first.errors['https://example1.com']).toStrictEqual([
        'upstream failure',
      ]);
      expect(second.errors['https://example1.com']).toStrictEqual([
        'upstream failure',
      ]);
      expect(scope.isDone()).toBe(true);
    });

    it('does not cache URL results containing a fetch error', async () => {
      const blockedUrl = 'https://blocked.com';
      const failedUrl = 'https://failed.com';
      const scope = nock(PHISHING_DETECTION_BASE_URL)
        .post(`/${PHISHING_DETECTION_BULK_SCAN_ENDPOINT}`, {
          urls: [blockedUrl, failedUrl],
        })
        .reply(200, {
          results: {
            [blockedUrl]: {
              hostname: 'blocked.com',
              recommendedAction: 'BLOCK',
            },
            [failedUrl]: {
              hostname: 'failed.com',
              recommendedAction: 'NONE',
              fetchError: 'detector unavailable',
            },
          },
          errors: {},
        })
        .post(`/${PHISHING_DETECTION_BULK_SCAN_ENDPOINT}`, {
          urls: [failedUrl],
        })
        .reply(200, {
          results: {
            [failedUrl]: {
              hostname: 'failed.com',
              recommendedAction: 'WARN',
            },
          },
          errors: {},
        });
      const { rootMessenger } = createService();

      const first = await rootMessenger.call(
        'PhishingDataService:bulkScanUrls',
        [blockedUrl, failedUrl],
      );
      const second = await rootMessenger.call(
        'PhishingDataService:bulkScanUrls',
        [blockedUrl, failedUrl],
      );

      expect(first).toStrictEqual({
        results: {
          [blockedUrl]: {
            hostname: 'blocked.com',
            recommendedAction: 'BLOCK',
          },
        },
        errors: { [failedUrl]: ['detector unavailable'] },
      });
      expect(second).toStrictEqual({
        results: {
          [blockedUrl]: {
            hostname: 'blocked.com',
            recommendedAction: 'BLOCK',
          },
          [failedUrl]: {
            hostname: 'failed.com',
            recommendedAction: 'WARN',
          },
        },
        errors: {},
      });
      expect(scope.isDone()).toBe(true);
    });

    it('does not cache a URL omitted from the API response', async () => {
      const scope = nock(PHISHING_DETECTION_BASE_URL)
        .post(`/${PHISHING_DETECTION_BULK_SCAN_ENDPOINT}`)
        .times(2)
        .reply(200, { results: {}, errors: {} });
      const { rootMessenger } = createService();

      const first = await rootMessenger.call(
        'PhishingDataService:bulkScanUrls',
        ['https://example1.com'],
      );
      const second = await rootMessenger.call(
        'PhishingDataService:bulkScanUrls',
        ['https://example1.com'],
      );

      expect(first.errors['https://example1.com']).toStrictEqual([
        'No result returned by bulk URL scan endpoint',
      ]);
      expect(second.errors['https://example1.com']).toStrictEqual([
        'No result returned by bulk URL scan endpoint',
      ]);
      expect(scope.isDone()).toBe(true);
    });

    it('keeps fresh cached results when another lookup fails', async () => {
      nock(PHISHING_DETECTION_BASE_URL)
        .post(`/${PHISHING_DETECTION_BULK_SCAN_ENDPOINT}`)
        .reply(200, {
          results: {
            'https://blocked.com': {
              hostname: 'blocked.com',
              recommendedAction: 'BLOCK',
            },
          },
          errors: {},
        });
      const { rootMessenger } = createService();

      await rootMessenger.call('PhishingDataService:bulkScanUrls', [
        'https://blocked.com',
      ]);

      nock(PHISHING_DETECTION_BASE_URL)
        .post(`/${PHISHING_DETECTION_BULK_SCAN_ENDPOINT}`)
        .reply(500, 'boom');

      const response = await rootMessenger.call(
        'PhishingDataService:bulkScanUrls',
        ['https://blocked.com', 'https://uncached.com'],
      );

      expect(response.results['https://blocked.com'].recommendedAction).toBe(
        'BLOCK',
      );
      expect(response.errors['https://uncached.com']).toStrictEqual([
        '500 Internal Server Error',
      ]);
    });

    it('rejects when no URL could be resolved', async () => {
      nock(PHISHING_DETECTION_BASE_URL)
        .post(`/${PHISHING_DETECTION_BULK_SCAN_ENDPOINT}`)
        .reply(500, 'boom');
      const { rootMessenger } = createService();

      await expect(
        rootMessenger.call('PhishingDataService:bulkScanUrls', [
          'https://example1.com',
        ]),
      ).rejects.toThrow('500 Internal Server Error');
    });
  });

  describe('bulkScanTokens', () => {
    it('retries a failed batch as a whole when retries are enabled', async () => {
      const batchSizes: number[] = [];
      nock(SECURITY_ALERTS_BASE_URL)
        .post(TOKEN_BULK_SCANNING_ENDPOINT)
        .times(3)
        .reply(function (_uri, body) {
          batchSizes.push((body as { tokens: string[] }).tokens.length);
          return [500, 'boom'];
        });
      const { rootMessenger } = createService({
        options: {
          policyOptions: { maxRetries: 2, backoff: new ConstantBackoff(0) },
        },
      });

      await expect(
        rootMessenger.call('PhishingDataService:bulkScanTokens', 'ethereum', [
          '0x1234567890123456789012345678901234567890',
          '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        ]),
      ).rejects.toThrow('500 Internal Server Error');
      expect(batchSizes).toStrictEqual([2, 2, 2]);
    });

    it('lowercases EVM token addresses and keys results by the normalized address', async () => {
      const lower = '0xabcdef0000000000000000000000000000000001';
      nock(SECURITY_ALERTS_BASE_URL)
        .post(TOKEN_BULK_SCANNING_ENDPOINT, {
          chain: 'ethereum',
          tokens: [lower],
        })
        .reply(200, { results: { [lower]: { result_type: 'Malicious' } } });
      const { rootMessenger } = createService();

      expect(
        await rootMessenger.call(
          'PhishingDataService:bulkScanTokens',
          'ethereum',
          ['0xAbCdEf0000000000000000000000000000000001'],
        ),
      ).toStrictEqual({ results: { [lower]: { result_type: 'Malicious' } } });
    });

    it('returns the scan results from the API', async () => {
      const tokens = ['0x1234567890123456789012345678901234567890'];
      const apiResponse = {
        results: {
          [tokens[0]]: { result_type: 'Benign' },
        },
      };
      nock(SECURITY_ALERTS_BASE_URL)
        .post(TOKEN_BULK_SCANNING_ENDPOINT, { chain: 'ethereum', tokens })
        .reply(200, apiResponse);
      const { rootMessenger } = createService();

      const response = await rootMessenger.call(
        'PhishingDataService:bulkScanTokens',
        'ethereum',
        tokens,
      );

      expect(response).toStrictEqual(apiResponse);
    });

    it('accepts the Verified verdict returned by the token API', async () => {
      const token = '0x1234567890123456789012345678901234567890';
      const apiResponse = {
        results: {
          [token]: { result_type: 'Verified' },
        },
      };
      nock(SECURITY_ALERTS_BASE_URL)
        .post(TOKEN_BULK_SCANNING_ENDPOINT, {
          chain: 'ethereum',
          tokens: [token],
        })
        .reply(200, apiResponse);
      const { rootMessenger } = createService();

      expect(
        await rootMessenger.call(
          'PhishingDataService:bulkScanTokens',
          'ethereum',
          [token],
        ),
      ).toStrictEqual(apiResponse);
    });

    it('preserves cached results when an uncached token fails', async () => {
      const cachedToken = '0x1234567890123456789012345678901234567890';
      const uncachedToken = '0x0987654321098765432109876543210987654321';
      const cachedResult = { result_type: 'Malicious' };
      nock(SECURITY_ALERTS_BASE_URL)
        .post(TOKEN_BULK_SCANNING_ENDPOINT, {
          chain: 'ethereum',
          tokens: [cachedToken],
        })
        .reply(200, {
          results: {
            [cachedToken]: cachedResult,
          },
        });
      const { rootMessenger } = createService();
      await rootMessenger.call(
        'PhishingDataService:scanToken',
        'ethereum',
        cachedToken,
      );

      nock(SECURITY_ALERTS_BASE_URL)
        .post(TOKEN_BULK_SCANNING_ENDPOINT, {
          chain: 'ethereum',
          tokens: [uncachedToken],
        })
        .reply(500, 'boom');

      const response = await rootMessenger.call(
        'PhishingDataService:bulkScanTokens',
        'ethereum',
        [cachedToken, uncachedToken],
      );

      expect(response).toStrictEqual({
        results: {
          [cachedToken]: cachedResult,
        },
      });
    });

    it('accepts a response without a results field', async () => {
      nock(SECURITY_ALERTS_BASE_URL)
        .post(TOKEN_BULK_SCANNING_ENDPOINT)
        .reply(200, {});
      const { rootMessenger } = createService();

      const response = await rootMessenger.call(
        'PhishingDataService:bulkScanTokens',
        'ethereum',
        ['0x1234567890123456789012345678901234567890'],
      );

      expect(response).toStrictEqual({ results: {} });
    });

    it('omits a malformed result for that token and keeps the others', async () => {
      nock(SECURITY_ALERTS_BASE_URL)
        .post(TOKEN_BULK_SCANNING_ENDPOINT)
        .reply(200, {
          results: {
            '0x1234567890123456789012345678901234567890': {},
            '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd': {
              result_type: 'Malicious',
            },
          },
        });
      const { rootMessenger } = createService();

      const response = await rootMessenger.call(
        'PhishingDataService:bulkScanTokens',
        'ethereum',
        [
          '0x1234567890123456789012345678901234567890',
          '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        ],
      );

      expect(response).toStrictEqual({
        results: {
          '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd': {
            result_type: 'Malicious',
          },
        },
      });
    });

    it('throws if every result in the batch is malformed', async () => {
      nock(SECURITY_ALERTS_BASE_URL)
        .post(TOKEN_BULK_SCANNING_ENDPOINT)
        .reply(200, {
          results: { '0x1234567890123456789012345678901234567890': {} },
        });
      const { rootMessenger } = createService();

      await expect(
        rootMessenger.call('PhishingDataService:bulkScanTokens', 'ethereum', [
          '0x1234567890123456789012345678901234567890',
        ]),
      ).rejects.toThrow(
        'Malformed result returned by bulk token scan endpoint',
      );
    });

    it('throws if the API returns a malformed response', async () => {
      nock(SECURITY_ALERTS_BASE_URL)
        .post(TOKEN_BULK_SCANNING_ENDPOINT)
        .reply(200, { results: 'nope' });
      const { rootMessenger } = createService();

      await expect(
        rootMessenger.call('PhishingDataService:bulkScanTokens', 'ethereum', [
          '0x1234567890123456789012345678901234567890',
        ]),
      ).rejects.toThrow(
        'Malformed response received from bulk token scan endpoint',
      );
    });
  });

  describe('scanToken', () => {
    it('lowercases EVM token addresses in the request and cache key', async () => {
      const lower = '0xabcdef0000000000000000000000000000000001';
      nock(SECURITY_ALERTS_BASE_URL)
        .post(TOKEN_BULK_SCANNING_ENDPOINT, {
          chain: 'ethereum',
          tokens: [lower],
        })
        .reply(200, { results: { [lower]: { result_type: 'Malicious' } } });
      const { rootMessenger } = createService();

      const first = await rootMessenger.call(
        'PhishingDataService:scanToken',
        'ethereum',
        '0xAbCdEf0000000000000000000000000000000001',
      );
      // No second interceptor is registered, so this must be a cache hit.
      const second = await rootMessenger.call(
        'PhishingDataService:scanToken',
        'ethereum',
        lower,
      );

      expect(first).toStrictEqual({ result_type: 'Malicious' });
      expect(second).toStrictEqual({ result_type: 'Malicious' });
    });

    it('preserves the casing of non-EVM token addresses', async () => {
      const solanaToken = 'So11111111111111111111111111111111111111112';
      nock(SECURITY_ALERTS_BASE_URL)
        .post(TOKEN_BULK_SCANNING_ENDPOINT, {
          chain: 'solana',
          tokens: [solanaToken],
        })
        .reply(200, { results: { [solanaToken]: { result_type: 'Benign' } } });
      const { rootMessenger } = createService();

      expect(
        await rootMessenger.call(
          'PhishingDataService:scanToken',
          'solana',
          solanaToken,
        ),
      ).toStrictEqual({ result_type: 'Benign' });
    });

    it('returns the scan result for a single token from the bulk API', async () => {
      const token = '0x1234567890123456789012345678901234567890';
      nock(SECURITY_ALERTS_BASE_URL)
        .post(TOKEN_BULK_SCANNING_ENDPOINT, {
          chain: 'ethereum',
          tokens: [token],
        })
        .reply(200, {
          results: {
            [token]: { result_type: 'Benign' },
          },
        });
      const { rootMessenger } = createService();

      const response = await rootMessenger.call(
        'PhishingDataService:scanToken',
        'ethereum',
        token,
      );

      expect(response).toStrictEqual({ result_type: 'Benign' });
    });

    it('returns null if the API returned no result for the token', async () => {
      const token = '0x1234567890123456789012345678901234567890';
      nock(SECURITY_ALERTS_BASE_URL)
        .post(TOKEN_BULK_SCANNING_ENDPOINT)
        .reply(200, { results: {} });
      const { rootMessenger } = createService();

      const response = await rootMessenger.call(
        'PhishingDataService:scanToken',
        'ethereum',
        token,
      );

      expect(response).toBeNull();
    });

    it('shares cached results with bulkScanTokens', async () => {
      const token = '0x1234567890123456789012345678901234567890';
      nock(SECURITY_ALERTS_BASE_URL)
        .post(TOKEN_BULK_SCANNING_ENDPOINT, {
          chain: 'ethereum',
          tokens: [token],
        })
        .reply(200, {
          results: {
            [token]: { result_type: 'Malicious' },
          },
        });
      const { rootMessenger } = createService();

      await rootMessenger.call(
        'PhishingDataService:bulkScanTokens',
        'ethereum',
        [token],
      );

      // Served from the cache; there is no remaining nock interceptor, so a
      // fetch would throw.
      const response = await rootMessenger.call(
        'PhishingDataService:scanToken',
        'ethereum',
        token,
      );

      expect(response).toStrictEqual({ result_type: 'Malicious' });
    });
  });

  describe('batching', () => {
    it('splits large token batches into requests of up to 100 tokens', async () => {
      const tokens = Array.from(
        { length: 120 },
        (_, index) => `0x${index.toString().padStart(40, '0')}`,
      );
      const firstChunk = tokens.slice(0, 100);
      const secondChunk = tokens.slice(100);
      const buildResults = (chunk: string[]): TokenScanApiResponse['results'] =>
        Object.fromEntries(
          chunk.map((token) => [
            token,
            { result_type: TokenScanResultType.Benign },
          ]),
        );

      const scope = nock(SECURITY_ALERTS_BASE_URL)
        .post(TOKEN_BULK_SCANNING_ENDPOINT, {
          chain: 'ethereum',
          tokens: firstChunk,
        })
        .reply(200, { results: buildResults(firstChunk) })
        .post(TOKEN_BULK_SCANNING_ENDPOINT, {
          chain: 'ethereum',
          tokens: secondChunk,
        })
        .reply(200, { results: buildResults(secondChunk) });
      const { rootMessenger } = createService();

      const response = await rootMessenger.call(
        'PhishingDataService:bulkScanTokens',
        'ethereum',
        tokens,
      );

      expect(scope.isDone()).toBe(true);
      expect(Object.keys(response.results ?? {})).toHaveLength(120);
    });

    it('coalesces retried queries into a new batched request', async () => {
      const token = '0x1234567890123456789012345678901234567890';
      const scope = nock(SECURITY_ALERTS_BASE_URL)
        .post(TOKEN_BULK_SCANNING_ENDPOINT)
        .reply(500)
        .post(TOKEN_BULK_SCANNING_ENDPOINT)
        .reply(200, {
          results: {
            [token]: { result_type: 'Benign' },
          },
        });
      const { rootMessenger } = createService({
        options: {
          policyOptions: { maxRetries: 1, backoff: new ConstantBackoff(0) },
        },
      });

      const response = await rootMessenger.call(
        'PhishingDataService:scanToken',
        'ethereum',
        token,
      );

      expect(scope.isDone()).toBe(true);
      expect(response).toStrictEqual({ result_type: 'Benign' });
    });
  });

  describe('scanAddress', () => {
    it('lowercases EVM addresses in the request and cache key', async () => {
      const lower = '0xabcdef0000000000000000000000000000000001';
      nock(SECURITY_ALERTS_BASE_URL)
        .post(ADDRESS_SCAN_ENDPOINT, { chain: 'ethereum', address: lower })
        .reply(200, { result_type: 'Malicious', label: 'bad' });
      const { rootMessenger } = createService();

      const first = await rootMessenger.call(
        'PhishingDataService:scanAddress',
        'ethereum',
        '0xAbCdEf0000000000000000000000000000000001',
      );
      // No second interceptor is registered, so this must be a cache hit.
      const second = await rootMessenger.call(
        'PhishingDataService:scanAddress',
        'ethereum',
        lower,
      );

      expect(first).toStrictEqual({ result_type: 'Malicious', label: 'bad' });
      expect(second).toStrictEqual({ result_type: 'Malicious', label: 'bad' });
    });

    it('returns the scan result from the API', async () => {
      nock(SECURITY_ALERTS_BASE_URL)
        .post(ADDRESS_SCAN_ENDPOINT, {
          chain: 'ethereum',
          address: '0x1234567890123456789012345678901234567890',
        })
        .reply(200, { result_type: 'Benign', label: '' });
      const { rootMessenger } = createService();

      const response = await rootMessenger.call(
        'PhishingDataService:scanAddress',
        'ethereum',
        '0x1234567890123456789012345678901234567890',
      );

      expect(response).toStrictEqual({ result_type: 'Benign', label: '' });
    });

    it.each(['Verified', 'Trusted', 'Error'])(
      'accepts the %s verdict returned by the address API',
      async (resultType) => {
        nock(SECURITY_ALERTS_BASE_URL)
          .post(ADDRESS_SCAN_ENDPOINT)
          .reply(200, { result_type: resultType, label: '' });
        const { rootMessenger } = createService();

        expect(
          await rootMessenger.call(
            'PhishingDataService:scanAddress',
            'ethereum',
            '0x1234567890123456789012345678901234567890',
          ),
        ).toStrictEqual({ result_type: resultType, label: '' });
      },
    );

    it('throws if the API returns a malformed response', async () => {
      nock(SECURITY_ALERTS_BASE_URL)
        .post(ADDRESS_SCAN_ENDPOINT)
        .reply(200, { result_type: 'Benign' });
      const { rootMessenger } = createService();

      await expect(
        rootMessenger.call(
          'PhishingDataService:scanAddress',
          'ethereum',
          '0x1234567890123456789012345678901234567890',
        ),
      ).rejects.toThrow(
        'Malformed response received from address scan endpoint',
      );
    });
  });

  describe('getApprovals', () => {
    it('returns the approvals from the API without caching them', async () => {
      const firstResponse = { approvals: [] };
      const secondResponse = {
        approvals: [
          {
            allowance: {},
            asset: {
              address: '0xtoken',
              symbol: 'TKN',
              name: 'Token',
              decimals: 18,
            },
            exposure: {
              value: '100',
              raw_value: '100000000000000000000',
            },
            spender: {
              address: '0xspender',
            },
            verdict: 'Verified',
          },
        ],
      };
      nock(SECURITY_ALERTS_BASE_URL)
        .post(APPROVALS_ENDPOINT, {
          chain: 'ethereum',
          address: '0x1234567890123456789012345678901234567890',
        })
        .reply(200, firstResponse)
        .post(APPROVALS_ENDPOINT, {
          chain: 'ethereum',
          address: '0x1234567890123456789012345678901234567890',
        })
        .reply(200, secondResponse);
      const { rootMessenger } = createService();

      const response1 = await rootMessenger.call(
        'PhishingDataService:getApprovals',
        'ethereum',
        '0x1234567890123456789012345678901234567890',
      );
      const response2 = await rootMessenger.call(
        'PhishingDataService:getApprovals',
        'ethereum',
        '0x1234567890123456789012345678901234567890',
      );

      expect(response1).toStrictEqual(firstResponse);
      expect(response2).toStrictEqual(secondResponse);
    });

    it('applies the configured service policy', async () => {
      const scope = nock(SECURITY_ALERTS_BASE_URL)
        .post(APPROVALS_ENDPOINT)
        .reply(500)
        .post(APPROVALS_ENDPOINT)
        .reply(200, { approvals: [] });
      const { rootMessenger } = createService({
        options: {
          policyOptions: { maxRetries: 1, backoff: new ConstantBackoff(0) },
        },
      });

      expect(
        await rootMessenger.call(
          'PhishingDataService:getApprovals',
          'ethereum',
          '0x1234567890123456789012345678901234567890',
        ),
      ).toStrictEqual({ approvals: [] });
      expect(scope.isDone()).toBe(true);
    });

    it('omits malformed approvals and keeps valid ones', async () => {
      const validApproval = {
        allowance: {},
        asset: {
          address: '0xtoken',
          symbol: 'TKN',
          name: 'Token',
          decimals: 18,
        },
        exposure: { value: '100', raw_value: '100000000000000000000' },
        spender: { address: '0xspender' },
        verdict: 'Malicious',
      };
      nock(SECURITY_ALERTS_BASE_URL)
        .post(APPROVALS_ENDPOINT)
        .reply(200, {
          approvals: [
            validApproval,
            { ...validApproval, asset: { ...validApproval.asset, name: null } },
          ],
        });
      const { rootMessenger } = createService();

      expect(
        await rootMessenger.call(
          'PhishingDataService:getApprovals',
          'ethereum',
          '0x1234567890123456789012345678901234567890',
        ),
      ).toStrictEqual({ approvals: [validApproval] });
    });

    it('throws if the API returns a malformed response', async () => {
      nock(SECURITY_ALERTS_BASE_URL)
        .post(APPROVALS_ENDPOINT)
        .reply(200, { approvals: 'nope' });
      const { rootMessenger } = createService();

      await expect(
        rootMessenger.call(
          'PhishingDataService:getApprovals',
          'ethereum',
          '0x1234567890123456789012345678901234567890',
        ),
      ).rejects.toThrow('Malformed response received from approvals endpoint');
    });
  });

  describe('persistence', () => {
    it('persists the query cache using the StorageService by default', async () => {
      jest.useFakeTimers({
        doNotFake: ['nextTick', 'queueMicrotask'],
        now: 1_000_000,
      });
      nock(PHISHING_DETECTION_BASE_URL)
        .get(`/${PHISHING_DETECTION_SCAN_ENDPOINT}`)
        .query({ url: 'example.com' })
        .reply(200, { recommendedAction: 'NONE' });

      const setItem = jest.fn();
      const { rootMessenger } = createService({
        options: { persistenceConfig: undefined },
        setItemMock: setItem,
      });

      await rootMessenger.call('PhishingDataService:scanUrl', 'example.com');

      // The persistence write is debounced; advance past the write delay.
      jest.advanceTimersByTime(15_000);
      await flushPromises();

      expect(setItem).toHaveBeenCalledWith(
        'PhishingDataService',
        'cache',
        expect.objectContaining({
          timestamp: expect.any(Number),
          state: expect.any(Object),
        }),
      );
    });

    it('does not persist fetched lists', async () => {
      jest.useFakeTimers({
        doNotFake: ['nextTick', 'queueMicrotask'],
        now: 1_000_000,
      });
      nock(PHISHING_CONFIG_BASE_URL)
        .get(METAMASK_STALELIST_FILE)
        .reply(200, STALELIST_RESPONSE);
      nock(PHISHING_DETECTION_BASE_URL)
        .get(`/${PHISHING_DETECTION_SCAN_ENDPOINT}`)
        .query({ url: 'example.com' })
        .reply(200, { recommendedAction: 'NONE' });

      const setItem = jest.fn();
      const { rootMessenger } = createService({
        options: { persistenceConfig: undefined },
        setItemMock: setItem,
      });

      await rootMessenger.call('PhishingDataService:getStalelist');
      await rootMessenger.call('PhishingDataService:scanUrl', 'example.com');

      jest.advanceTimersByTime(15_000);
      await flushPromises();

      const written = JSON.stringify(setItem.mock.calls.at(-1)?.[2]);
      // The scan result is persisted, but the (multi-megabyte) list is not.
      expect(written).toContain('scanUrl');
      expect(written).not.toContain('phishing.example.com');
    });

    it('rehydrates the cache from the StorageService on init', async () => {
      jest.useFakeTimers({
        doNotFake: ['nextTick', 'queueMicrotask'],
        now: 1_000_000,
      });
      nock(PHISHING_DETECTION_BASE_URL)
        .get(`/${PHISHING_DETECTION_SCAN_ENDPOINT}`)
        .query({ url: 'example.com' })
        .reply(200, { recommendedAction: 'NONE' });

      // Populate a cache using one service, then hand it to a second one.
      const setItem = jest.fn();
      const { rootMessenger: firstMessenger } = createService({
        options: { persistenceConfig: undefined },
        setItemMock: setItem,
      });
      await firstMessenger.call('PhishingDataService:scanUrl', 'example.com');

      jest.advanceTimersByTime(15_000);
      await flushPromises();

      const persisted = setItem.mock.calls.at(-1)?.[2];
      expect(persisted).toBeDefined();

      let resolveGetItem:
        | ((value: { result: typeof persisted }) => void)
        | undefined;
      const getItem = jest.fn(
        () =>
          new Promise<{ result: typeof persisted }>((resolve) => {
            resolveGetItem = resolve;
          }),
      );
      const { rootMessenger: secondMessenger, service } = createService({
        options: {
          persistenceConfig: undefined,
          queryClientConfig: {
            defaultOptions: { queries: { gcTime: Infinity } },
          },
        },
        setItemMock: jest.fn(),
        getItemMock: getItem,
      });
      service.init();

      const networkScope = nock(PHISHING_DETECTION_BASE_URL)
        .get(`/${PHISHING_DETECTION_SCAN_ENDPOINT}`)
        .query({ url: 'example.com' })
        .reply(200, { recommendedAction: 'BLOCK' });
      const resultPromise = secondMessenger.call(
        'PhishingDataService:scanUrl',
        'example.com',
      );
      await flushPromises();
      expect(networkScope.isDone()).toBe(false);

      resolveGetItem?.({ result: persisted });
      const result = await resultPromise;
      expect(result).toStrictEqual({
        hostname: 'example.com',
        recommendedAction: 'NONE',
      });
      expect(networkScope.isDone()).toBe(false);

      jest.advanceTimersByTime(SCAN_RESULT_GC_TIME + 1);
      await flushPromises();

      expect(
        await secondMessenger.call(
          'PhishingDataService:scanUrl',
          'example.com',
        ),
      ).toStrictEqual({
        hostname: 'example.com',
        recommendedAction: 'BLOCK',
      });
      expect(networkScope.isDone()).toBe(true);
    });

    it('discards and removes a persisted cache older than maxAge', async () => {
      const removeItem = jest.fn();
      const getItem = jest.fn().mockResolvedValue({
        result: {
          timestamp: Date.now() - inMilliseconds(10, Duration.Minute),
          state: { queries: [], mutations: [] },
        },
      });
      const { service } = createService({
        options: { persistenceConfig: undefined },
        setItemMock: jest.fn(),
        getItemMock: getItem,
        removeItemMock: removeItem,
      });

      service.init();
      await flushPromises();

      expect(getItem).toHaveBeenCalledWith('PhishingDataService', 'cache');
      expect(removeItem).toHaveBeenCalledWith('PhishingDataService', 'cache');
    });

    it('discards persisted scan results that fail validation or belong to unknown queries', async () => {
      const now = Date.now();
      const dehydratedQuery = (
        queryKey: unknown[],
        data: unknown,
      ): Record<string, unknown> => ({
        queryHash: JSON.stringify(queryKey),
        queryKey,
        state: {
          data,
          dataUpdateCount: 1,
          dataUpdatedAt: now,
          error: null,
          errorUpdateCount: 0,
          errorUpdatedAt: 0,
          fetchFailureCount: 0,
          fetchFailureReason: null,
          fetchMeta: null,
          fetchStatus: 'idle',
          isInvalidated: false,
          status: 'success',
        },
      });
      const getItem = jest.fn().mockResolvedValue({
        result: {
          timestamp: now,
          state: {
            mutations: [],
            queries: [
              dehydratedQuery(['PhishingDataService:scanUrl', 'good.com'], {
                hostname: 'good.com',
                recommendedAction: 'BLOCK',
              }),
              dehydratedQuery(['PhishingDataService:scanUrl', 'evil.com'], {
                hostname: 'evil.com',
                recommendedAction: 'PWNED',
              }),
              dehydratedQuery(
                ['PhishingDataService:scanToken', 'ethereum', '0xabc'],
                null,
              ),
              dehydratedQuery(
                ['PhishingDataService:scanToken', 'ethereum', '0xdef'],
                { result_type: 'Malicious' },
              ),
              dehydratedQuery(
                ['PhishingDataService:scanAddress', 'ethereum', '0xabc'],
                { result_type: 'Benign' },
              ),
              dehydratedQuery(['PhishingDataService:getStalelist'], {
                data: {},
              }),
            ],
          },
        },
      });
      const evilScope = nock(PHISHING_DETECTION_BASE_URL)
        .get(`/${PHISHING_DETECTION_SCAN_ENDPOINT}`)
        .query({ url: 'evil.com' })
        .reply(200, { recommendedAction: 'BLOCK' });
      const { rootMessenger, messenger, service } = createService({
        options: { persistenceConfig: undefined },
        setItemMock: jest.fn(),
        getItemMock: getItem,
      });
      const publishSpy = jest.spyOn(messenger, 'publish');
      service.init();
      await flushPromises();

      const hydratedEvents = publishSpy.mock.calls
        .map(([eventType]) => String(eventType))
        .filter((eventType) =>
          eventType.startsWith('PhishingDataService:cacheUpdated:'),
        );
      expect(hydratedEvents).toStrictEqual([
        'PhishingDataService:cacheUpdated:["PhishingDataService:scanUrl","good.com"]',
        'PhishingDataService:cacheUpdated:["PhishingDataService:scanToken","ethereum","0xabc"]',
        'PhishingDataService:cacheUpdated:["PhishingDataService:scanToken","ethereum","0xdef"]',
      ]);

      expect(
        await rootMessenger.call('PhishingDataService:scanUrl', 'good.com'),
      ).toStrictEqual({ hostname: 'good.com', recommendedAction: 'BLOCK' });
      expect(
        await rootMessenger.call('PhishingDataService:scanUrl', 'evil.com'),
      ).toStrictEqual({ hostname: 'evil.com', recommendedAction: 'BLOCK' });
      expect(evilScope.isDone()).toBe(true);
    });

    it('composes a caller-provided shouldHydrateQuery with the built-in validation', async () => {
      const shouldHydrateQuery = jest.fn(() => false);
      const getItem = jest.fn().mockResolvedValue({
        result: {
          timestamp: Date.now(),
          state: {
            mutations: [],
            queries: [
              {
                queryHash: '["PhishingDataService:scanUrl","good.com"]',
                queryKey: ['PhishingDataService:scanUrl', 'good.com'],
                state: {
                  data: { hostname: 'good.com', recommendedAction: 'BLOCK' },
                  dataUpdateCount: 1,
                  dataUpdatedAt: Date.now(),
                  error: null,
                  errorUpdateCount: 0,
                  errorUpdatedAt: 0,
                  fetchFailureCount: 0,
                  fetchFailureReason: null,
                  fetchMeta: null,
                  fetchStatus: 'idle',
                  isInvalidated: false,
                  status: 'success',
                },
              },
            ],
          },
        },
      });
      const { messenger, service } = createService({
        options: {
          persistenceConfig: {
            maxAge: inMilliseconds(5, Duration.Minute),
            shouldHydrateQuery,
          },
        },
        setItemMock: jest.fn(),
        getItemMock: getItem,
      });
      const publishSpy = jest.spyOn(messenger, 'publish');
      service.init();
      await flushPromises();

      expect(shouldHydrateQuery).toHaveBeenCalledTimes(1);
      expect(publishSpy).not.toHaveBeenCalled();
    });

    it('proceeds with a scan when rehydration hangs past the hydration timeout', async () => {
      jest.useFakeTimers({
        doNotFake: ['nextTick', 'queueMicrotask'],
        now: 1_000_000,
      });
      const scope = nock(PHISHING_DETECTION_BASE_URL)
        .get(`/${PHISHING_DETECTION_SCAN_ENDPOINT}`)
        .query({ url: 'example.com' })
        .reply(200, { recommendedAction: 'BLOCK' });
      const { rootMessenger, service } = createService({
        options: { persistenceConfig: undefined },
        setItemMock: jest.fn(),
        getItemMock: jest.fn(() => new Promise(() => undefined)),
      });
      service.init();

      const resultPromise = rootMessenger.call(
        'PhishingDataService:scanUrl',
        'example.com',
      );
      await flushPromises();
      expect(scope.isDone()).toBe(false);

      jest.advanceTimersByTime(DEFAULT_HYDRATION_TIMEOUT);

      expect(await resultPromise).toStrictEqual({
        hostname: 'example.com',
        recommendedAction: 'BLOCK',
      });
      expect(scope.isDone()).toBe(true);
    });
  });

  describe('retry policy', () => {
    it('does not retry failed requests by default', async () => {
      let attempts = 0;
      nock(PHISHING_DETECTION_BASE_URL)
        .get(`/${PHISHING_DETECTION_SCAN_ENDPOINT}`)
        .query({ url: 'example.com' })
        .times(5)
        .reply(() => {
          attempts += 1;
          return [500, 'boom'];
        });
      // Build the service without the test helper's `maxRetries: 0` override
      // so that the shipped defaults are what is exercised here.
      const { rootMessenger } = createService({
        options: { policyOptions: {} },
      });

      await expect(
        rootMessenger.call('PhishingDataService:scanUrl', 'example.com'),
      ).rejects.toThrow('500 Internal Server Error');
      expect(attempts).toBe(1);
    });
  });

  describe('direct method calls', () => {
    it('does the same thing as the messenger action', async () => {
      nock(PHISHING_CONFIG_BASE_URL)
        .get(METAMASK_STALELIST_FILE)
        .reply(200, STALELIST_RESPONSE);
      const { service } = createService();

      const response = await service.getStalelist();

      expect(response).toStrictEqual(STALELIST_RESPONSE);
    });
  });
});

/**
 * The type of the messenger populated with all external actions and events
 * required by the service under test.
 */
type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<PhishingDataServiceMessenger>,
  MessengerEvents<PhishingDataServiceMessenger>
>;

/**
 * Constructs the messenger populated with all external actions and events
 * required by the service under test.
 *
 * @returns The root messenger.
 */
function createRootMessenger(): RootMessenger {
  return new Messenger({ namespace: MOCK_ANY_NAMESPACE });
}

/**
 * Constructs the service under test.
 *
 * @param args - The arguments to this function.
 * @param args.options - The options that the service constructor takes. All
 * are optional and will be filled in with defaults as needed (including
 * `messenger`).
 * @param args.setItemMock - Optional mock `StorageService:setItem` handler to
 * register and delegate to the service messenger, enabling persistence.
 * @param args.getItemMock - Optional mock `StorageService:getItem` handler to
 * register and delegate to the service messenger, enabling rehydration.
 * @param args.removeItemMock - Optional mock `StorageService:removeItem`
 * handler to register and delegate to the service messenger.
 * @returns The new service, root messenger, and service messenger.
 */
function createService({
  options = {},
  setItemMock,
  getItemMock,
  removeItemMock,
}: {
  options?: Partial<ConstructorParameters<typeof PhishingDataService>[0]>;
  setItemMock?: jest.Mock;
  getItemMock?: jest.Mock;
  removeItemMock?: jest.Mock;
} = {}): {
  service: PhishingDataService;
  rootMessenger: RootMessenger;
  messenger: PhishingDataServiceMessenger;
} {
  const rootMessenger = createRootMessenger();
  const messenger: PhishingDataServiceMessenger = new Messenger({
    namespace: 'PhishingDataService',
    parent: rootMessenger,
  });
  if (setItemMock) {
    rootMessenger.registerActionHandler('StorageService:setItem', setItemMock);
    rootMessenger.delegate({
      actions: ['StorageService:setItem'],
      messenger,
    });
  }
  if (getItemMock) {
    rootMessenger.registerActionHandler('StorageService:getItem', getItemMock);
    rootMessenger.delegate({
      actions: ['StorageService:getItem'],
      messenger,
    });
  }
  if (removeItemMock) {
    rootMessenger.registerActionHandler(
      'StorageService:removeItem',
      removeItemMock,
    );
    rootMessenger.delegate({
      actions: ['StorageService:removeItem'],
      messenger,
    });
  }
  const service = new PhishingDataService({
    messenger,
    policyOptions: { maxRetries: 0 },
    persistenceConfig: null,
    ...options,
  });
  createdServices.push(service);

  return { service, rootMessenger, messenger };
}
