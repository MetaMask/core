import { ConstantBackoff } from '@metamask/base-data-service';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';
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
  SCAN_RESULT_STALE_TIME,
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
        .reply(200, { data: { lastUpdated: 'not a number' } });
      const { rootMessenger } = createService();

      await expect(
        rootMessenger.call('PhishingDataService:getStalelist'),
      ).rejects.toThrow('Malformed response received from stalelist endpoint');
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

    it('throws if the API returns a malformed response', async () => {
      nock(PHISHING_CONFIG_BASE_URL)
        .get(`${METAMASK_HOTLIST_DIFF_FILE}/1700000000`)
        .reply(200, { data: 'not an array' });
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
        lastFetchedAt: '2024-01-01T00:00:00Z',
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
        lastFetchedAt: '2024-01-01T00:00:00Z',
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

    it('throws if the API returns a malformed response', async () => {
      nock(CLIENT_SIDE_DETECION_BASE_URL)
        .get(C2_DOMAIN_BLOCKLIST_ENDPOINT)
        .reply(200, { recentlyAdded: 'not an array' });
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
      expect(response3).toStrictEqual({ recommendedAction: 'BLOCK' });
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

    it('throws if the API returns a malformed response', async () => {
      nock(PHISHING_DETECTION_BASE_URL)
        .get(`/${PHISHING_DETECTION_SCAN_ENDPOINT}`)
        .query({ url: 'example.com' })
        .reply(200, {});
      const { rootMessenger } = createService();

      await expect(
        rootMessenger.call('PhishingDataService:scanUrl', 'example.com'),
      ).rejects.toThrow('Malformed response received from URL scan endpoint');
    });
  });

  describe('bulkScanUrls', () => {
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

    it('throws if the API returns a malformed response', async () => {
      nock(PHISHING_DETECTION_BASE_URL)
        .post(`/${PHISHING_DETECTION_BULK_SCAN_ENDPOINT}`)
        .reply(200, { results: {} });
      const { rootMessenger } = createService();

      await expect(
        rootMessenger.call('PhishingDataService:bulkScanUrls', [
          'https://example1.com',
        ]),
      ).rejects.toThrow(
        'Malformed response received from bulk URL scan endpoint',
      );
    });
  });

  describe('bulkScanTokens', () => {
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

    it('throws if the API returns a malformed response', async () => {
      nock(SECURITY_ALERTS_BASE_URL)
        .post(TOKEN_BULK_SCANNING_ENDPOINT)
        .reply(200, { results: 'not a record' });
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

    it('throws if the API returns a malformed response', async () => {
      nock(SECURITY_ALERTS_BASE_URL).post(ADDRESS_SCAN_ENDPOINT).reply(200, {});
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
            asset: {},
            exposure: {},
            spender: {},
            verdict: 'Benign',
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

    it('throws if the API returns a malformed response', async () => {
      nock(SECURITY_ALERTS_BASE_URL)
        .post(APPROVALS_ENDPOINT)
        .reply(200, { approvals: 'not an array' });
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
 * @returns The new service, root messenger, and service messenger.
 */
function createService({
  options = {},
  setItemMock,
}: {
  options?: Partial<ConstructorParameters<typeof PhishingDataService>[0]>;
  setItemMock?: jest.Mock;
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
  const service = new PhishingDataService({
    messenger,
    policyOptions: { maxRetries: 0 },
    persistenceConfig: null,
    ...options,
  });
  createdServices.push(service);

  return { service, rootMessenger, messenger };
}
